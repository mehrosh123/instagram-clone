import express from 'express'
import cors from 'cors'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const app = express()
const PORT = process.env.PORT || 4000
const JWT_SECRET = process.env.JWT_SECRET || 'demo-secret-change-in-production'
const DATA_FILE = path.join(process.cwd(), 'backend', 'data.json')

app.use(cors({ origin: ['http://localhost:5173'], credentials: true }))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

function readDb() {
  const raw = fs.readFileSync(DATA_FILE, 'utf8')
  return JSON.parse(raw)
}

function writeDb(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf8')
}

function safeUser(user) {
  const { passwordHash, ...rest } = user
  return rest
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

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'instagram-clone-backend' })
})

app.post('/api/auth/signup', async (req, res) => {
  const {
    email,
    username,
    password,
    fullName,
    profilePicture = '',
    bio = '',
    website = '',
    isPrivate = false
  } = req.body

  if (!email || !username || !password || !fullName) {
    return res.status(400).json({ error: 'email, username, password, fullName are required' })
  }

  const db = readDb()
  const normalizedEmail = String(email).trim().toLowerCase()
  const normalizedUsername = String(username).trim().toLowerCase().replace(/^@/, '')

  if (db.users.some(u => u.email === normalizedEmail)) {
    return res.status(409).json({ error: 'Email already exists' })
  }
  if (db.users.some(u => u.username === normalizedUsername)) {
    return res.status(409).json({ error: 'Username already exists' })
  }

  const passwordHash = await bcrypt.hash(password, 10)
  const now = new Date().toISOString()

  const user = {
    id: randomUUID(),
    email: normalizedEmail,
    username: normalizedUsername,
    passwordHash,
    fullName: String(fullName).trim(),
    bio: String(bio),
    website: String(website),
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
})

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' })
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
  const db = readDb()
  const user = db.users.find(u => u.id === req.userId)
  if (!user) return res.status(404).json({ error: 'User not found' })
  return res.json(safeUser(user))
})

app.post('/api/posts', authRequired, (req, res) => {
  const { caption = '', images = [] } = req.body
  if (!Array.isArray(images)) {
    return res.status(400).json({ error: 'images must be an array' })
  }
  if (images.length > 10) {
    return res.status(400).json({ error: 'Maximum 10 images allowed per post' })
  }

  const db = readDb()
  const now = new Date().toISOString()

  const post = {
    id: randomUUID(),
    userId: req.userId,
    caption: String(caption),
    images,
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

app.get('/api/posts/feed', authRequired, (req, res) => {
  const db = readDb()
  const feed = db.posts
    .filter(post => !post.deletedAt)
    .filter(post => {
      const owner = db.users.find(u => u.id === post.userId)
      return canViewUserContent(req.userId, owner, db)
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(post => {
      const owner = db.users.find(u => u.id === post.userId)
      const comments = db.comments
        .filter(comment => comment.postId === post.id && !comment.deletedAt)
        .map(comment => {
          const author = db.users.find(user => user.id === comment.userId)
          return {
            ...comment,
            author: author ? safeUser(author) : null
          }
        })
      const likedByMe = db.likes.some(like => like.postId === post.id && like.userId === req.userId)

      return {
        ...post,
        author: owner ? safeUser(owner) : null,
        comments,
        likedByMe
      }
    })

  res.json({ posts: feed })
})

app.put('/api/posts/:id', authRequired, (req, res) => {
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

  if (typeof caption === 'string') post.caption = caption
  if (Array.isArray(images)) post.images = images
  post.isEdited = true
  post.updatedAt = new Date().toISOString()

  writeDb(db)
  res.json(post)
})

app.delete('/api/posts/:id', authRequired, (req, res) => {
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

app.post('/api/posts/:id/comments', authRequired, (req, res) => {
  const { text = '', parentCommentId = null } = req.body
  if (!String(text).trim()) {
    return res.status(400).json({ error: 'Comment text is required' })
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

app.put('/api/comments/:id', authRequired, (req, res) => {
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

app.delete('/api/comments/:id', authRequired, (req, res) => {
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

app.post('/api/posts/:id/like', authRequired, (req, res) => {
  const db = readDb()
  const post = db.posts.find(p => p.id === req.params.id && !p.deletedAt)
  if (!post) return res.status(404).json({ error: 'Post not found' })

  const existing = db.likes.find(l => l.userId === req.userId && l.postId === post.id)
  if (existing) {
    return res.status(409).json({ error: 'Post already liked' })
  }

  db.likes.push({
    id: randomUUID(),
    userId: req.userId,
    postId: post.id,
    commentId: null,
    createdAt: new Date().toISOString()
  })
  post.likesCount += 1
  writeDb(db)
  res.status(201).json({ liked: true, likesCount: post.likesCount })
})

app.delete('/api/posts/:id/like', authRequired, (req, res) => {
  const db = readDb()
  const post = db.posts.find(p => p.id === req.params.id && !p.deletedAt)
  if (!post) return res.status(404).json({ error: 'Post not found' })

  const index = db.likes.findIndex(l => l.userId === req.userId && l.postId === post.id)
  if (index === -1) return res.status(404).json({ error: 'Like not found' })

  db.likes.splice(index, 1)
  if (post.likesCount > 0) post.likesCount -= 1
  writeDb(db)
  res.json({ liked: false, likesCount: post.likesCount })
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

app.post('/api/users/:id/follow', authRequired, (req, res) => {
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

app.delete('/api/users/:id/follow', authRequired, (req, res) => {
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

app.get('/api/users/search', authRequired, (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase()
  if (q.length < 1) return res.json({ users: [] })

  const db = readDb()
  const users = db.users
    .filter(u => u.username.includes(q) || u.fullName.toLowerCase().includes(q))
    .slice(0, 20)
    .map(safeUser)

  res.json({ users })
})

app.get('/api/users/:username', authRequired, (req, res) => {
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

app.put('/api/users/:id', authRequired, (req, res) => {
  if (req.userId !== req.params.id) {
    return res.status(403).json({ error: 'Can only update your own profile' })
  }

  const db = readDb()
  const user = db.users.find(u => u.id === req.params.id)
  if (!user) return res.status(404).json({ error: 'User not found' })

  const allowedFields = ['fullName', 'bio', 'website', 'profilePicture', 'isPrivate']
  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(req.body, field)) {
      user[field] = req.body[field]
    }
  }
  user.updatedAt = new Date().toISOString()

  writeDb(db)
  res.json(safeUser(user))
})

app.listen(PORT, () => {
  console.log(`Backend API running on http://localhost:${PORT}`)
})
