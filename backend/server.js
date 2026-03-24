import express from 'express'
import cors from 'cors'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import {
  checkDatabaseConnection,
  getDatabaseTroubleshootingHint,
  hasDatabaseUrl,
  inspectUsersTable
} from './db/client.js'
import { db } from './db/client.js'
import { comments, follows, likes, postImages, posts, stories, users } from './db/schema.js'
import { and, desc, eq, gte, inArray, isNull, or, sql } from 'drizzle-orm'

const app = express()
const PORT = process.env.PORT || 4000
const JWT_SECRET = process.env.JWT_SECRET || 'demo-secret-change-in-production'
const USE_POSTGRES_RUNTIME = hasDatabaseUrl && String(process.env.USE_POSTGRES_RUNTIME || 'true').toLowerCase() !== 'false'
const IS_PRODUCTION = process.env.NODE_ENV === 'production'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const DATA_FILE = path.join(__dirname, 'data.json')
const STORY_TTL_MS = 24 * 60 * 60 * 1000

app.use(cors({ origin: ['http://localhost:5173'], credentials: true }))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))
app.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')
  next()
})

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
  db.stories = Array.isArray(db.stories)
    ? db.stories
      .filter(item => item && typeof item === 'object')
      .map(story => ({
        ...story,
        imageUrl: typeof story.imageUrl === 'string' ? story.imageUrl : '',
        createdAt: typeof story.createdAt === 'string' ? story.createdAt : new Date(0).toISOString()
      }))
      .filter(story => story.imageUrl)
    : []

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
  const { passwordHash: _passwordHash, ...rest } = user
  return rest
}

function toApiUserFromDb(user, followStats = null) {
  if (!user) return null
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    fullName: user.fullName || '',
    bio: user.bio || '',
    website: user.website || '',
    profilePicture: user.profilePictureUrl || user.profilePicture || '',
    isPrivate: !!user.isPrivate,
    isVerified: !!user.isVerified,
    followerCount: Number(followStats?.followerCount ?? user.followerCount ?? 0),
    followingCount: Number(followStats?.followingCount ?? user.followingCount ?? 0),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    deletedAt: user.deletedAt || null
  }
}

function createFollowStatsMap(userIds = []) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))]
  return new Map(uniqueIds.map(id => [id, { followerCount: 0, followingCount: 0 }]))
}

function applyFollowRowsToStatsMap(statsMap, followRows = []) {
  for (const follow of followRows) {
    if (statsMap.has(follow.followerId)) {
      statsMap.get(follow.followerId).followingCount += 1
    }
    if (statsMap.has(follow.followingId)) {
      statsMap.get(follow.followingId).followerCount += 1
    }
  }
  return statsMap
}

async function getFollowStatsMapFromDb(userIds = []) {
  const statsMap = createFollowStatsMap(userIds)
  const ids = [...statsMap.keys()]
  if (ids.length === 0) return statsMap

  const followRows = await db
    .select({
      followerId: follows.followerId,
      followingId: follows.followingId
    })
    .from(follows)
    .where(and(
      eq(follows.status, 'accepted'),
      or(
        inArray(follows.followerId, ids),
        inArray(follows.followingId, ids)
      )
    ))

  return applyFollowRowsToStatsMap(statsMap, followRows)
}

function getFollowStatsMapFromJson(userIds = [], dbState) {
  const statsMap = createFollowStatsMap(userIds)
  const ids = [...statsMap.keys()]
  if (ids.length === 0) return statsMap

  const followRows = dbState.follows.filter(
    follow => follow.status === 'accepted' && (ids.includes(follow.followerId) || ids.includes(follow.followingId))
  )

  return applyFollowRowsToStatsMap(statsMap, followRows)
}

function attachFollowStats(usersList = [], statsMap = new Map()) {
  return usersList.map(user => toApiUserFromDb(user, statsMap.get(user.id)))
}

function serializeFollowUser(user, relation, statsMap = new Map()) {
  if (!user || !relation) return null
  return {
    ...toApiUserFromDb(user, statsMap.get(user.id)),
    followId: relation.id,
    followedAt: relation.createdAt,
    status: relation.status
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

function toApiComment(comment, author, { viewerId = null, likedByUsers } = {}) {
  const hasLikedUsers = Array.isArray(likedByUsers)
  const normalizedLikedByUsers = hasLikedUsers ? likedByUsers.filter(Boolean) : []

  return {
    id: comment.id,
    postId: comment.postId,
    userId: comment.userId,
    text: comment.text,
    likesCount: hasLikedUsers ? normalizedLikedByUsers.length : Number(comment.likesCount || 0),
    parentCommentId: comment.parentCommentId,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    deletedAt: comment.deletedAt || null,
    likedByMe: hasLikedUsers
      ? normalizedLikedByUsers.some(user => user.id === viewerId)
      : false,
    likedByUsers: hasLikedUsers
      ? normalizedLikedByUsers.map(toApiUserFromDb)
      : [],
    author: author ? toApiUserFromDb(author) : null
  }
}

function toStoryOwner(user) {
  if (!user) return null
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    profilePicture: user.profilePictureUrl || user.profilePicture || ''
  }
}

function toApiStory(story, owner) {
  return {
    id: story.id,
    userId: story.userId,
    imageUrl: story.imageUrl,
    createdAt: story.createdAt,
    user: toStoryOwner(owner)
  }
}

function getStoryCutoffDate() {
  return new Date(Date.now() - STORY_TTL_MS)
}

function issueToken(userId) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '7d' })
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''))
}

async function buildDatabaseDebugInfo() {
  if (!USE_POSTGRES_RUNTIME) {
    return {
      storageMode: 'json-file',
      database: {
        ok: false,
        message: 'Neon runtime is not active.'
      },
      usersTable: null
    }
  }

  const [database, usersTable] = await Promise.all([
    checkDatabaseConnection(),
    inspectUsersTable()
  ])

  return {
    storageMode: 'postgres',
    database,
    usersTable
  }
}

async function sendDatabaseError(res, publicMessage, error) {
  const debugInfo = await buildDatabaseDebugInfo()
  const payload = {
    error: publicMessage,
    hint: getDatabaseTroubleshootingHint(error, debugInfo.usersTable)
  }

  if (!IS_PRODUCTION) {
    payload.details = error?.message || 'Unknown database error'
    payload.debug = debugInfo
  }

  return res.status(500).json(payload)
}

function authRequired(req, res, next) {
  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    return res.status(401).json({ error: 'Missing token' })
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET)
    if (!isUuid(payload.sub)) {
      return res.status(401).json({ error: 'Invalid token subject. Clear localStorage and sign in again.' })
    }
    req.userId = payload.sub
    req.user = { id: payload.sub }
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

async function canViewUserContentInDb(viewerId, owner) {
  if (!owner) return false
  if (!owner.isPrivate) return true
  if (viewerId && owner.id === viewerId) return true

  const relationship = await db
    .select({ id: follows.id })
    .from(follows)
    .where(and(
      eq(follows.followerId, viewerId),
      eq(follows.followingId, owner.id),
      eq(follows.status, 'accepted')
    ))
    .limit(1)

  return relationship.length > 0
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
  const usersTable = USE_POSTGRES_RUNTIME ? await inspectUsersTable() : null
  res.json({
    ok: true,
    service: 'instagram-clone-backend',
    database: dbStatus.ok ? 'connected' : 'disconnected',
    databaseMessage: dbStatus.message,
    storageMode: USE_POSTGRES_RUNTIME ? 'postgres' : 'json-file',
    usersTable
  })
})

app.get('/api/debug/database', async (_req, res) => {
  const debugInfo = await buildDatabaseDebugInfo()
  const status = debugInfo.database.ok ? 200 : 500
  res.status(status).json(debugInfo)
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
      const trimmedWebsite = String(website || '').trim()

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
      return res.status(201).json({
        token,
        user: toApiUserFromDb(createdUser, { followerCount: 0, followingCount: 0 })
      })
    }

    const dbState = readDb()
    const normalizedEmail = String(email).trim().toLowerCase()
    const normalizedUsername = String(username).trim().toLowerCase().replace(/^@/, '')
    const trimmedBio = String(bio || '').trim()
    const trimmedWebsite = String(website || '').trim()

    if (dbState.users.some(u => String(u?.email || '').toLowerCase() === normalizedEmail)) {
      return res.status(409).json({ error: 'Email already exists' })
    }
    if (dbState.users.some(u => String(u?.username || '').toLowerCase() === normalizedUsername)) {
      return res.status(409).json({ error: 'Username already exists' })
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

    dbState.users.push(user)
    writeDb(dbState)

    const token = issueToken(user.id)
    const statsMap = getFollowStatsMapFromJson([user.id], dbState)
    return res.status(201).json({ token, user: toApiUserFromDb(user, statsMap.get(user.id)) })
  } catch (err) {
    console.error('Signup error:', err)
    if (USE_POSTGRES_RUNTIME) {
      return sendDatabaseError(res, 'Signup failed due to a database error', err)
    }
    return res.status(500).json({ error: err?.message || 'Signup failed due to server error' })
  }
})

app.post('/api/auth/login', async (req, res) => {
  try {
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
      const statsMap = await getFollowStatsMapFromDb([user.id])
      return res.json({ token, user: toApiUserFromDb(user, statsMap.get(user.id)) })
    }

    const dbState = readDb()
    const normalizedEmail = String(email).trim().toLowerCase()
    const user = dbState.users.find(u => u.email === normalizedEmail)

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    const token = issueToken(user.id)
    const statsMap = getFollowStatsMapFromJson([user.id], dbState)
    return res.json({ token, user: toApiUserFromDb(user, statsMap.get(user.id)) })
  } catch (err) {
    console.error('Login error:', err)
    if (USE_POSTGRES_RUNTIME) {
      return sendDatabaseError(res, 'Login failed due to a database error', err)
    }
    return res.status(500).json({ error: err?.message || 'Login failed due to server error' })
  }
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
        return getFollowStatsMapFromDb([user.id]).then(statsMap => res.json(toApiUserFromDb(user, statsMap.get(user.id))))
      })
      .catch(err => {
        console.error('Auth me DB error:', err)
        return sendDatabaseError(res, 'Failed to load current user', err)
      })
    return
  }

  const dbState = readDb()
  const user = dbState.users.find(u => u.id === req.userId)
  if (!user) return res.status(404).json({ error: 'User not found' })
  const statsMap = getFollowStatsMapFromJson([user.id], dbState)
  return res.json(toApiUserFromDb(user, statsMap.get(user.id)))
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

  const dbState = readDb()
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

  dbState.posts.push(post)
  writeDb(dbState)
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
        const commentPayload = toApiComment(comment, author, {
          viewerId: req.userId,
          likedByUsers: commentLikes
            .map(like => userMap.get(like.userId))
            .filter(Boolean)
        })

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

  const dbState = readDb()
  syncPostCounters(dbState)
  const feed = dbState.posts
    .filter(post => !post.deletedAt)
    .filter(post => {
      const owner = dbState.users.find(u => u.id === post.userId)
      return canViewUserContent(req.userId, owner, dbState)
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(post => {
      const owner = dbState.users.find(u => u.id === post.userId)
      const postLikes = dbState.likes.filter(like => like.postId === post.id && !like.commentId)
      const likedByUsers = postLikes
        .map(like => dbState.users.find(user => user.id === like.userId))
        .filter(Boolean)
        .map(user => safeUser(user))

      const comments = dbState.comments
        .filter(comment => comment.postId === post.id && !comment.deletedAt)
        .map(comment => {
          const author = dbState.users.find(user => user.id === comment.userId)
          const commentLikes = dbState.likes.filter(like => like.commentId === comment.id)
          const commentLikedByUsers = commentLikes
            .map(like => dbState.users.find(user => user.id === like.userId))
            .filter(Boolean)

          return toApiComment(comment, author, {
            viewerId: req.userId,
            likedByUsers: commentLikedByUsers
          })
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

app.get('/api/posts/:id/comments', authRequired, async (req, res) => {
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

      const canView = await canViewUserContentInDb(req.userId, owner)
      if (!canView) {
        return res.status(403).json({ error: 'Not allowed to view comments on this post' })
      }

      const commentRows = await db
        .select()
        .from(comments)
        .where(and(eq(comments.postId, post.id), isNull(comments.deletedAt)))
        .orderBy(comments.createdAt)

      if (commentRows.length === 0) {
        return res.json({ comments: [] })
      }

      const commentIds = commentRows.map(comment => comment.id)
      const authorIds = [...new Set(commentRows.map(comment => comment.userId))]
      const likeRows = await db
        .select()
        .from(likes)
        .where(inArray(likes.commentId, commentIds))
      const likeUserIds = [...new Set(likeRows.map(like => like.userId))]
      const relatedUserIds = [...new Set([...authorIds, ...likeUserIds])]

      const userRows = relatedUserIds.length > 0
        ? await db
          .select()
          .from(users)
          .where(and(inArray(users.id, relatedUserIds), isNull(users.deletedAt)))
        : []
      const userMap = new Map(userRows.map(user => [user.id, user]))

      const likesByCommentId = new Map()
      for (const like of likeRows) {
        if (!likesByCommentId.has(like.commentId)) likesByCommentId.set(like.commentId, [])
        likesByCommentId.get(like.commentId).push(like)
      }

      const payload = commentRows.map(comment => toApiComment(comment, userMap.get(comment.userId), {
        viewerId: req.userId,
        likedByUsers: (likesByCommentId.get(comment.id) || [])
          .map(like => userMap.get(like.userId))
          .filter(Boolean)
      }))

      return res.json({ comments: payload })
    } catch (err) {
      console.error('Post comments DB error:', err)
      return res.status(500).json({ error: 'Failed to load comments' })
    }
  }

  const dbState = readDb()
  const post = dbState.posts.find(p => p.id === req.params.id && !p.deletedAt)
  if (!post) return res.status(404).json({ error: 'Post not found' })

  const owner = dbState.users.find(user => user.id === post.userId)
  if (!canViewUserContent(req.userId, owner, dbState)) {
    return res.status(403).json({ error: 'Not allowed to view comments on this post' })
  }

  const payload = dbState.comments
    .filter(comment => comment.postId === post.id && !comment.deletedAt)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .map(comment => {
      const author = dbState.users.find(user => user.id === comment.userId)
      const likedByUsers = dbState.likes
        .filter(like => like.commentId === comment.id)
        .map(like => dbState.users.find(user => user.id === like.userId))
        .filter(Boolean)

      return toApiComment(comment, author, {
        viewerId: req.userId,
        likedByUsers
      })
    })

  return res.json({ comments: payload })
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

  const dbState = readDb()
  const post = dbState.posts.find(p => p.id === req.params.id && !p.deletedAt)
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

  writeDb(dbState)
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

  const dbState = readDb()
  const post = dbState.posts.find(p => p.id === req.params.id && !p.deletedAt)
  if (!post) return res.status(404).json({ error: 'Post not found' })
  if (post.userId !== req.userId) {
    return res.status(403).json({ error: 'Only owner can delete this post' })
  }

  post.deletedAt = new Date().toISOString()
  post.updatedAt = new Date().toISOString()
  writeDb(dbState)
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

      const canView = await canViewUserContentInDb(req.userId, owner)
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

      const authorRows = await db
        .select()
        .from(users)
        .where(and(eq(users.id, req.userId), isNull(users.deletedAt)))
        .limit(1)

      return res.status(201).json(toApiComment(inserted[0], authorRows[0], {
        viewerId: req.userId,
        likedByUsers: []
      }))
    } catch (err) {
      console.error('Create comment DB error:', err)
      return res.status(500).json({ error: 'Failed to create comment' })
    }
  }

  const dbState = readDb()
  const post = dbState.posts.find(p => p.id === req.params.id && !p.deletedAt)
  if (!post) return res.status(404).json({ error: 'Post not found' })

  const owner = dbState.users.find(u => u.id === post.userId)
  if (!canViewUserContent(req.userId, owner, dbState)) {
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

  dbState.comments.push(comment)
  post.commentsCount += 1
  writeDb(dbState)
  const author = dbState.users.find(user => user.id === req.userId)
  res.status(201).json(toApiComment(comment, author, {
    viewerId: req.userId,
    likedByUsers: []
  }))
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

      if (comment.userId !== req.userId) {
        return res.status(403).json({ error: 'Only the comment author can edit this comment' })
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

  const dbState = readDb()
  const comment = dbState.comments.find(c => c.id === req.params.id && !c.deletedAt)
  if (!comment) return res.status(404).json({ error: 'Comment not found' })

  if (comment.userId !== req.userId) {
    return res.status(403).json({ error: 'Only the comment author can edit this comment' })
  }

  const { text } = req.body
  if (!String(text || '').trim()) {
    return res.status(400).json({ error: 'Comment text is required' })
  }

  comment.text = String(text)
  comment.updatedAt = new Date().toISOString()
  writeDb(dbState)
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

      const canDelete = comment.userId === req.userId || post?.userId === req.userId
      if (!canDelete) {
        return res.status(403).json({ error: 'Only the comment author or post owner can delete this comment' })
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

  const dbState = readDb()
  const comment = dbState.comments.find(c => c.id === req.params.id && !c.deletedAt)
  if (!comment) return res.status(404).json({ error: 'Comment not found' })

  const post = dbState.posts.find(p => p.id === comment.postId && !p.deletedAt)
  const canDelete = comment.userId === req.userId || post?.userId === req.userId
  if (!canDelete) {
    return res.status(403).json({ error: 'Only the comment author or post owner can delete this comment' })
  }

  comment.deletedAt = new Date().toISOString()
  comment.updatedAt = new Date().toISOString()
  if (post && post.commentsCount > 0) post.commentsCount -= 1
  writeDb(dbState)
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

      // Legacy comment-like rows stored postId as well as commentId.
      // Normalize them so post likes and comment likes do not fight over the same unique key.
      await db
        .update(likes)
        .set({ postId: null })
        .where(and(eq(likes.userId, req.userId), eq(likes.postId, post.id), sql`${likes.commentId} IS NOT NULL`))

      const inserted = await db
        .insert(likes)
        .values({ userId: req.userId, postId: post.id, commentId: null })
        .onConflictDoNothing({ target: [likes.userId, likes.postId] })
        .returning({ id: likes.id })

      let liked = inserted.length > 0

      if (!liked) {
        await db
          .delete(likes)
          .where(and(eq(likes.userId, req.userId), eq(likes.postId, post.id), isNull(likes.commentId)))
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
      return res.status(inserted.length > 0 ? 201 : 200).json({ liked, likesCount: postLikes.length, likedByUsers })
    } catch (err) {
      console.error('Post like DB error:', err)
      return res.status(500).json({
        error: 'Failed to toggle like on post',
        ...(IS_PRODUCTION ? {} : { details: err?.message || 'Unknown database error', code: err?.code || null })
      })
    }
  }

  const dbState = readDb()
  const post = dbState.posts.find(p => p.id === req.params.id && !p.deletedAt)
  if (!post) return res.status(404).json({ error: 'Post not found' })

  dbState.likes.forEach(like => {
    if (like.userId === req.userId && like.postId === post.id && like.commentId) {
      like.postId = null
    }
  })

  const existing = dbState.likes.find(l => l.userId === req.userId && l.postId === post.id && !l.commentId)
  if (existing) {
    const index = dbState.likes.findIndex(l => l.id === existing.id)
    if (index !== -1) {
      dbState.likes.splice(index, 1)
    }
    writeDb(dbState)
    const likedByUsers = dbState.likes
      .filter(like => like.postId === post.id && !like.commentId)
      .map(like => dbState.users.find(user => user.id === like.userId)?.username)
      .filter(Boolean)
    return res.status(200).json({ liked: false, likesCount: likedByUsers.length, likedByUsers })
  }

  dbState.likes.push({
    id: randomUUID(),
    userId: req.userId,
    postId: post.id,
    commentId: null,
    createdAt: new Date().toISOString()
  })
  writeDb(dbState)
  const likedByUsers = dbState.likes
    .filter(like => like.postId === post.id && !like.commentId)
    .map(like => dbState.users.find(user => user.id === like.userId)?.username)
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

  const dbState = readDb()
  const post = dbState.posts.find(p => p.id === req.params.id && !p.deletedAt)
  if (!post) return res.status(404).json({ error: 'Post not found' })

  const index = dbState.likes.findIndex(l => l.userId === req.userId && l.postId === post.id && !l.commentId)
  if (index === -1) {
    syncPostCounters(dbState)
    const likedByUsers = dbState.likes
      .filter(like => like.postId === post.id && !like.commentId)
      .map(like => dbState.users.find(user => user.id === like.userId)?.username)
      .filter(Boolean)
    return res.status(200).json({ liked: false, likesCount: post.likesCount, likedByUsers })
  }

  dbState.likes.splice(index, 1)
  writeDb(dbState)
  const likedByUsers = dbState.likes
    .filter(like => like.postId === post.id && !like.commentId)
    .map(like => dbState.users.find(user => user.id === like.userId)?.username)
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
        await db
          .insert(likes)
          .values({ userId: req.userId, postId: null, commentId: comment.id })
          .onConflictDoNothing({ target: [likes.userId, likes.commentId] })
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

  const dbState = readDb()
  const comment = dbState.comments.find(c => c.id === req.params.id && !c.deletedAt)
  if (!comment) return res.status(404).json({ error: 'Comment not found' })

  const post = dbState.posts.find(p => p.id === comment.postId && !p.deletedAt)
  if (!post) return res.status(404).json({ error: 'Post not found' })

  const owner = dbState.users.find(u => u.id === post.userId)
  if (!canViewUserContent(req.userId, owner, dbState)) {
    return res.status(403).json({ error: 'Not allowed to like this comment' })
  }

  const existing = dbState.likes.find(l => l.userId === req.userId && l.commentId === comment.id)
  if (existing) {
    const likesCount = dbState.likes.filter(l => l.commentId === comment.id).length
    return res.status(200).json({ liked: true, likesCount })
  }

  dbState.likes.push({
    id: randomUUID(),
    userId: req.userId,
    postId: null,
    commentId: comment.id,
    createdAt: new Date().toISOString()
  })

  writeDb(dbState)
  const likesCount = dbState.likes.filter(l => l.commentId === comment.id).length
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

  const dbState = readDb()
  const comment = dbState.comments.find(c => c.id === req.params.id && !c.deletedAt)
  if (!comment) return res.status(404).json({ error: 'Comment not found' })

  const index = dbState.likes.findIndex(l => l.userId === req.userId && l.commentId === comment.id)
  if (index === -1) {
    const likesCount = dbState.likes.filter(l => l.commentId === comment.id).length
    return res.status(200).json({ liked: false, likesCount })
  }

  dbState.likes.splice(index, 1)
  writeDb(dbState)
  const likesCount = dbState.likes.filter(l => l.commentId === comment.id).length
  res.json({ liked: false, likesCount })
})

app.post('/api/stories', authRequired, async (req, res) => {
  const imageUrl = String(req.body?.imageUrl ?? req.body?.image_url ?? '').trim()
  const requestedUserId = String(req.body?.userId ?? req.body?.user_id ?? '').trim()
  if (!imageUrl) {
    return res.status(400).json({ error: 'imageUrl is required' })
  }
  if (requestedUserId && requestedUserId !== req.user.id) {
    return res.status(403).json({ error: 'You can only create stories for your own account' })
  }
  if (!isValidImageSource(imageUrl) || imageUrl.startsWith('data:') || imageUrl.startsWith('blob:')) {
    return res.status(400).json({ error: 'Story image must be a valid image URL' })
  }

  if (USE_POSTGRES_RUNTIME && db) {
    try {
      const insertedStories = await db
        .insert(stories)
        .values({
          userId: requestedUserId || req.user.id,
          imageUrl
        })
        .returning()

      const createdStory = insertedStories[0]
      const ownerRows = await db
        .select()
        .from(users)
        .where(and(eq(users.id, createdStory.userId), isNull(users.deletedAt)))
        .limit(1)

      return res.status(201).json(toApiStory(createdStory, ownerRows[0]))
    } catch (err) {
      console.error('Create story DB error:', err)
      return res.status(500).json({ error: 'Failed to create story' })
    }
  }

  const dbState = readDb()
  const story = {
    id: randomUUID(),
    userId: requestedUserId || req.user.id,
    imageUrl,
    createdAt: new Date().toISOString()
  }

  dbState.stories.push(story)
  writeDb(dbState)

  const owner = dbState.users.find(user => user.id === story.userId)
  return res.status(201).json(toApiStory(story, owner))
})

const getStoriesHandler = async (req, res) => {
  const storyCutoffDate = getStoryCutoffDate()

  if (USE_POSTGRES_RUNTIME && db) {
    try {
      const recentStories = await db
        .select()
        .from(stories)
        .where(gte(stories.createdAt, storyCutoffDate))
        .orderBy(desc(stories.createdAt))

      if (recentStories.length === 0) {
        return res.json({ stories: [] })
      }

      const ownerIds = [...new Set(recentStories.map(story => story.userId))]
      const ownerRows = ownerIds.length > 0
        ? await db
          .select()
          .from(users)
          .where(and(inArray(users.id, ownerIds), isNull(users.deletedAt)))
        : []
      const ownerMap = new Map(ownerRows.map(user => [user.id, user]))

      const privateOwnerIds = ownerRows
        .filter(user => user.isPrivate && user.id !== req.user.id)
        .map(user => user.id)

      const followRows = privateOwnerIds.length > 0
        ? await db
          .select()
          .from(follows)
          .where(and(
            eq(follows.followerId, req.user.id),
            eq(follows.status, 'accepted'),
            inArray(follows.followingId, privateOwnerIds)
          ))
        : []
      const allowedPrivateIds = new Set(followRows.map(follow => follow.followingId))

      const visibleStories = recentStories
        .filter(story => {
          const owner = ownerMap.get(story.userId)
          if (!owner) return false
          if (!owner.isPrivate) return true
          if (owner.id === req.user.id) return true
          return allowedPrivateIds.has(owner.id)
        })
        .map(story => toApiStory(story, ownerMap.get(story.userId)))

      return res.json({ stories: visibleStories })
    } catch (err) {
      console.error('Load stories DB error:', err)
      return res.status(500).json({ error: 'Failed to load stories' })
    }
  }

  const dbState = readDb()
  const storyCutoffMs = storyCutoffDate.getTime()

  const visibleStories = dbState.stories
    .filter(story => new Date(story.createdAt).getTime() >= storyCutoffMs)
    .filter(story => {
      const owner = dbState.users.find(user => user.id === story.userId)
      return canViewUserContent(req.user.id, owner, dbState)
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(story => {
      const owner = dbState.users.find(user => user.id === story.userId)
      return toApiStory(story, owner)
    })

  return res.json({ stories: visibleStories })
}

app.get('/api/stories', authRequired, getStoriesHandler)
app.get('/api/stories/feed', authRequired, getStoriesHandler)

app.delete('/api/stories/:id', authRequired, async (req, res) => {
  if (USE_POSTGRES_RUNTIME && db) {
    try {
      const storyRows = await db
        .select()
        .from(stories)
        .where(eq(stories.id, req.params.id))
        .limit(1)
      const story = storyRows[0]

      if (!story) {
        return res.status(404).json({ error: 'Story not found' })
      }

      if (req.user.id !== story.userId) {
        return res.status(403).json({ error: 'Only the story owner can delete this story' })
      }

      await db.delete(stories).where(eq(stories.id, story.id))
      return res.status(204).send()
    } catch (err) {
      console.error('Delete story DB error:', err)
      return res.status(500).json({ error: 'Failed to delete story' })
    }
  }

  const dbState = readDb()
  const storyIndex = dbState.stories.findIndex(story => story.id === req.params.id)
  if (storyIndex === -1) {
    return res.status(404).json({ error: 'Story not found' })
  }

  const story = dbState.stories[storyIndex]
  if (req.user.id !== story.userId) {
    return res.status(403).json({ error: 'Only the story owner can delete this story' })
  }

  dbState.stories.splice(storyIndex, 1)
  writeDb(dbState)
  return res.status(204).send()
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

  const dbState = readDb()
  const target = dbState.users.find(u => u.id === req.params.id)
  if (!target) return res.status(404).json({ error: 'User not found' })
  if (target.id === req.userId) {
    return res.status(400).json({ error: 'Cannot follow yourself' })
  }

  const existing = dbState.follows.find(
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
  dbState.follows.push(follow)

  const me = dbState.users.find(u => u.id === req.userId)
  if (status === 'accepted') {
    me.followingCount += 1
    target.followerCount += 1
  }

  writeDb(dbState)
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

  const dbState = readDb()
  const target = dbState.users.find(u => u.id === req.params.id)
  if (!target) {
    return res.json({ status: 'none', isFollowing: false, isPending: false })
  }

  if (target.id === req.userId) {
    return res.json({ status: 'self', isFollowing: false, isPending: false })
  }

  const relationship = dbState.follows.find(
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

  const dbState = readDb()
  const index = dbState.follows.findIndex(
    follow => follow.followerId === req.userId && follow.followingId === req.params.id
  )
  if (index === -1) {
    return res.status(404).json({ error: 'Follow relationship not found' })
  }

  const follow = dbState.follows[index]
  const follower = dbState.users.find(user => user.id === follow.followerId)
  const following = dbState.users.find(user => user.id === follow.followingId)
  if (follow.status === 'accepted') {
    if (follower?.followingCount > 0) follower.followingCount -= 1
    if (following?.followerCount > 0) following.followerCount -= 1
  }

  dbState.follows.splice(index, 1)
  writeDb(dbState)
  return res.status(204).send()
})

app.delete('/api/follows/:id', authRequired, async (req, res) => {
  if (USE_POSTGRES_RUNTIME && db) {
    try {
      const followRows = await db
        .select()
        .from(follows)
        .where(eq(follows.id, req.params.id))
        .limit(1)
      const follow = followRows[0]
      if (!follow) return res.status(404).json({ error: 'Follow record not found' })

      if (follow.followerId !== req.userId && follow.followingId !== req.userId) {
        return res.status(403).json({ error: 'Not allowed to remove this follow relationship' })
      }

      await db.delete(follows).where(eq(follows.id, follow.id))
      return res.status(204).send()
    } catch (err) {
      console.error('Delete follow DB error:', err)
      return res.status(500).json({ error: 'Failed to remove follow relationship' })
    }
  }

  const dbState = readDb()
  const index = dbState.follows.findIndex(f => f.id === req.params.id)
  if (index === -1) return res.status(404).json({ error: 'Follow record not found' })

  const follow = dbState.follows[index]
  if (follow.followerId !== req.userId && follow.followingId !== req.userId) {
    return res.status(403).json({ error: 'Not allowed to remove this follow relationship' })
  }

  const follower = dbState.users.find(u => u.id === follow.followerId)
  const following = dbState.users.find(u => u.id === follow.followingId)
  if (follow.status === 'accepted') {
    if (follower?.followingCount > 0) follower.followingCount -= 1
    if (following?.followerCount > 0) following.followerCount -= 1
  }

  dbState.follows.splice(index, 1)
  writeDb(dbState)
  res.status(204).send()
})

app.post('/api/follows/:id/approve', authRequired, async (req, res) => {
  if (USE_POSTGRES_RUNTIME && db) {
    try {
      const followRows = await db
        .select()
        .from(follows)
        .where(eq(follows.id, req.params.id))
        .limit(1)
      const follow = followRows[0]
      if (!follow) return res.status(404).json({ error: 'Follow request not found' })
      if (follow.followingId !== req.userId) {
        return res.status(403).json({ error: 'Only target user can approve follow requests' })
      }
      if (follow.status === 'accepted') {
        return res.status(409).json({ error: 'Follow request already approved' })
      }

      const updatedRows = await db
        .update(follows)
        .set({ status: 'accepted' })
        .where(eq(follows.id, follow.id))
        .returning()

      return res.json(updatedRows[0])
    } catch (err) {
      console.error('Approve follow DB error:', err)
      return res.status(500).json({ error: 'Failed to approve follow request' })
    }
  }

  const dbState = readDb()
  const follow = dbState.follows.find(f => f.id === req.params.id)
  if (!follow) return res.status(404).json({ error: 'Follow request not found' })
  if (follow.followingId !== req.userId) {
    return res.status(403).json({ error: 'Only target user can approve follow requests' })
  }

  if (follow.status === 'accepted') {
    return res.status(409).json({ error: 'Follow request already approved' })
  }

  follow.status = 'accepted'
  const follower = dbState.users.find(u => u.id === follow.followerId)
  const following = dbState.users.find(u => u.id === follow.followingId)
  if (follower) follower.followingCount += 1
  if (following) following.followerCount += 1

  writeDb(dbState)
  res.json(follow)
})

app.post('/api/follows/:id/reject', authRequired, async (req, res) => {
  if (USE_POSTGRES_RUNTIME && db) {
    try {
      const followRows = await db
        .select()
        .from(follows)
        .where(eq(follows.id, req.params.id))
        .limit(1)
      const follow = followRows[0]
      if (!follow) return res.status(404).json({ error: 'Follow request not found' })
      if (follow.followingId !== req.userId) {
        return res.status(403).json({ error: 'Only target user can reject follow requests' })
      }

      await db.delete(follows).where(eq(follows.id, follow.id))
      return res.status(204).send()
    } catch (err) {
      console.error('Reject follow DB error:', err)
      return res.status(500).json({ error: 'Failed to reject follow request' })
    }
  }

  const dbState = readDb()
  const index = dbState.follows.findIndex(f => f.id === req.params.id)
  if (index === -1) return res.status(404).json({ error: 'Follow request not found' })

  const follow = dbState.follows[index]
  if (follow.followingId !== req.userId) {
    return res.status(403).json({ error: 'Only target user can reject follow requests' })
  }

  dbState.follows.splice(index, 1)
  writeDb(dbState)
  res.status(204).send()
})

app.get('/api/users/:id/followers', authRequired, async (req, res) => {
  if (USE_POSTGRES_RUNTIME && db) {
    try {
      const followRows = await db
        .select()
        .from(follows)
        .where(and(eq(follows.followingId, req.params.id), eq(follows.status, 'accepted')))
        .orderBy(desc(follows.createdAt))

      const followerIds = followRows.map(follow => follow.followerId)
      const followerUsers = followerIds.length > 0
        ? await db
          .select()
          .from(users)
          .where(and(inArray(users.id, followerIds), isNull(users.deletedAt)))
        : []
      const statsMap = await getFollowStatsMapFromDb(followerUsers.map(user => user.id))
      const followerMap = new Map(followerUsers.map(user => [user.id, user]))

      const followersPayload = followRows
        .map(follow => serializeFollowUser(followerMap.get(follow.followerId), follow, statsMap))
        .filter(Boolean)

      return res.json({ followers: followersPayload })
    } catch (err) {
      console.error('Followers DB error:', err)
      return res.status(500).json({ error: 'Failed to load followers' })
    }
  }

  const dbState = readDb()
  const followRows = dbState.follows
    .filter(follow => follow.followingId === req.params.id && follow.status === 'accepted')
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  const followerUsers = followRows
    .map(follow => dbState.users.find(user => user.id === follow.followerId))
    .filter(Boolean)
  const statsMap = getFollowStatsMapFromJson(followerUsers.map(user => user.id), dbState)
  const followerMap = new Map(followerUsers.map(user => [user.id, user]))

  const followersPayload = followRows
    .map(follow => serializeFollowUser(followerMap.get(follow.followerId), follow, statsMap))
    .filter(Boolean)

  res.json({ followers: followersPayload })
})

app.get('/api/users/:id/following', authRequired, async (req, res) => {
  if (USE_POSTGRES_RUNTIME && db) {
    try {
      const followRows = await db
        .select()
        .from(follows)
        .where(and(eq(follows.followerId, req.params.id), eq(follows.status, 'accepted')))
        .orderBy(desc(follows.createdAt))

      const followingIds = followRows.map(follow => follow.followingId)
      const followingUsers = followingIds.length > 0
        ? await db
          .select()
          .from(users)
          .where(and(inArray(users.id, followingIds), isNull(users.deletedAt)))
        : []
      const statsMap = await getFollowStatsMapFromDb(followingUsers.map(user => user.id))
      const followingMap = new Map(followingUsers.map(user => [user.id, user]))

      const followingPayload = followRows
        .map(follow => serializeFollowUser(followingMap.get(follow.followingId), follow, statsMap))
        .filter(Boolean)

      return res.json({ following: followingPayload })
    } catch (err) {
      console.error('Following DB error:', err)
      return res.status(500).json({ error: 'Failed to load following list' })
    }
  }

  const dbState = readDb()
  const followRows = dbState.follows
    .filter(follow => follow.followerId === req.params.id && follow.status === 'accepted')
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  const followingUsers = followRows
    .map(follow => dbState.users.find(user => user.id === follow.followingId))
    .filter(Boolean)
  const statsMap = getFollowStatsMapFromJson(followingUsers.map(user => user.id), dbState)
  const followingMap = new Map(followingUsers.map(user => [user.id, user]))

  const followingPayload = followRows
    .map(follow => serializeFollowUser(followingMap.get(follow.followingId), follow, statsMap))
    .filter(Boolean)

  res.json({ following: followingPayload })
})

app.get('/api/users/:id/follow-requests', authRequired, async (req, res) => {
  if (req.userId !== req.params.id) {
    return res.status(403).json({ error: 'Can only view your own follow requests' })
  }

  if (USE_POSTGRES_RUNTIME && db) {
    try {
      const followRows = await db
        .select()
        .from(follows)
        .where(and(eq(follows.followingId, req.params.id), eq(follows.status, 'pending')))
        .orderBy(desc(follows.createdAt))

      const followerIds = followRows.map(follow => follow.followerId)
      const followerUsers = followerIds.length > 0
        ? await db
          .select()
          .from(users)
          .where(and(inArray(users.id, followerIds), isNull(users.deletedAt)))
        : []
      const statsMap = await getFollowStatsMapFromDb(followerUsers.map(user => user.id))
      const followerMap = new Map(followerUsers.map(user => [user.id, user]))

      const requests = followRows
        .map(follow => ({
          ...follow,
          follower: toApiUserFromDb(followerMap.get(follow.followerId), statsMap.get(follow.followerId))
        }))
        .filter(request => request.follower)

      return res.json({ requests })
    } catch (err) {
      console.error('Follow requests DB error:', err)
      return res.status(500).json({ error: 'Failed to load follow requests' })
    }
  }

  const dbState = readDb()
  const followRows = dbState.follows
    .filter(follow => follow.followingId === req.params.id && follow.status === 'pending')
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  const followerUsers = followRows
    .map(follow => dbState.users.find(user => user.id === follow.followerId))
    .filter(Boolean)
  const statsMap = getFollowStatsMapFromJson(followerUsers.map(user => user.id), dbState)
  const followerMap = new Map(followerUsers.map(user => [user.id, user]))

  const requests = followRows
    .map(follow => ({
      ...follow,
      follower: toApiUserFromDb(followerMap.get(follow.followerId), statsMap.get(follow.followerId))
    }))
    .filter(request => request.follower)

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

      const statsMap = await getFollowStatsMapFromDb(rows.map(user => user.id))
      return res.json({ users: attachFollowStats(rows, statsMap) })
    } catch (err) {
      console.error('User search DB error:', err)
      return sendDatabaseError(res, 'Failed to search users', err)
    }
  }

  const dbState = readDb()
  const matchingUsers = dbState.users
    .filter(u => u.username.includes(q) || u.fullName.toLowerCase().includes(q))
    .slice(0, 20)
  const statsMap = getFollowStatsMapFromJson(matchingUsers.map(user => user.id), dbState)

  res.json({ users: attachFollowStats(matchingUsers, statsMap) })
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
      const statsMap = await getFollowStatsMapFromDb([user.id])
      return res.json({ user: toApiUserFromDb(user, statsMap.get(user.id)), posts: payloadPosts })
    } catch (err) {
      console.error('User profile DB error:', err)
      return sendDatabaseError(res, 'Failed to load user profile', err)
    }
  }

  const dbState = readDb()
  const username = String(req.params.username).toLowerCase().replace(/^@/, '')
  const user = dbState.users.find(u => u.username === username)
  if (!user) return res.status(404).json({ error: 'User not found' })

  const canView = canViewUserContent(req.userId, user, dbState)
  if (!canView) {
    return res.status(403).json({ error: 'This account is private' })
  }

  const userPosts = dbState.posts
    .filter(p => p.userId === user.id && !p.deletedAt)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

  const statsMap = getFollowStatsMapFromJson([user.id], dbState)
  res.json({ user: toApiUserFromDb(user, statsMap.get(user.id)), posts: userPosts })
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

  const dbState = readDb()
  const user = dbState.users.find(u => u.id === req.params.id)
  if (!user) return res.status(404).json({ error: 'User not found' })

  if (Object.prototype.hasOwnProperty.call(req.body, 'bio')) user.bio = String(req.body.bio || '').trim()
  if (Object.prototype.hasOwnProperty.call(req.body, 'website')) user.website = String(req.body.website || '').trim()

  const allowedFields = ['fullName', 'profilePicture', 'isPrivate']
  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(req.body, field)) {
      user[field] = req.body[field]
    }
  }
  user.updatedAt = new Date().toISOString()

  writeDb(dbState)
  res.json(safeUser(user))
})

app.use((err, _req, res, next) => {
  void next
  console.error('Unhandled API error:', err)
  if (res.headersSent) return
  res.status(err?.status || 500).json({ error: err?.message || 'Internal server error' })
})

app.listen(PORT, () => {
  console.log(`Backend API running on http://localhost:${PORT}`)
  if (USE_POSTGRES_RUNTIME) {
    console.log('Runtime storage: Neon PostgreSQL via Drizzle ORM')
  } else if (hasDatabaseUrl) {
    console.log('Runtime storage: JSON file (Neon configured but explicitly disabled)')
  } else {
    console.log('Runtime storage: JSON file (configure DATABASE_URL to enable Neon runtime)')
  }
})
