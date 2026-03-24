import express from 'express'
import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const USERNAME_REGEX = /^[a-zA-Z0-9._-]{3,20}$/
const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d).{8,}$/

function createEmptyDb() {
  return {
    users: [],
    posts: [],
    comments: [],
    likes: [],
    follows: [],
    stories: []
  }
}

function normalizeText(value) {
  if (typeof value === 'string') {
    return value
  }
  if (value == null) {
    return ''
  }
  return String(value)
}

function normalizeTrimmedText(value) {
  return normalizeText(value).trim()
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true') return true
    if (normalized === 'false') return false
  }
  return fallback
}

function normalizeCount(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0
  }
  return Math.trunc(parsed)
}

function isValidHttpUrl(value) {
  try {
    const url = new URL(String(value))
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function normalizeUserRecord(user = {}) {
  const now = new Date().toISOString()
  const fullName = normalizeTrimmedText(user.fullName ?? user.full_name ?? user.fullname)
  const profilePicture = normalizeTrimmedText(
    user.profilePicture ?? user.profile_picture_url ?? user.profile_picture
  )

  return {
    id: normalizeText(user.id),
    email: normalizeTrimmedText(user.email).toLowerCase(),
    username: normalizeTrimmedText(user.username).toLowerCase().replace(/^@/, ''),
    passwordHash: normalizeText(user.passwordHash ?? user.password_hash ?? user.password),
    fullName,
    fullname: fullName,
    bio: normalizeText(user.bio),
    website: normalizeTrimmedText(user.website),
    profilePicture,
    profile_picture: profilePicture,
    isPrivate: normalizeBoolean(user.isPrivate ?? user.is_private),
    isVerified: normalizeBoolean(user.isVerified ?? user.is_verified),
    followerCount: normalizeCount(user.followerCount ?? user.follower_count),
    followingCount: normalizeCount(user.followingCount ?? user.following_count),
    createdAt: user.createdAt ?? user.created_at ?? now,
    updatedAt: user.updatedAt ?? user.updated_at ?? now,
    deletedAt: user.deletedAt ?? user.deleted_at ?? null
  }
}

function safeUser(user) {
  const normalizedUser = normalizeUserRecord(user)

  return {
    id: normalizedUser.id,
    username: normalizedUser.username,
    fullname: normalizedUser.fullName,
    fullName: normalizedUser.fullName,
    email: normalizedUser.email,
    bio: normalizedUser.bio,
    website: normalizedUser.website,
    profile_picture: normalizedUser.profilePicture,
    profilePicture: normalizedUser.profilePicture,
    isPrivate: normalizedUser.isPrivate,
    isVerified: normalizedUser.isVerified,
    followerCount: normalizedUser.followerCount,
    followingCount: normalizedUser.followingCount,
    createdAt: normalizedUser.createdAt,
    updatedAt: normalizedUser.updatedAt,
    deletedAt: normalizedUser.deletedAt
  }
}

function validateUserFields({
  email,
  username,
  password,
  fullname,
  profilePicture,
  website
}) {
  if (!email || !EMAIL_REGEX.test(email)) {
    return 'A valid email is required'
  }

  if (!username || !USERNAME_REGEX.test(username)) {
    return 'Username must be 3-20 characters and can only include letters, numbers, periods, underscores, and hyphens'
  }

  if (password != null && !PASSWORD_REGEX.test(String(password))) {
    return 'Password must be at least 8 characters and include an uppercase letter and a number'
  }

  if (!fullname || fullname.length < 2) {
    return 'Full name must be at least 2 characters'
  }

  if (profilePicture && !isValidHttpUrl(profilePicture)) {
    return 'Display picture must be a valid http(s) URL'
  }

  if (website && !isValidHttpUrl(website)) {
    return 'Website must be a valid http(s) URL'
  }

  return null
}

function readDb(dataFile) {
  if (!fs.existsSync(dataFile)) {
    fs.writeFileSync(dataFile, JSON.stringify(createEmptyDb(), null, 2), 'utf8')
  }

  const raw = fs.readFileSync(dataFile, 'utf8')
  const normalizedRaw = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw
  const parsed = JSON.parse(normalizedRaw)

  return {
    ...createEmptyDb(),
    ...parsed,
    users: Array.isArray(parsed.users)
      ? parsed.users.filter(item => item && typeof item === 'object').map(normalizeUserRecord)
      : []
  }
}

function writeDb(dataFile, db) {
  const nextDb = {
    ...db,
    users: Array.isArray(db.users)
      ? db.users.filter(item => item && typeof item === 'object').map(normalizeUserRecord)
      : []
  }

  fs.writeFileSync(dataFile, JSON.stringify(nextDb, null, 2), 'utf8')
}

function issueToken(jwtSecret, userId) {
  return jwt.sign({ sub: userId }, jwtSecret, { expiresIn: '7d' })
}

function authRequired(jwtSecret) {
  return (req, res, next) => {
    const authHeader = req.headers.authorization || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

    if (!token) {
      return res.status(401).json({ error: 'Missing token' })
    }

    try {
      const payload = jwt.verify(token, jwtSecret)
      req.userId = payload.sub
      next()
    } catch {
      return res.status(401).json({ error: 'Invalid token' })
    }
  }
}

export function createAuthRouter({ dataFile, jwtSecret }) {
  const router = express.Router()

  router.post('/signup', async (req, res) => {
    try {
      const payload = req.body || {}
      const email = normalizeTrimmedText(payload.email).toLowerCase()
      const username = normalizeTrimmedText(payload.username).toLowerCase().replace(/^@/, '')
      const password = normalizeText(payload.password)
      const fullname = normalizeTrimmedText(payload.fullname ?? payload.fullName ?? payload.full_name)
      const bio = normalizeText(payload.bio).trim()
      const website = normalizeTrimmedText(payload.website)
      const profilePicture = normalizeTrimmedText(
        payload.profile_picture ?? payload.profilePicture ?? payload.profile_picture_url
      )
      const isPrivate = normalizeBoolean(payload.isPrivate ?? payload.is_private)

      if (!email || !username || !password || !fullname) {
        return res.status(400).json({ error: 'email, username, fullname, and password are required' })
      }

      const validationError = validateUserFields({
        email,
        username,
        password,
        fullname,
        profilePicture,
        website
      })

      if (validationError) {
        return res.status(400).json({ error: validationError })
      }

      const db = readDb(dataFile)

      if (db.users.some(user => user.email === email)) {
        return res.status(409).json({ error: 'Email already exists' })
      }

      if (db.users.some(user => user.username === username)) {
        return res.status(409).json({ error: 'Username already exists' })
      }

      const passwordHash = await bcrypt.hash(password, 10)
      const now = new Date().toISOString()
      const user = normalizeUserRecord({
        id: randomUUID(),
        username,
        fullname,
        email,
        password: passwordHash,
        bio,
        website,
        profile_picture: profilePicture,
        isPrivate,
        isVerified: false,
        followerCount: 0,
        followingCount: 0,
        createdAt: now,
        updatedAt: now,
        deletedAt: null
      })

      db.users.push(user)
      writeDb(dataFile, db)

      return res.status(201).json({
        token: issueToken(jwtSecret, user.id),
        user: safeUser(user)
      })
    } catch (err) {
      console.error('Signup error:', err)
      return res.status(500).json({ error: err?.message || 'Signup failed due to server error' })
    }
  })

  const signInHandler = async (req, res) => {
    try {
      const email = normalizeTrimmedText(req.body?.email).toLowerCase()
      const password = normalizeText(req.body?.password)

      if (!email || !password) {
        return res.status(400).json({ error: 'email and password are required' })
      }

      if (!EMAIL_REGEX.test(email)) {
        return res.status(400).json({ error: 'A valid email is required' })
      }

      const db = readDb(dataFile)
      const user = db.users.find(item => item.email === email)

      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' })
      }

      const isValidPassword = await bcrypt.compare(password, user.passwordHash)
      if (!isValidPassword) {
        return res.status(401).json({ error: 'Invalid credentials' })
      }

      return res.json({
        token: issueToken(jwtSecret, user.id),
        user: safeUser(user)
      })
    } catch (err) {
      console.error('Signin error:', err)
      return res.status(500).json({ error: err?.message || 'Signin failed due to server error' })
    }
  }

  router.post('/signin', signInHandler)
  router.post('/login', signInHandler)

  router.get('/me', authRequired(jwtSecret), (req, res) => {
    const db = readDb(dataFile)
    const user = db.users.find(item => item.id === req.userId)

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    return res.json(safeUser(user))
  })

  return router
}
