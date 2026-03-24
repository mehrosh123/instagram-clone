import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { sql } from 'drizzle-orm'
import { db, hasDatabaseUrl } from '../db/client.js'
import { comments, follows, likes, postImages, posts, stories, users } from '../db/schema.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const defaultDataFile = path.join(__dirname, '..', 'data.json')

function getArgValue(flag) {
  const direct = process.argv.find(arg => arg.startsWith(`${flag}=`))
  if (direct) {
    return direct.slice(flag.length + 1)
  }

  const index = process.argv.findIndex(arg => arg === flag)
  if (index >= 0) {
    return process.argv[index + 1]
  }

  return null
}

function resolveDataFilePath() {
  const customFile = getArgValue('--file')
  if (!customFile) return defaultDataFile
  return path.isAbsolute(customFile) ? customFile : path.resolve(process.cwd(), customFile)
}

function readJsonFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8')
  const normalized = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw
  return JSON.parse(normalized)
}

function normalizeText(value, fallback = '') {
  if (value == null) return fallback
  return String(value)
}

function normalizeTrimmedText(value, fallback = '') {
  return normalizeText(value, fallback).trim()
}

function clampText(value, maxLength, fallback = '') {
  const text = normalizeTrimmedText(value, fallback)
  return text.length > maxLength ? text.slice(0, maxLength) : text
}

function normalizeBoolean(value) {
  return value === true || value === 'true'
}

function normalizeCount(value) {
  const count = Number(value)
  return Number.isFinite(count) ? count : 0
}

function normalizeDate(value, fallback = new Date()) {
  if (!value) return fallback
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? fallback : parsed
}

function normalizeNullableDate(value) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function normalizeImageValue(value, maxLength = 512) {
  const image = normalizeTrimmedText(value)
  if (!image || image.length > maxLength) {
    return ''
  }
  return image
}

async function getCount(table, column = table.id) {
  const rows = await db.select({ count: sql`count(${column})` }).from(table)
  return Number(rows[0]?.count || 0)
}

async function getDatabaseCounts() {
  const [userCount, postCount, postImageCount, commentCount, likeCount, followCount, storyCount] = await Promise.all([
    getCount(users),
    getCount(posts),
    getCount(postImages),
    getCount(comments),
    getCount(likes),
    getCount(follows),
    getCount(stories)
  ])

  return {
    users: userCount,
    posts: postCount,
    postImages: postImageCount,
    comments: commentCount,
    likes: likeCount,
    follows: followCount,
    stories: storyCount
  }
}

async function clearDatabase() {
  await db.delete(likes)
  await db.delete(comments)
  await db.delete(postImages)
  await db.delete(follows)
  await db.delete(stories)
  await db.delete(posts)
  await db.delete(users)
}

function normalizeSeedData(rawData) {
  const sourceUsers = Array.isArray(rawData?.users) ? rawData.users : []
  const sourcePosts = Array.isArray(rawData?.posts) ? rawData.posts : []
  const sourceComments = Array.isArray(rawData?.comments) ? rawData.comments : []
  const sourceLikes = Array.isArray(rawData?.likes) ? rawData.likes : []
  const sourceFollows = Array.isArray(rawData?.follows) ? rawData.follows : []
  const sourceStories = Array.isArray(rawData?.stories) ? rawData.stories : []
  const warnings = {
    blankedUserProfilePictures: 0,
    skippedPostImages: 0,
    skippedPostsWithoutValidImages: 0,
    skippedCommentsMissingRelations: 0,
    skippedLikesMissingRelations: 0,
    skippedFollowsMissingUsers: 0,
    skippedStories: 0
  }

  const normalizedUsers = sourceUsers
    .filter(user => user?.id && user?.email && user?.username && user?.passwordHash && user?.fullName)
    .map(user => ({
      id: normalizeText(user.id),
      email: clampText(normalizeTrimmedText(user.email).toLowerCase(), 255),
      username: clampText(normalizeTrimmedText(user.username).replace(/^@/, '').toLowerCase(), 50),
      passwordHash: normalizeText(user.passwordHash),
      fullName: clampText(user.fullName, 150),
      bio: normalizeText(user.bio),
      website: clampText(user.website, 255),
      profilePictureUrl: (() => {
        const source = normalizeTrimmedText(user.profilePictureUrl ?? user.profilePicture)
        const normalized = normalizeImageValue(source, 512)
        if (source && !normalized) warnings.blankedUserProfilePictures += 1
        return normalized
      })(),
      isPrivate: normalizeBoolean(user.isPrivate),
      isVerified: normalizeBoolean(user.isVerified),
      followerCount: normalizeCount(user.followerCount),
      followingCount: normalizeCount(user.followingCount),
      createdAt: normalizeDate(user.createdAt),
      updatedAt: normalizeDate(user.updatedAt ?? user.createdAt),
      deletedAt: normalizeNullableDate(user.deletedAt)
    }))
  const validUserIds = new Set(normalizedUsers.map(user => user.id))

  const postRows = []
  const postImageRows = []
  for (const post of sourcePosts) {
    if (!post?.id || !post?.userId || !validUserIds.has(normalizeText(post.userId))) {
      continue
    }

    const validImages = (Array.isArray(post.images) ? post.images : [])
      .map(image => normalizeImageValue(image, 512))
      .filter(image => {
        if (!image) warnings.skippedPostImages += 1
        return Boolean(image)
      })
      .slice(0, 10)

    if (validImages.length === 0) {
      warnings.skippedPostsWithoutValidImages += 1
      continue
    }

    postRows.push({
      id: normalizeText(post.id),
      userId: normalizeText(post.userId),
      caption: normalizeText(post.caption),
      likesCount: normalizeCount(post.likesCount),
      commentsCount: normalizeCount(post.commentsCount),
      isEdited: normalizeBoolean(post.isEdited),
      createdAt: normalizeDate(post.createdAt),
      updatedAt: normalizeDate(post.updatedAt ?? post.createdAt),
      deletedAt: normalizeNullableDate(post.deletedAt)
    })

    validImages.forEach((imageUrl, index) => {
      postImageRows.push({
      postId: normalizeText(post.id),
      imageUrl,
      imageOrder: index + 1,
      createdAt: normalizeDate(post.createdAt)
      })
    })
  }
  const normalizedPosts = postRows
  const normalizedPostImages = postImageRows
  const validPostIds = new Set(normalizedPosts.map(post => post.id))

  const normalizedComments = sourceComments
    .filter(comment => {
      const isValid = Boolean(
        comment?.id &&
        comment?.postId &&
        comment?.userId &&
        normalizeTrimmedText(comment.text) &&
        validPostIds.has(normalizeText(comment.postId)) &&
        validUserIds.has(normalizeText(comment.userId))
      )
      if (!isValid) warnings.skippedCommentsMissingRelations += 1
      return isValid
    })
    .map(comment => ({
      id: normalizeText(comment.id),
      postId: normalizeText(comment.postId),
      userId: normalizeText(comment.userId),
      text: normalizeText(comment.text),
      likesCount: normalizeCount(comment.likesCount),
      parentCommentId: comment.parentCommentId ? normalizeText(comment.parentCommentId) : null,
      createdAt: normalizeDate(comment.createdAt),
      updatedAt: normalizeDate(comment.updatedAt ?? comment.createdAt),
      deletedAt: normalizeNullableDate(comment.deletedAt)
    }))
  const validCommentIds = new Set(normalizedComments.map(comment => comment.id))

  const normalizedLikes = sourceLikes
    .filter(like => {
      const hasValidTarget = like?.commentId
        ? validCommentIds.has(normalizeText(like.commentId))
        : like?.postId
          ? validPostIds.has(normalizeText(like.postId))
          : false
      const isValid = Boolean(like?.userId && validUserIds.has(normalizeText(like.userId)) && hasValidTarget)
      if (!isValid) warnings.skippedLikesMissingRelations += 1
      return isValid
    })
    .map(like => ({
      id: like.id ? normalizeText(like.id) : undefined,
      userId: normalizeText(like.userId),
      postId: like.postId ? normalizeText(like.postId) : null,
      commentId: like.commentId ? normalizeText(like.commentId) : null,
      createdAt: normalizeDate(like.createdAt)
    }))

  const normalizedFollows = sourceFollows
    .filter(follow => {
      const isValid = Boolean(
        follow?.followerId &&
        follow?.followingId &&
        validUserIds.has(normalizeText(follow.followerId)) &&
        validUserIds.has(normalizeText(follow.followingId))
      )
      if (!isValid) warnings.skippedFollowsMissingUsers += 1
      return isValid
    })
    .map(follow => ({
      id: follow.id ? normalizeText(follow.id) : undefined,
      followerId: normalizeText(follow.followerId),
      followingId: normalizeText(follow.followingId),
      status: normalizeTrimmedText(follow.status || 'accepted') || 'accepted',
      createdAt: normalizeDate(follow.createdAt)
    }))

  const normalizedStories = sourceStories
    .filter(story => {
      const imageUrl = normalizeImageValue(story?.imageUrl, 512)
      const isValid = Boolean(
        story?.id &&
        story?.userId &&
        validUserIds.has(normalizeText(story.userId)) &&
        imageUrl &&
        !story?.deletedAt
      )
      if (!isValid) warnings.skippedStories += 1
      return isValid
    })
    .map(story => ({
      id: normalizeText(story.id),
      userId: normalizeText(story.userId),
      imageUrl: normalizeImageValue(story.imageUrl, 512),
      createdAt: normalizeDate(story.createdAt)
    }))

  return {
    users: normalizedUsers,
    posts: normalizedPosts,
    postImages: normalizedPostImages,
    comments: normalizedComments,
    likes: normalizedLikes,
    follows: normalizedFollows,
    stories: normalizedStories,
    warnings
  }
}

async function insertUsers(rows) {
  for (const row of rows) {
    await db.insert(users).values(row).onConflictDoNothing()
  }
}

async function insertPosts(rows) {
  for (const row of rows) {
    await db.insert(posts).values(row).onConflictDoNothing()
  }
}

async function insertPostImages(rows) {
  for (const row of rows) {
    await db.insert(postImages).values(row).onConflictDoNothing()
  }
}

async function insertComments(rows) {
  for (const row of rows) {
    await db.insert(comments).values(row).onConflictDoNothing()
  }
}

async function insertLikes(rows) {
  for (const row of rows) {
    await db.insert(likes).values(row).onConflictDoNothing()
  }
}

async function insertFollows(rows) {
  for (const row of rows) {
    await db.insert(follows).values(row).onConflictDoNothing()
  }
}

async function insertStories(rows) {
  for (const row of rows) {
    await db.insert(stories).values(row).onConflictDoNothing()
  }
}

async function main() {
  if (!hasDatabaseUrl || !db) {
    throw new Error('DATABASE_URL is not configured. Neon seeding requires backend/.env to be set.')
  }

  const dataFilePath = resolveDataFilePath()
  if (!fs.existsSync(dataFilePath)) {
    throw new Error(`Seed data file not found: ${dataFilePath}`)
  }

  const rawData = readJsonFile(dataFilePath)
  const seedData = normalizeSeedData(rawData)
  const resetRequested = process.argv.includes('--reset')

  console.log(`Seeding Neon from ${dataFilePath}`)
  console.log(`Mode: ${resetRequested ? 'reset-and-seed' : 'merge-seed'}`)
  console.log(`Source counts: ${JSON.stringify({
    users: seedData.users.length,
    posts: seedData.posts.length,
    postImages: seedData.postImages.length,
    comments: seedData.comments.length,
    likes: seedData.likes.length,
    follows: seedData.follows.length,
    stories: seedData.stories.length
  })}`)
  console.log(`Normalization warnings: ${JSON.stringify(seedData.warnings)}`)

  const beforeCounts = await getDatabaseCounts()
  console.log(`Database counts before: ${JSON.stringify(beforeCounts)}`)

  if (resetRequested) {
    await clearDatabase()
  }

  await insertUsers(seedData.users)
  await insertPosts(seedData.posts)
  await insertPostImages(seedData.postImages)
  await insertComments(seedData.comments)
  await insertLikes(seedData.likes)
  await insertFollows(seedData.follows)
  await insertStories(seedData.stories)

  const afterCounts = await getDatabaseCounts()
  console.log(`Database counts after: ${JSON.stringify(afterCounts)}`)
  console.log('Seed completed successfully.')
}

main().catch(error => {
  console.error('Seed failed:', error?.message || error)
  process.exitCode = 1
})
