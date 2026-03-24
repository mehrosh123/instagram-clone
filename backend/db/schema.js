import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  username: varchar('username', { length: 50 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  fullName: varchar('full_name', { length: 150 }).notNull(),
  bio: text('bio').default('').notNull(),
  website: varchar('website', { length: 255 }).default('').notNull(),
  profilePictureUrl: varchar('profile_picture_url', { length: 512 }).default('').notNull(),
  isPrivate: boolean('is_private').default(false).notNull(),
  isVerified: boolean('is_verified').default(false).notNull(),
  followerCount: integer('follower_count').default(0).notNull(),
  followingCount: integer('following_count').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: false })
}, (table) => ({
  createdAtIdx: index('idx_users_created_at').on(table.createdAt)
}))

export const posts = pgTable('posts', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  caption: text('caption').default('').notNull(),
  likesCount: integer('likes_count').default(0).notNull(),
  commentsCount: integer('comments_count').default(0).notNull(),
  isEdited: boolean('is_edited').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: false })
}, (table) => ({
  userCreatedIdx: index('idx_posts_user_created').on(table.userId, table.createdAt),
  createdAtIdx: index('idx_posts_created_at').on(table.createdAt)
}))

export const postImages = pgTable('posts_images', {
  id: uuid('id').defaultRandom().primaryKey(),
  postId: uuid('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  imageUrl: varchar('image_url', { length: 512 }).notNull(),
  imageOrder: integer('image_order').notNull(),
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull()
}, (table) => ({
  uniquePostOrder: unique().on(table.postId, table.imageOrder),
  maxTenImages: check('max_10_images', sql`${table.imageOrder} <= 10`)
}))

export const comments = pgTable('comments', {
  id: uuid('id').defaultRandom().primaryKey(),
  postId: uuid('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  likesCount: integer('likes_count').default(0).notNull(),
  parentCommentId: uuid('parent_comment_id'),
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: false })
})

export const likes = pgTable('likes', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  postId: uuid('post_id').references(() => posts.id, { onDelete: 'cascade' }),
  commentId: uuid('comment_id').references(() => comments.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull()
}, (table) => ({
  uniqueUserPost: unique().on(table.userId, table.postId),
  uniqueUserComment: unique().on(table.userId, table.commentId),
  hasPostOrComment: check('likes_has_target', sql`${table.postId} IS NOT NULL OR ${table.commentId} IS NOT NULL`)
}))

export const follows = pgTable('follows', {
  id: uuid('id').defaultRandom().primaryKey(),
  followerId: uuid('follower_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  followingId: uuid('following_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 20 }).default('accepted').notNull(),
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull()
}, (table) => ({
  uniqueFollowPair: unique().on(table.followerId, table.followingId),
  noSelfFollow: check('follows_not_self', sql`${table.followerId} <> ${table.followingId}`)
}))

export const stories = pgTable('stories', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  imageUrl: varchar('image_url', { length: 512 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull()
}, (table) => ({
  storyCreatedIdx: index('idx_stories_created_at').on(table.createdAt),
  storyUserCreatedIdx: index('idx_stories_user_created').on(table.userId, table.createdAt)
}))
