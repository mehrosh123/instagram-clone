import express from 'express'
import cors from 'cors'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { checkDatabaseConnection, hasDatabaseUrl } from './db/client.js'
import { db } from './db/client.js'
import { comments, follows, likes, postImages, posts, users } from './db/schema.js'
import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm'

const app = express()
const PORT = process.env.PORT || 4000
const JWT_SECRET = process.env.JWT_SECRET || 'demo-secret-change-in-production'
const USE_POSTGRES_RUNTIME = String(process.env.USE_POSTGRES_RUNTIME || '').toLowerCase() === 'true' && hasDatabaseUrl
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const DATA_FILE = path.join(__dirname, 'data.json')

app.use(cors({ origin: ['http://localhost:5173'], credentials: true }))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

function readDb() {
  if (!fs.existsSync(DATA_FILE)) {
    const emptyDb = {
      users: [],
      posts: [],
      comments: [],
      likes: [],
      follows: [],
      stories: []
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(emptyDb, null, 2), 'utf8')
  }

  const raw = fs.readFileSync(DATA_FILE, 'utf8')
  const normalizedRaw = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw

  let db
  try {
    db = JSON.parse(normalizedRaw)
  } catch (err) {
    const fallbackDb = {
      users: [],
      posts: [],
      comments: [],
      likes: [],
      follows: [],
      stories: []
    }

    try {
      const backupPath = path.join(__dirname, `data.corrupt.${Date.now()}.json`)
      fs.writeFileSync(backupPath, normalizedRaw, 'utf8')
      fs.writeFileSync(DATA_FILE, JSON.stringify(fallbackDb, null, 2), 'utf8')
      console.error(`Recovered corrupted database file. Backup saved at ${backupPath}`)
      db = fallbackDb
    } catch (recoverErr) {
      throw new Error(`Database file is invalid JSON at ${DATA_FILE}: ${err.message}. Recovery failed: ${recoverErr.message}`)
    }
  }

  db.users = Array.isArray(db.users)
    ? db.users
      .filter(item => item && typeof item === 'object')
      .map(user => ({
        ...user,
        bio: typeof user.bio === 'string' ? user.bio : '',
        website: typeof user.website === 'string' ? user.website : '',
        profilePicture: typeof user.profilePicture === 'string' ? user.profilePicture : ''
      }))
    : []
  db.posts = Array.isArray(db.posts)
    ? db.posts
      .filter(item => item && typeof item === 'object')
      .map(post => ({
        ...post,
        images: Array.isArray(post.images)
          ? post.images
            .map(item => String(item || '').trim())
            .filter(isValidImageSource)
            .slice(0, 10)
          : []
      }))
    : []
  db.comments = Array.isArray(db.comments) ? db.comments.filter(item => item && typeof item === 'object') : []
  db.likes = Array.isArray(db.likes) ? db.likes.filter(item => item && typeof item === 'object') : []
  db.follows = Array.isArray(db.follows) ? db.follows.filter(item => item && typeof item === 'object') : []
  db.stories = Array.isArray(db.stories) ? db.stories.filter(item => item && typeof item === 'object') : []

  return db
}

function writeDb(db) {
  syncPostCounters(db)
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf8')
}

function syncPostCounters(db) {
  db.posts.forEach(post => {
    const likesCount = db.likes.filter(like => like.postId === post.id && !like.commentId).length
    const commentsCount = db.comments.filter(comment => comment.postId === post.id && !comment.deletedAt).length
    post.likesCount = likesCount
    post.commentsCount = commentsCount
  })
}

function safeUser(user) {
  const { passwordHash, ...rest } = user
  return rest
}

function toApiUserFromDb(user) {
  if (!user) return null
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    fullName: user.fullName,
    bio: user.bio || '',
    website: user.website || '',
    profilePicture: user.profilePictureUrl || '',
    isPrivate: !!user.isPrivate,
    isVerified: !!user.isVerified,
    followerCount: Number(user.followerCount || 0),
    followingCount: Number(user.followingCount || 0),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    deletedAt: user.deletedAt || null
  }
}

function toApiPostFromDb(post, images = []) {
  return {
    id: post.id,
    userId: post.userId,
    caption: post.caption || '',
    images,
    likesCount: Number(post.likesCount || 0),
    commentsCount: Number(post.commentsCount || 0),
    isEdited: !!post.isEdited,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    deletedAt: post.deletedAt || null
  }
}

function issueToken(userId) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '7d' })
}

function authRequired(req, res, next) {
  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    return res.status(401).json({ error: 'Missing token' })
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET)
    req.userId = payload.sub
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid token' })
  }
}

function canViewUserContent(viewerId, owner, db) {
  if (!owner) return false
  if (!owner.isPrivate) return true
  if (viewerId && owner.id === viewerId) return true

  return db.follows.some(
    f => f.followerId === viewerId && f.followingId === owner.id && f.status === 'accepted'
  )
}

function normalizeWebsite(value = '') {
  return String(value || '').trim().toLowerCase().replace(/\/+$/, '')
}

function normalizeBio(value = '') {
  return String(value || '').trim().toLowerCase()
}

function isValidImageSource(value) {
  if (typeof value !== 'string') return false
  const src = value.trim()
  if (!src) return false

  if (src.startsWith('http://') || src.startsWith('https://')) {
    try {
      const parsed = new URL(src)
      return parsed.protocol === 'http:' || parsed.protocol === 'https:'
    } catch {
      return false
    }
  }

  if (src.startsWith('data:image/')) {
    const marker = ';base64,'
    const markerIndex = src.indexOf(marker)
    return markerIndex > 0 && markerIndex + marker.length < src.length
  }

  return src.startsWith('blob:')
}

app.get('/api/health', async (_req, res) => {
  const dbStatus = await checkDatabaseConnection()
  res.json({
    ok: true,
    service: 'instagram-clone-backend',
    database: dbStatus.ok ? 'connected' : 'disconnected',
    databaseMessage: dbStatus.message,
    storageMode: hasDatabaseUrl ? 'postgres' : 'json-file'
  })
})

app.post('/api/auth/signup', async (req, res) => {
  try {
    const {
      email,
      username,
      password,
      fullName,
      profilePicture = '',
      bio = '',
      website = '',
      isPrivate = false
    } = req.body || {}

    if (!email || !username || !password || !fullName) {
      return res.status(400).json({ error: 'email, username, password, fullName are required' })
    }

    if (USE_POSTGRES_RUNTIME && db) {
      const normalizedEmail = String(email).trim().toLowerCase()
      const normalizedUsername = String(username).trim().toLowerCase().replace(/^@/, '')
      const trimmedBio = String(bio || '').trim()
      const normalizedBioValue = normalizeBio(trimmedBio)
      const trimmedWebsite = String(website || '').trim()
      const normalizedWebsiteValue = normalizeWebsite(trimmedWebsite)

      const existingUsers = await db
        .select()
        .from(users)
        .where(or(eq(users.email, normalizedEmail), eq(users.username, normalizedUsername)))

      if (existingUsers.some(u => u.email === normalizedEmail)) {
        return res.status(409).json({ error: 'Email already exists' })
      }
      if (existingUsers.some(u => u.username === normalizedUsername)) {
        return res.status(409).json({ error: 'Username already exists' })
      }

      if (normalizedBioValue) {
        const bioDuplicate = await db
          .select({ id: users.id, bio: users.bio })
          .from(users)
          .where(eq(users.bio, trimmedBio))
          .limit(1)
        if (bioDuplicate.length > 0) {
          return res.status(409).json({ error: 'Bio already exists. Please use a different bio.' })
        }
      }

      if (normalizedWebsiteValue) {
        const websiteCandidates = await db
          .select({ id: users.id, website: users.website })
          .from(users)
          .where(sql`lower(${users.website}) = ${normalizedWebsiteValue}`)
          .limit(1)
        if (websiteCandidates.length > 0) {
          return res.status(409).json({ error: 'Website already exists. Please use a different website.' })
        }
      }

      const passwordHash = await bcrypt.hash(String(password), 10)
      const inserted = await db
        .insert(users)
        .values({
          email: normalizedEmail,
          username: normalizedUsername,
          passwordHash,
          fullName: String(fullName).trim(),
          bio: trimmedBio,
          website: trimmedWebsite,
          profilePictureUrl: String(profilePicture || '').trim(),
          isPrivate: Boolean(isPrivate),
          updatedAt: new Date()
        })
        .returning()

      const createdUser = inserted[0]
      const token = issueToken(createdUser.id)
      return res.status(201).json({ token, user: toApiUserFromDb(createdUser) })
    }

    const db = readDb()
    const normalizedEmail = String(email).trim().toLowerCase()
    const normalizedUsername = String(username).trim().toLowerCase().replace(/^@/, '')
    const trimmedBio = String(bio || '').trim()
    const normalizedBioValue = normalizeBio(trimmedBio)
    const trimmedWebsite = String(website || '').trim()
    const normalizedWebsiteValue = normalizeWebsite(trimmedWebsite)

    if (db.users.some(u => String(u?.email || '').toLowerCase() === normalizedEmail)) {
      return res.status(409).json({ error: 'Email already exists' })
    }
    if (db.users.some(u => String(u?.username || '').toLowerCase() === normalizedUsername)) {
      return res.status(409).json({ error: 'Username already exists' })
    }
    if (normalizedBioValue && db.users.some(u => normalizeBio(u?.bio) === normalizedBioValue)) {
      return res.status(409).json({ error: 'Bio already exists. Please use a different bio.' })
    }
    if (normalizedWebsiteValue && db.users.some(u => normalizeWebsite(u?.website) === normalizedWebsiteValue)) {
      return res.status(409).json({ error: 'Website already exists. Please use a different website.' })
    }

    const passwordHash = await bcrypt.hash(String(password), 10)
    const now = new Date().toISOString()

    const user = {
      id: randomUUID(),
      email: normalizedEmail,
      username: normalizedUsername,
      passwordHash,
      fullName: String(fullName).trim(),
      bio: trimmedBio,
      website: trimmedWebsite,
      profilePicture: String(profilePicture),
      isPrivate: Boolean(isPrivate),
      isVerified: false,
      followerCount: 0,
      followingCount: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    }

    db.users.push(user)
    writeDb(db)

    const token = issueToken(user.id)
    return res.status(201).json({ token, user: safeUser(user) })
  } catch (err) {
    console.error('Signup error:', err)
    return res.status(500).json({ error: err?.message || 'Signup failed due to server error' })
  }
})

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' })
  }

  if (USE_POSTGRES_RUNTIME && db) {
    const normalizedEmail = String(email).trim().toLowerCase()
    const rows = await db
      .select()
      .from(users)
      .where(and(eq(users.email, normalizedEmail), isNull(users.deletedAt)))
      .limit(1)

    const user = rows[0]
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    const token = issueToken(user.id)
    return res.json({ token, user: toApiUserFromDb(user) })
  }

  const db = readDb()
  const normalizedEmail = String(email).trim().toLowerCase()
  const user = db.users.find(u => u.email === normalizedEmail)

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' })
  }

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' })
  }

  const token = issueToken(user.id)
  return res.json({ token, user: safeUser(user) })
})

app.get('/api/auth/me', authRequired, (req, res) => {
  if (USE_POSTGRES_RUNTIME && db) {
    db
      .select()
      .from(users)
      .where(and(eq(users.id, req.userId), isNull(users.deletedAt)))
      .limit(1)
      .then(rows => {
        const user = rows[0]
        if (!user) return res.status(404).json({ error: 'User not found' })
        return res.json(toApiUserFromDb(user))
      })
      .catch(err => {
        console.error('Auth me DB error:', err)
        return res.status(500).json({ error: 'Failed to load current user' })
      })
    return
  }

  const db = readDb()
  const user = db.users.find(u => u.id === req.userId)
  if (!user) return res.status(404).json({ error: 'User not found' })
  return res.json(safeUser(user))
})

app.post('/api/posts', authRequired, async (req, res) => {
  const { caption = '', images = [] } = req.body
  if (!Array.isArray(images)) {
    return res.status(400).json({ error: 'images must be an array' })
  }
  const normalizedImages = images
    .map(item => String(item || '').trim())
    .filter(Boolean)

  if (normalizedImages.length === 0) {
    return res.status(400).json({ error: 'At least one image is required' })
  }

  if (!normalizedImages.every(isValidImageSource)) {
    return res.status(400).json({ error: 'Each image must be a valid URL or data:image source' })
  }

  if (images.length > 10) {
    return res.status(400).json({ error: 'Maximum 10 images allowed per post' })
  }

  if (USE_POSTGRES_RUNTIME && db) {
    try {
      const insertedPosts = await db
        .insert(posts)
        .values({
          userId: req.userId,
          caption: String(caption),
          likesCount: 0,
          commentsCount: 0,
          isEdited: false,
          updatedAt: new Date()
        })
        .returning()

      const createdPost = insertedPosts[0]

      await db.insert(postImages).values(
        normalizedImages.map((imageUrl, index) => ({
          postId: createdPost.id,
          imageUrl,
          imageOrder: index + 1
        }))
      )

      return res.status(201).json(toApiPostFromDb(createdPost, normalizedImages))
    } catch (err) {
      console.error('Create post DB error:', err)
      return res.status(500).json({ error: 'Failed to create post' })
    }
  }

  const db = readDb()
  const now = new Date().toISOString()

  const post = {
    id: randomUUID(),
    userId: req.userId,
    caption: String(caption),
    images: normalizedImages,
    likesCount: 0,
    commentsCount: 0,
    isEdited: false,
    createdAt: now,
    updatedAt: now,
    deletedAt: null
  }

  db.posts.push(post)
  writeDb(db)
  return res.status(201).json(post)
})

app.get('/api/posts/feed', authRequired, async (req, res) => {
  if (USE_POSTGRES_RUNTIME && db) {
    try {
      const postRows = await db
        .select()
        .from(posts)
        .where(isNull(posts.deletedAt))
        .orderBy(desc(posts.createdAt))

      if (postRows.length === 0) {
        return res.json({ posts: [] })
      }

      const userRows = await db
        .select()
        .from(users)
        .where(isNull(users.deletedAt))

      const userMap = new Map(userRows.map(user => [user.id, user]))

      const followRows = await db
        .select()
        .from(follows)
        .where(and(eq(follows.followerId, req.userId), eq(follows.status, 'accepted')))

      const acceptedFollowing = new Set(followRows.map(follow => follow.followingId))

      const visiblePosts = postRows.filter(post => {
        const owner = userMap.get(post.userId)
        if (!owner) return false
        if (!owner.isPrivate) return true
        if (owner.id === req.userId) return true
        return acceptedFollowing.has(owner.id)
      })

      const postIds = visiblePosts.map(post => post.id)
      const imageRows = postIds.length > 0
        ? await db
          .select()
          .from(postImages)
          .where(inArray(postImages.postId, postIds))
          .orderBy(postImages.imageOrder)
        : []

      const commentsRows = postIds.length > 0
        ? await db
          .select()
          .from(comments)
          .where(and(inArray(comments.postId, postIds), isNull(comments.deletedAt)))
          .orderBy(comments.createdAt)
        : []

      const commentIds = commentsRows.map(comment => comment.id)

      const likesRows = (postIds.length > 0 || commentIds.length > 0)
        ? await db
          .select()
          .from(likes)
          .where(or(
            postIds.length > 0 ? inArray(likes.postId, postIds) : sql`false`,
            commentIds.length > 0 ? inArray(likes.commentId, commentIds) : sql`false`
          ))
        : []

      const imagesByPostId = new Map()
      for (const image of imageRows) {
        if (!imagesByPostId.has(image.postId)) imagesByPostId.set(image.postId, [])
        imagesByPostId.get(image.postId).push(image.imageUrl)
      }

      const likesByPostId = new Map()
      const likesByCommentId = new Map()
      for (const like of likesRows) {
        if (like.postId && !like.commentId) {
          if (!likesByPostId.has(like.postId)) likesByPostId.set(like.postId, [])
          likesByPostId.get(like.postId).push(like)
        }
        if (like.commentId) {
          if (!likesByCommentId.has(like.commentId)) likesByCommentId.set(like.commentId, [])
          likesByCommentId.get(like.commentId).push(like)
        }
      }

      const commentsByPostId = new Map()
      for (const comment of commentsRows) {
        const commentLikes = likesByCommentId.get(comment.id) || []
        const author = userMap.get(comment.userId)
        const commentPayload = {
          id: comment.id,
          postId: comment.postId,
          userId: comment.userId,
          text: comment.text,
          likesCount: commentLikes.length,
          parentCommentId: comment.parentCommentId,
          createdAt: comment.createdAt,
          updatedAt: comment.updatedAt,
          deletedAt: comment.deletedAt,
          likedByMe: commentLikes.some(like => like.userId === req.userId),
          likedByUsers: commentLikes
            .map(like => userMap.get(like.userId))
            .filter(Boolean)
            .map(toApiUserFromDb),
          author: author ? toApiUserFromDb(author) : null
        }

        if (!commentsByPostId.has(comment.postId)) commentsByPostId.set(comment.postId, [])
        commentsByPostId.get(comment.postId).push(commentPayload)
      }

      const feed = visiblePosts.map(post => {
        const owner = userMap.get(post.userId)
        const postLikes = likesByPostId.get(post.id) || []
        const postComments = commentsByPostId.get(post.id) || []
        const images = imagesByPostId.get(post.id) || []

        return {
          ...toApiPostFromDb(post, images),
          likesCount: postLikes.length,
          commentsCount: postComments.length,
          likedByUsers: postLikes
            .map(like => userMap.get(like.userId))
            .filter(Boolean)
            .map(toApiUserFromDb),
          author: owner ? toApiUserFromDb(owner) : null,
          comments: postComments,
          likedByMe: postLikes.some(like => like.userId === req.userId)
        }
      })

      return res.json({ posts: feed })
    } catch (err) {
      console.error('Feed DB error:', err)
      return res.status(500).json({ error: 'Failed to load feed' })
    }
  }

  const db = readDb()
  syncPostCounters(db)
  const feed = db.posts
    .filter(post => !post.deletedAt)
    .filter(post => {
      const owner = db.users.find(u => u.id === post.userId)
      return canViewUserContent(req.userId, owner, db)
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(post => {
      const owner = db.users.find(u => u.id === post.userId)
      const postLikes = db.likes.filter(like => like.postId === post.id && !like.commentId)
      const likedByUsers = postLikes
        .map(like => db.users.find(user => user.id === like.userId))
        .filter(Boolean)
        .map(user => safeUser(user))

      const comments = db.comments
        .filter(comment => comment.postId === post.id && !comment.deletedAt)
        .map(comment => {
          const author = db.users.find(user => user.id === comment.userId)
          const commentLikes = db.likes.filter(like => like.commentId === comment.id)
          const commentLikedByUsers = commentLikes
            .map(like => db.users.find(user => user.id === like.userId))
            .filter(Boolean)
            .map(user => safeUser(user))

          return {
            ...comment,
            likesCount: commentLikes.length,
            likedByMe: commentLikes.some(like => like.userId === req.userId),
            likedByUsers: commentLikedByUsers,
            author: author ? safeUser(author) : null
          }
        })
      const likedByMe = postLikes.some(like => like.userId === req.userId)
      const likesCount = postLikes.length

      return {
        ...post,
        likesCount,
        commentsCount: comments.length,
        likedByUsers,
        author: owner ? safeUser(owner) : null,
        comments: Array.isArray(comments) ? comments : [],
        likedByMe
      }
    })

  res.json({ posts: feed })
})

app.put('/api/posts/:id', authRequired, async (req, res) => {
  if (USE_POSTGRES_RUNTIME && db) {
    try {
      const postRows = await db
        .select()
        .from(posts)
        .where(and(eq(posts.id, req.params.id), isNull(posts.deletedAt)))
        .limit(1)
      const post = postRows[0]
      if (!post) return res.status(404).json({ error: 'Post not found' })
      if (post.userId !== req.userId) {
        return res.status(403).json({ error: 'Only owner can edit this post' })
      }

      const { caption, images } = req.body
      if (images && (!Array.isArray(images) || images.length > 10)) {
        return res.status(400).json({ error: 'images must be an array with max 10 items' })
      }

      let normalizedImages = null
      if (Array.isArray(images)) {
        normalizedImages = images.map(item => String(item || '').trim()).filter(Boolean)
        if (normalizedImages.length === 0) {
          return res.status(400).json({ error: 'At least one image is required' })
        }
        if (!normalizedImages.every(isValidImageSource)) {
          return res.status(400).json({ error: 'Each image must be a valid URL or data:image source' })
        }
      }

      const patch = {
        isEdited: true,
        updatedAt: new Date()
      }
      if (typeof caption === 'string') patch.caption = caption

      const updatedRows = await db
        .update(posts)
        .set(patch)
        .where(eq(posts.id, post.id))
        .returning()

      if (normalizedImages) {
        await db.delete(postImages).where(eq(postImages.postId, post.id))
        await db.insert(postImages).values(
          normalizedImages.map((imageUrl, index) => ({
            postId: post.id,
            imageUrl,
            imageOrder: index + 1
          }))
        )
      }

      const finalImages = normalizedImages || (
        await db
          .select({ imageUrl: postImages.imageUrl })
          .from(postImages)
          .where(eq(postImages.postId, post.id))
          .orderBy(postImages.imageOrder)
      ).map(item => item.imageUrl)

      return res.json(toApiPostFromDb(updatedRows[0], finalImages))
    } catch (err) {
      console.error('Update post DB error:', err)
      return res.status(500).json({ error: 'Failed to update post' })
    }
  }

  const db = readDb()
  const post = db.posts.find(p => p.id === req.params.id && !p.deletedAt)
  if (!post) return res.status(404).json({ error: 'Post not found' })
  if (post.userId !== req.userId) {
    return res.status(403).json({ error: 'Only owner can edit this post' })
  }

  const { caption, images } = req.body
  if (images && (!Array.isArray(images) || images.length > 10)) {
    return res.status(400).json({ error: 'images must be an array with max 10 items' })
  }

  if (Array.isArray(images)) {
    const normalizedImages = images
      .map(item => String(item || '').trim())
      .filter(Boolean)

    if (normalizedImages.length === 0) {
      return res.status(400).json({ error: 'At least one image is required' })
    }

    if (!normalizedImages.every(isValidImageSource)) {
      return res.status(400).json({ error: 'Each image must be a valid URL or data:image source' })
    }

    post.images = normalizedImages
  }

  if (typeof caption === 'string') post.caption = caption
  post.isEdited = true
  post.updatedAt = new Date().toISOString()

  writeDb(db)
  res.json(post)
})

app.delete('/api/posts/:id', authRequired, async (req, res) => {
  if (USE_POSTGRES_RUNTIME && db) {
    try {
      const postRows = await db
        .select()
        .from(posts)
        .where(and(eq(posts.id, req.params.id), isNull(posts.deletedAt)))
        .limit(1)
      const post = postRows[0]
      if (!post) return res.status(404).json({ error: 'Post not found' })
      if (post.userId !== req.userId) {
        return res.status(403).json({ error: 'Only owner can delete this post' })
      }

      await db
        .update(posts)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(posts.id, post.id))

      return res.status(204).send()
    } catch (err) {
      console.error('Delete post DB error:', err)
      return res.status(500).json({ error: 'Failed to delete post' })
    }
  }

  const db = readDb()
  const post = db.posts.find(p => p.id === req.params.id && !p.deletedAt)
  if (!post) return res.status(404).json({ error: 'Post not found' })
  if (post.userId !== req.userId) {
    return res.status(403).json({ error: 'Only owner can delete this post' })
  }

  post.deletedAt = new Date().toISOString()
  post.updatedAt = new Date().toISOString()
  writeDb(db)
  res.status(204).send()
})

app.post('/api/posts/:id/comments', authRequired, async (req, res) => {
  const { text = '', parentCommentId = null } = req.body
  if (!String(text).trim()) {
    return res.status(400).json({ error: 'Comment text is required' })
  }

  if (USE_POSTGRES_RUNTIME && db) {
    try {
      const postRows = await db
        .select()
        .from(posts)
        .where(and(eq(posts.id, req.params.id), isNull(posts.deletedAt)))
        .limit(1)
      const post = postRows[0]
      if (!post) return res.status(404).json({ error: 'Post not found' })

      const ownerRows = await db
        .select()
        .from(users)
        .where(and(eq(users.id, post.userId), isNull(users.deletedAt)))
        .limit(1)
      const owner = ownerRows[0]
      if (!owner) return res.status(404).json({ error: 'Post owner not found' })

      let canView = !owner.isPrivate || owner.id === req.userId
      if (!canView) {
        const rel = await db
          .select()
          .from(follows)
          .where(and(
            eq(follows.followerId, req.userId),
            eq(follows.followingId, owner.id),
            eq(follows.status, 'accepted')
          ))
          .limit(1)
        canView = rel.length > 0
      }
      if (!canView) {
        return res.status(403).json({ error: 'Not allowed to comment on this post' })
      }

      const inserted = await db
        .insert(comments)
        .values({
          postId: post.id,
          userId: req.userId,
          text: String(text),
          likesCount: 0,
          parentCommentId,
          updatedAt: new Date()
        })
        .returning()

      await db
        .update(posts)
        .set({ commentsCount: sql`${posts.commentsCount} + 1`, updatedAt: new Date() })
        .where(eq(posts.id, post.id))

      return res.status(201).json(inserted[0])
    } catch (err) {
      console.error('Create comment DB error:', err)
      return res.status(500).json({ error: 'Failed to create comment' })
    }
  }

  const db = readDb()
  const post = db.posts.find(p => p.id === req.params.id && !p.deletedAt)
  if (!post) return res.status(404).json({ error: 'Post not found' })

  const owner = db.users.find(u => u.id === post.userId)
  if (!canViewUserContent(req.userId, owner, db)) {
    return res.status(403).json({ error: 'Not allowed to comment on this post' })
  }

  const now = new Date().toISOString()
  const comment = {
    id: randomUUID(),
    postId: post.id,
    userId: req.userId,
    text: String(text),
    likesCount: 0,
    parentCommentId,
    createdAt: now,
    updatedAt: now,
    deletedAt: null
  }

  db.comments.push(comment)
  post.commentsCount += 1
  writeDb(db)
  res.status(201).json(comment)
})

app.put('/api/comments/:id', authRequired, async (req, res) => {
  if (USE_POSTGRES_RUNTIME && db) {
    try {
      const commentRows = await db
        .select()
        .from(comments)
        .where(and(eq(comments.id, req.params.id), isNull(comments.deletedAt)))
        .limit(1)
      const comment = commentRows[0]
      if (!comment) return res.status(404).json({ error: 'Comment not found' })

      const postRows = await db
        .select()
        .from(posts)
        .where(and(eq(posts.id, comment.postId), isNull(posts.deletedAt)))
        .limit(1)
      const post = postRows[0]

      const canManage = comment.userId === req.userId || post?.userId === req.userId
      if (!canManage) {
        return res.status(403).json({ error: 'Not allowed to edit this comment' })
      }

      const { text } = req.body
      if (!String(text || '').trim()) {
        return res.status(400).json({ error: 'Comment text is required' })
      }

      const updated = await db
        .update(comments)
        .set({ text: String(text), updatedAt: new Date() })
        .where(eq(comments.id, comment.id))
        .returning()

      return res.json(updated[0])
    } catch (err) {
      console.error('Update comment DB error:', err)
      return res.status(500).json({ error: 'Failed to update comment' })
    }
  }

  const db = readDb()
  const comment = db.comments.find(c => c.id === req.params.id && !c.deletedAt)
  if (!comment) return res.status(404).json({ error: 'Comment not found' })

  const post = db.posts.find(p => p.id === comment.postId && !p.deletedAt)
  const canManage = comment.userId === req.userId || post?.userId === req.userId
  if (!canManage) {
    return res.status(403).json({ error: 'Not allowed to edit this comment' })
  }

  const { text } = req.body
  if (!String(text || '').trim()) {
    return res.status(400).json({ error: 'Comment text is required' })
  }

  comment.text = String(text)
  comment.updatedAt = new Date().toISOString()
  writeDb(db)
  res.json(comment)
})

app.delete('/api/comments/:id', authRequired, async (req, res) => {
  if (USE_POSTGRES_RUNTIME && db) {
    try {
      const commentRows = await db
        .select()
        .from(comments)
        .where(and(eq(comments.id, req.params.id), isNull(comments.deletedAt)))
        .limit(1)
      const comment = commentRows[0]
      if (!comment) return res.status(404).json({ error: 'Comment not found' })

      const postRows = await db
        .select()
        .from(posts)
        .where(and(eq(posts.id, comment.postId), isNull(posts.deletedAt)))
        .limit(1)
      const post = postRows[0]

      const canManage = comment.userId === req.userId || post?.userId === req.userId
      if (!canManage) {
        return res.status(403).json({ error: 'Not allowed to delete this comment' })
      }

      await db
        .update(comments)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(comments.id, comment.id))

      if (post) {
        await db
          .update(posts)
          .set({ commentsCount: sql`greatest(${posts.commentsCount} - 1, 0)`, updatedAt: new Date() })
          .where(eq(posts.id, post.id))
      }

      return res.status(204).send()
    } catch (err) {
      console.error('Delete comment DB error:', err)
      return res.status(500).json({ error: 'Failed to delete comment' })
    }
  }

  const db = readDb()
  const comment = db.comments.find(c => c.id === req.params.id && !c.deletedAt)
  if (!comment) return res.status(404).json({ error: 'Comment not found' })

  const post = db.posts.find(p => p.id === comment.postId && !p.deletedAt)
  const canManage = comment.userId === req.userId || post?.userId === req.userId
  if (!canManage) {
    return res.status(403).json({ error: 'Not allowed to delete this comment' })
  }

  comment.deletedAt = new Date().toISOString()
  comment.updatedAt = new Date().toISOString()
  if (post && post.commentsCount > 0) post.commentsCount -= 1
  writeDb(db)
  res.status(204).send()
})

app.post('/api/posts/:id/like', authRequired, async (req, res) => {
  if (USE_POSTGRES_RUNTIME && db) {
    try {
      const postRows = await db
        .select()
        .from(posts)
        .where(and(eq(posts.id, req.params.id), isNull(posts.deletedAt)))
        .limit(1)
      const post = postRows[0]
      if (!post) return res.status(404).json({ error: 'Post not found' })

      const existing = await db
        .select()
        .from(likes)
        .where(and(eq(likes.userId, req.userId), eq(likes.postId, post.id), isNull(likes.commentId)))
        .limit(1)

      if (existing.length === 0) {
        await db.insert(likes).values({ userId: req.userId, postId: post.id, commentId: null })
      }

      const postLikes = await db
        .select()
        .from(likes)
        .where(and(eq(likes.postId, post.id), isNull(likes.commentId)))

      await db
        .update(posts)
        .set({ likesCount: postLikes.length, updatedAt: new Date() })
        .where(eq(posts.id, post.id))

      const likerIds = postLikes.map(like => like.userId)
      const likerUsers = likerIds.length > 0
        ? await db.select({ username: users.username }).from(users).where(inArray(users.id, likerIds))
        : []
      const likedByUsers = likerUsers.map(user => user.username)
      return res.status(existing.length === 0 ? 201 : 200).json({ liked: true, likesCount: postLikes.length, likedByUsers })
    } catch (err) {
      console.error('Post like DB error:', err)
      return res.status(500).json({ error: 'Failed to like post' })
    }
  }

  const db = readDb()
  const post = db.posts.find(p => p.id === req.params.id && !p.deletedAt)
  if (!post) return res.status(404).json({ error: 'Post not found' })

  const existing = db.likes.find(l => l.userId === req.userId && l.postId === post.id && !l.commentId)
  if (existing) {
    syncPostCounters(db)
    const likedByUsers = db.likes
      .filter(like => like.postId === post.id && !like.commentId)
      .map(like => db.users.find(user => user.id === like.userId)?.username)
      .filter(Boolean)
    return res.status(200).json({ liked: true, likesCount: post.likesCount, likedByUsers })
  }

  db.likes.push({
    id: randomUUID(),
    userId: req.userId,
    postId: post.id,
    commentId: null,
    createdAt: new Date().toISOString()
  })
  writeDb(db)
  const likedByUsers = db.likes
    .filter(like => like.postId === post.id && !like.commentId)
    .map(like => db.users.find(user => user.id === like.userId)?.username)
    .filter(Boolean)
  res.status(201).json({ liked: true, likesCount: likedByUsers.length, likedByUsers })
})

app.delete('/api/posts/:id/like', authRequired, async (req, res) => {
  if (USE_POSTGRES_RUNTIME && db) {
    try {
      const postRows = await db
        .select()
        .from(posts)
        .where(and(eq(posts.id, req.params.id), isNull(posts.deletedAt)))
        .limit(1)
      const post = postRows[0]
      if (!post) return res.status(404).json({ error: 'Post not found' })

      await db
        .delete(likes)
        .where(and(eq(likes.userId, req.userId), eq(likes.postId, post.id), isNull(likes.commentId)))

      const postLikes = await db
        .select()
        .from(likes)
        .where(and(eq(likes.postId, post.id), isNull(likes.commentId)))

      await db
        .update(posts)
        .set({ likesCount: postLikes.length, updatedAt: new Date() })
        .where(eq(posts.id, post.id))

      const likerIds = postLikes.map(like => like.userId)
      const likerUsers = likerIds.length > 0
        ? await db.select({ username: users.username }).from(users).where(inArray(users.id, likerIds))
        : []
      const likedByUsers = likerUsers.map(user => user.username)
      return res.json({ liked: false, likesCount: postLikes.length, likedByUsers })
    } catch (err) {
      console.error('Post unlike DB error:', err)
      return res.status(500).json({ error: 'Failed to unlike post' })
    }
  }

  const db = readDb()
  const post = db.posts.find(p => p.id === req.params.id && !p.deletedAt)
  if (!post) return res.status(404).json({ error: 'Post not found' })

  const index = db.likes.findIndex(l => l.userId === req.userId && l.postId === post.id && !l.commentId)
  if (index === -1) {
    syncPostCounters(db)
    const likedByUsers = db.likes
      .filter(like => like.postId === post.id && !like.commentId)
      .map(like => db.users.find(user => user.id === like.userId)?.username)
      .filter(Boolean)
    return res.status(200).json({ liked: false, likesCount: post.likesCount, likedByUsers })
  }

  db.likes.splice(index, 1)
  writeDb(db)
  const likedByUsers = db.likes
    .filter(like => like.postId === post.id && !like.commentId)
    .map(like => db.users.find(user => user.id === like.userId)?.username)
    .filter(Boolean)
  res.json({ liked: false, likesCount: likedByUsers.length, likedByUsers })
})

app.post('/api/comments/:id/like', authRequired, async (req, res) => {
  if (USE_POSTGRES_RUNTIME && db) {
    try {
      const commentRows = await db
        .select()
        .from(comments)
        .where(and(eq(comments.id, req.params.id), isNull(comments.deletedAt)))
        .limit(1)
      const comment = commentRows[0]
      if (!comment) return res.status(404).json({ error: 'Comment not found' })

      const postRows = await db
        .select()
        .from(posts)
        .where(and(eq(posts.id, comment.postId), isNull(posts.deletedAt)))
        .limit(1)
      const post = postRows[0]
      if (!post) return res.status(404).json({ error: 'Post not found' })

      const existing = await db
        .select()
        .from(likes)
        .where(and(eq(likes.userId, req.userId), eq(likes.commentId, comment.id)))
        .limit(1)

      if (existing.length === 0) {
        await db.insert(likes).values({ userId: req.userId, postId: comment.postId, commentId: comment.id })
      }

      const commentLikes = await db
        .select()
        .from(likes)
        .where(eq(likes.commentId, comment.id))

      await db
        .update(comments)
        .set({ likesCount: commentLikes.length, updatedAt: new Date() })
        .where(eq(comments.id, comment.id))

      return res.status(existing.length === 0 ? 201 : 200).json({ liked: true, likesCount: commentLikes.length })
    } catch (err) {
      console.error('Comment like DB error:', err)
      return res.status(500).json({ error: 'Failed to like comment' })
    }
  }

  const db = readDb()
  const comment = db.comments.find(c => c.id === req.params.id && !c.deletedAt)
  if (!comment) return res.status(404).json({ error: 'Comment not found' })

  const post = db.posts.find(p => p.id === comment.postId && !p.deletedAt)
  if (!post) return res.status(404).json({ error: 'Post not found' })

  const owner = db.users.find(u => u.id === post.userId)
  if (!canViewUserContent(req.userId, owner, db)) {
    return res.status(403).json({ error: 'Not allowed to like this comment' })
  }

  const existing = db.likes.find(l => l.userId === req.userId && l.commentId === comment.id)
  if (existing) {
    const likesCount = db.likes.filter(l => l.commentId === comment.id).length
    return res.status(200).json({ liked: true, likesCount })
  }

  db.likes.push({
    id: randomUUID(),
    userId: req.userId,
    postId: comment.postId,
    commentId: comment.id,
    createdAt: new Date().toISOString()
  })

  writeDb(db)
  const likesCount = db.likes.filter(l => l.commentId === comment.id).length
  res.status(201).json({ liked: true, likesCount })
})

app.delete('/api/comments/:id/like', authRequired, async (req, res) => {
  if (USE_POSTGRES_RUNTIME && db) {
    try {
      const commentRows = await db
        .select()
        .from(comments)
        .where(and(eq(comments.id, req.params.id), isNull(comments.deletedAt)))
        .limit(1)
      const comment = commentRows[0]
      if (!comment) return res.status(404).json({ error: 'Comment not found' })

      await db
        .delete(likes)
        .where(and(eq(likes.userId, req.userId), eq(likes.commentId, comment.id)))

      const commentLikes = await db
        .select()
        .from(likes)
        .where(eq(likes.commentId, comment.id))

      await db
        .update(comments)
        .set({ likesCount: commentLikes.length, updatedAt: new Date() })
        .where(eq(comments.id, comment.id))

      return res.json({ liked: false, likesCount: commentLikes.length })
    } catch (err) {
      console.error('Comment unlike DB error:', err)
      return res.status(500).json({ error: 'Failed to unlike comment' })
    }
  }

  const db = readDb()
  const comment = db.comments.find(c => c.id === req.params.id && !c.deletedAt)
  if (!comment) return res.status(404).json({ error: 'Comment not found' })

  const index = db.likes.findIndex(l => l.userId === req.userId && l.commentId === comment.id)
  if (index === -1) {
    const likesCount = db.likes.filter(l => l.commentId === comment.id).length
    return res.status(200).json({ liked: false, likesCount })
  }

  db.likes.splice(index, 1)
  writeDb(db)
  const likesCount = db.likes.filter(l => l.commentId === comment.id).length
  res.json({ liked: false, likesCount })
})

app.post('/api/stories', authRequired, (req, res) => {
  const { imageUrl, caption = '' } = req.body
  if (!imageUrl) return res.status(400).json({ error: 'imageUrl is required' })

  const now = new Date()
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const db = readDb()

  const story = {
    id: randomUUID(),
    userId: req.userId,
    imageUrl: String(imageUrl),
    caption: String(caption),
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    deletedAt: null
  }

  db.stories.push(story)
  writeDb(db)
  res.status(201).json(story)
})

app.get('/api/stories/feed', authRequired, (req, res) => {
  const db = readDb()
  const now = Date.now()

  const stories = db.stories
    .filter(s => !s.deletedAt)
    .filter(s => new Date(s.expiresAt).getTime() > now)
    .filter(s => {
      const owner = db.users.find(u => u.id === s.userId)
      return canViewUserContent(req.userId, owner, db)
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

  res.json({ stories })
})

app.delete('/api/stories/:id', authRequired, (req, res) => {
  const db = readDb()
  const story = db.stories.find(s => s.id === req.params.id && !s.deletedAt)
  if (!story) return res.status(404).json({ error: 'Story not found' })
  if (story.userId !== req.userId) {
    return res.status(403).json({ error: 'Only owner can delete story' })
  }

  story.deletedAt = new Date().toISOString()
  writeDb(db)
  res.status(204).send()
})

app.post('/api/users/:id/follow', authRequired, async (req, res) => {
  if (USE_POSTGRES_RUNTIME && db) {
    try {
      const targetRows = await db
        .select()
        .from(users)
        .where(and(eq(users.id, req.params.id), isNull(users.deletedAt)))
        .limit(1)
      const target = targetRows[0]
      if (!target) return res.status(404).json({ error: 'User not found' })
      if (target.id === req.userId) {
        return res.status(400).json({ error: 'Cannot follow yourself' })
      }

      const existing = await db
        .select()
        .from(follows)
        .where(and(eq(follows.followerId, req.userId), eq(follows.followingId, target.id)))
        .limit(1)
      if (existing.length > 0) {
        return res.status(409).json({ error: 'Follow relationship already exists' })
      }

      const status = target.isPrivate ? 'pending' : 'accepted'
      const inserted = await db
        .insert(follows)
        .values({ followerId: req.userId, followingId: target.id, status })
        .returning()

      if (status === 'accepted') {
        await db.update(users).set({ followingCount: sql`${users.followingCount} + 1` }).where(eq(users.id, req.userId))
        await db.update(users).set({ followerCount: sql`${users.followerCount} + 1` }).where(eq(users.id, target.id))
      }

      return res.status(201).json(inserted[0])
    } catch (err) {
      console.error('Follow DB error:', err)
      return res.status(500).json({ error: 'Failed to follow user' })
    }
  }

  const db = readDb()
  const target = db.users.find(u => u.id === req.params.id)
  if (!target) return res.status(404).json({ error: 'User not found' })
  if (target.id === req.userId) {
    return res.status(400).json({ error: 'Cannot follow yourself' })
  }

  const existing = db.follows.find(
    f => f.followerId === req.userId && f.followingId === target.id
  )
  if (existing) {
    return res.status(409).json({ error: 'Follow relationship already exists' })
  }

  const status = target.isPrivate ? 'pending' : 'accepted'
  const follow = {
    id: randomUUID(),
    followerId: req.userId,
    followingId: target.id,
    status,
    createdAt: new Date().toISOString()
  }
  db.follows.push(follow)

  const me = db.users.find(u => u.id === req.userId)
  if (status === 'accepted') {
    me.followingCount += 1
    target.followerCount += 1
  }

  writeDb(db)
  res.status(201).json(follow)
})

app.get('/api/users/:id/follow-status', authRequired, async (req, res) => {
  if (USE_POSTGRES_RUNTIME && db) {
    try {
      const targetRows = await db
        .select()
        .from(users)
        .where(and(eq(users.id, req.params.id), isNull(users.deletedAt)))
        .limit(1)
      const target = targetRows[0]
      if (!target) {
        return res.json({ status: 'none', isFollowing: false, isPending: false })
      }

      if (target.id === req.userId) {
        return res.json({ status: 'self', isFollowing: false, isPending: false })
      }

      const rel = await db
        .select()
        .from(follows)
        .where(and(eq(follows.followerId, req.userId), eq(follows.followingId, target.id)))
        .limit(1)
      const status = rel[0]?.status || 'none'
      return res.json({
        status,
        isFollowing: status === 'accepted',
        isPending: status === 'pending'
      })
    } catch (err) {
      console.error('Follow status DB error:', err)
      return res.status(500).json({ error: 'Failed to load follow status' })
    }
  }

  const db = readDb()
  const target = db.users.find(u => u.id === req.params.id)
  if (!target) {
    return res.json({ status: 'none', isFollowing: false, isPending: false })
  }

  if (target.id === req.userId) {
    return res.json({ status: 'self', isFollowing: false, isPending: false })
  }

  const relationship = db.follows.find(
    f => f.followerId === req.userId && f.followingId === target.id
  )

  const status = relationship?.status || 'none'
  return res.json({
    status,
    isFollowing: status === 'accepted',
    isPending: status === 'pending'
  })
})

app.delete('/api/users/:id/follow', authRequired, async (req, res) => {
  if (USE_POSTGRES_RUNTIME && db) {
    try {
      const relRows = await db
        .select()
        .from(follows)
        .where(and(eq(follows.followerId, req.userId), eq(follows.followingId, req.params.id)))
        .limit(1)
      const rel = relRows[0]
      if (!rel) return res.status(404).json({ error: 'Follow relationship not found' })

      await db.delete(follows).where(eq(follows.id, rel.id))

      if (rel.status === 'accepted') {
        await db.update(users).set({ followingCount: sql`greatest(${users.followingCount} - 1, 0)` }).where(eq(users.id, rel.followerId))
        await db.update(users).set({ followerCount: sql`greatest(${users.followerCount} - 1, 0)` }).where(eq(users.id, rel.followingId))
      }

      return res.status(204).send()
    } catch (err) {
      console.error('Unfollow DB error:', err)
      return res.status(500).json({ error: 'Failed to unfollow user' })
    }
  }

  const db = readDb()
  const index = db.follows.findIndex(
    follow => follow.followerId === req.userId && follow.followingId === req.params.id
  )
  if (index === -1) {
    return res.status(404).json({ error: 'Follow relationship not found' })
  }

  const follow = db.follows[index]
  const follower = db.users.find(user => user.id === follow.followerId)
  const following = db.users.find(user => user.id === follow.followingId)
  if (follow.status === 'accepted') {
    if (follower?.followingCount > 0) follower.followingCount -= 1
    if (following?.followerCount > 0) following.followerCount -= 1
  }

  db.follows.splice(index, 1)
  writeDb(db)
  return res.status(204).send()
})

app.delete('/api/follows/:id', authRequired, (req, res) => {
  const db = readDb()
  const index = db.follows.findIndex(f => f.id === req.params.id)
  if (index === -1) return res.status(404).json({ error: 'Follow record not found' })

  const follow = db.follows[index]
  if (follow.followerId !== req.userId && follow.followingId !== req.userId) {
    return res.status(403).json({ error: 'Not allowed to remove this follow relationship' })
  }

  const follower = db.users.find(u => u.id === follow.followerId)
  const following = db.users.find(u => u.id === follow.followingId)
  if (follow.status === 'accepted') {
    if (follower?.followingCount > 0) follower.followingCount -= 1
    if (following?.followerCount > 0) following.followerCount -= 1
  }

  db.follows.splice(index, 1)
  writeDb(db)
  res.status(204).send()
})

app.post('/api/follows/:id/approve', authRequired, (req, res) => {
  const db = readDb()
  const follow = db.follows.find(f => f.id === req.params.id)
  if (!follow) return res.status(404).json({ error: 'Follow request not found' })
  if (follow.followingId !== req.userId) {
    return res.status(403).json({ error: 'Only target user can approve follow requests' })
  }

  if (follow.status === 'accepted') {
    return res.status(409).json({ error: 'Follow request already approved' })
  }

  follow.status = 'accepted'
  const follower = db.users.find(u => u.id === follow.followerId)
  const following = db.users.find(u => u.id === follow.followingId)
  if (follower) follower.followingCount += 1
  if (following) following.followerCount += 1

  writeDb(db)
  res.json(follow)
})

app.post('/api/follows/:id/reject', authRequired, (req, res) => {
  const db = readDb()
  const index = db.follows.findIndex(f => f.id === req.params.id)
  if (index === -1) return res.status(404).json({ error: 'Follow request not found' })

  const follow = db.follows[index]
  if (follow.followingId !== req.userId) {
    return res.status(403).json({ error: 'Only target user can reject follow requests' })
  }

  db.follows.splice(index, 1)
  writeDb(db)
  res.status(204).send()
})

app.get('/api/users/:id/followers', authRequired, (req, res) => {
  const db = readDb()
  const followers = db.follows
    .filter(f => f.followingId === req.params.id && f.status === 'accepted')
    .map(f => db.users.find(u => u.id === f.followerId))
    .filter(Boolean)
    .map(safeUser)

  res.json({ followers })
})

app.get('/api/users/:id/following', authRequired, (req, res) => {
  const db = readDb()
  const following = db.follows
    .filter(f => f.followerId === req.params.id && f.status === 'accepted')
    .map(f => db.users.find(u => u.id === f.followingId))
    .filter(Boolean)
    .map(safeUser)

  res.json({ following })
})

app.get('/api/users/:id/follow-requests', authRequired, (req, res) => {
  if (req.userId !== req.params.id) {
    return res.status(403).json({ error: 'Can only view your own follow requests' })
  }

  const db = readDb()
  const requests = db.follows
    .filter(f => f.followingId === req.params.id && f.status === 'pending')
    .map(f => ({
      ...f,
      follower: safeUser(db.users.find(u => u.id === f.followerId))
    }))

  res.json({ requests })
})

app.get('/api/users/search', authRequired, async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase()
  if (q.length < 1) return res.json({ users: [] })

  if (USE_POSTGRES_RUNTIME && db) {
    try {
      const rows = await db
        .select()
        .from(users)
        .where(and(
          isNull(users.deletedAt),
          sql`(lower(${users.username}) like ${`%${q}%`} or lower(${users.fullName}) like ${`%${q}%`})`
        ))
        .limit(20)

      return res.json({ users: rows.map(toApiUserFromDb) })
    } catch (err) {
      console.error('User search DB error:', err)
      return res.status(500).json({ error: 'Failed to search users' })
    }
  }

  const db = readDb()
  const users = db.users
    .filter(u => u.username.includes(q) || u.fullName.toLowerCase().includes(q))
    .slice(0, 20)
    .map(safeUser)

  res.json({ users })
})

app.get('/api/users/:username', authRequired, async (req, res) => {
  if (USE_POSTGRES_RUNTIME && db) {
    try {
      const username = String(req.params.username).toLowerCase().replace(/^@/, '')
      const userRows = await db
        .select()
        .from(users)
        .where(and(eq(users.username, username), isNull(users.deletedAt)))
        .limit(1)
      const user = userRows[0]
      if (!user) return res.status(404).json({ error: 'User not found' })

      let canView = !user.isPrivate || user.id === req.userId
      if (!canView) {
        const rel = await db
          .select()
          .from(follows)
          .where(and(
            eq(follows.followerId, req.userId),
            eq(follows.followingId, user.id),
            eq(follows.status, 'accepted')
          ))
          .limit(1)
        canView = rel.length > 0
      }
      if (!canView) {
        return res.status(403).json({ error: 'This account is private' })
      }

      const postRows = await db
        .select()
        .from(posts)
        .where(and(eq(posts.userId, user.id), isNull(posts.deletedAt)))
        .orderBy(desc(posts.createdAt))

      const postIds = postRows.map(post => post.id)
      const imageRows = postIds.length > 0
        ? await db
          .select()
          .from(postImages)
          .where(inArray(postImages.postId, postIds))
          .orderBy(postImages.imageOrder)
        : []
      const imagesByPost = new Map()
      for (const image of imageRows) {
        if (!imagesByPost.has(image.postId)) imagesByPost.set(image.postId, [])
        imagesByPost.get(image.postId).push(image.imageUrl)
      }

      const payloadPosts = postRows.map(post => toApiPostFromDb(post, imagesByPost.get(post.id) || []))
      return res.json({ user: toApiUserFromDb(user), posts: payloadPosts })
    } catch (err) {
      console.error('User profile DB error:', err)
      return res.status(500).json({ error: 'Failed to load user profile' })
    }
  }

  const db = readDb()
  const username = String(req.params.username).toLowerCase().replace(/^@/, '')
  const user = db.users.find(u => u.username === username)
  if (!user) return res.status(404).json({ error: 'User not found' })

  const canView = canViewUserContent(req.userId, user, db)
  if (!canView) {
    return res.status(403).json({ error: 'This account is private' })
  }

  const posts = db.posts
    .filter(p => p.userId === user.id && !p.deletedAt)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

  res.json({ user: safeUser(user), posts })
})

app.put('/api/users/:id', authRequired, async (req, res) => {
  if (req.userId !== req.params.id) {
    return res.status(403).json({ error: 'Can only update your own profile' })
  }

  if (USE_POSTGRES_RUNTIME && db) {
    try {
      const rows = await db
        .select()
        .from(users)
        .where(and(eq(users.id, req.params.id), isNull(users.deletedAt)))
        .limit(1)
      const user = rows[0]
      if (!user) return res.status(404).json({ error: 'User not found' })

      if (Object.prototype.hasOwnProperty.call(req.body, 'bio')) {
        const nextBio = String(req.body.bio || '').trim()
        const normalizedBioValue = normalizeBio(nextBio)
        if (normalizedBioValue) {
          const duplicate = await db
            .select()
            .from(users)
            .where(and(isNull(users.deletedAt), eq(users.bio, nextBio), sql`${users.id} <> ${user.id}`))
            .limit(1)
          if (duplicate.length > 0) {
            return res.status(409).json({ error: 'Bio already exists. Please use a different bio.' })
          }
        }
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'website')) {
        const nextWebsite = String(req.body.website || '').trim()
        const normalizedWebsiteValue = normalizeWebsite(nextWebsite)
        if (normalizedWebsiteValue) {
          const duplicate = await db
            .select()
            .from(users)
            .where(and(
              isNull(users.deletedAt),
              sql`lower(${users.website}) = ${normalizedWebsiteValue}`,
              sql`${users.id} <> ${user.id}`
            ))
            .limit(1)
          if (duplicate.length > 0) {
            return res.status(409).json({ error: 'Website already exists. Please use a different website.' })
          }
        }
      }

      const patch = { updatedAt: new Date() }
      if (Object.prototype.hasOwnProperty.call(req.body, 'fullName')) patch.fullName = String(req.body.fullName || '')
      if (Object.prototype.hasOwnProperty.call(req.body, 'bio')) patch.bio = String(req.body.bio || '')
      if (Object.prototype.hasOwnProperty.call(req.body, 'website')) patch.website = String(req.body.website || '')
      if (Object.prototype.hasOwnProperty.call(req.body, 'profilePicture')) patch.profilePictureUrl = String(req.body.profilePicture || '')
      if (Object.prototype.hasOwnProperty.call(req.body, 'isPrivate')) patch.isPrivate = !!req.body.isPrivate

      const updatedRows = await db
        .update(users)
        .set(patch)
        .where(eq(users.id, user.id))
        .returning()

      return res.json(toApiUserFromDb(updatedRows[0]))
    } catch (err) {
      console.error('Update user DB error:', err)
      return res.status(500).json({ error: 'Failed to update profile' })
    }
  }

  const db = readDb()
  const user = db.users.find(u => u.id === req.params.id)
  if (!user) return res.status(404).json({ error: 'User not found' })

  if (Object.prototype.hasOwnProperty.call(req.body, 'bio')) {
    const nextBio = String(req.body.bio || '').trim()
    const normalizedBioValue = normalizeBio(nextBio)
    if (
      normalizedBioValue &&
      db.users.some(existing => existing.id !== user.id && normalizeBio(existing?.bio) === normalizedBioValue)
    ) {
      return res.status(409).json({ error: 'Bio already exists. Please use a different bio.' })
    }
    user.bio = nextBio
  }

  if (Object.prototype.hasOwnProperty.call(req.body, 'website')) {
    const nextWebsite = String(req.body.website || '').trim()
    const normalizedWebsiteValue = normalizeWebsite(nextWebsite)
    if (
      normalizedWebsiteValue &&
      db.users.some(existing => existing.id !== user.id && normalizeWebsite(existing?.website) === normalizedWebsiteValue)
    ) {
      return res.status(409).json({ error: 'Website already exists. Please use a different website.' })
    }
    user.website = nextWebsite
  }

  const allowedFields = ['fullName', 'profilePicture', 'isPrivate']
  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(req.body, field)) {
      user[field] = req.body[field]
    }
  }
  user.updatedAt = new Date().toISOString()

  writeDb(db)
  res.json(safeUser(user))
})

app.use((err, _req, res, _next) => {
  console.error('Unhandled API error:', err)
  if (res.headersSent) return
  res.status(err?.status || 500).json({ error: err?.message || 'Internal server error' })
})

app.listen(PORT, () => {
  console.log(`Backend API running on http://localhost:${PORT}`)
  if (USE_POSTGRES_RUNTIME) {
    console.log('Runtime storage: Neon PostgreSQL via Drizzle ORM')
  } else if (hasDatabaseUrl) {
    console.log('Runtime storage: JSON file (Neon configured but USE_POSTGRES_RUNTIME is false)')
  } else {
    console.log('Runtime storage: JSON file (set DATABASE_URL and USE_POSTGRES_RUNTIME=true to enable Neon runtime)')
  }
})
