/**
 * INSTAGRAM CLONE - DATABASE SCHEMA & API DOCUMENTATION
 * ======================================================
 * 
 * This file documents the complete backend database structure
 * and REST API endpoints needed to support the Instagram clone.
 * 
 * Technology Stack Recommendations:
 * - Database: PostgreSQL (superior full-text search, JSONB, GIN indexes)
 * - Backend: Node.js/Express, Python/Django, or Go
 * - Authentication: JWT tokens with refresh tokens
 * - File Storage: AWS S3, Google Cloud Storage, or local filesystem
 * - Caching: Redis for session management and feed caching
 * - Search: PostgreSQL full-text search or Elasticsearch
 */

// ==================== DATABASE SCHEMA ====================

/**
 * 1. USERS TABLE
 * ===============
 * Stores all user account information
 */
const TABLE_USERS = `
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL, -- bcrypt hashed
  full_name VARCHAR(150),
  bio TEXT,
  website VARCHAR(255),
  profile_picture_url VARCHAR(512),
  is_private BOOLEAN DEFAULT FALSE,
  is_verified BOOLEAN DEFAULT FALSE,
  follower_count INTEGER DEFAULT 0,
  following_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL -- soft delete support
);

-- Indexes for performance
CREATE UNIQUE INDEX idx_users_email ON users(email);
CREATE UNIQUE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_created_at ON users(created_at DESC);

-- Full-text search index
CREATE INDEX idx_users_search ON users USING GIN (
  to_tsvector('english', username) || to_tsvector('english', full_name)
);

-- Trigram indexes for fast ILIKE/LIKE fallback search
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_users_username_trgm ON users USING GIN (username gin_trgm_ops);
CREATE INDEX idx_users_full_name_trgm ON users USING GIN (full_name gin_trgm_ops);
`

/**
 * 2. POSTS TABLE
 * ===============
 * Stores individual post metadata
 * Images stored separately in posts_images table
 */
const TABLE_POSTS = `
CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  caption TEXT,
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  is_edited BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL
);

CREATE INDEX idx_posts_user_id_created ON posts(user_id, created_at DESC);
CREATE INDEX idx_posts_created_at ON posts(created_at DESC);
`

/**
 * 3. POSTS_IMAGES TABLE
 * ======================
 * Supports up to 10 images per post
 * Stores image URLs and metadata
 */
const TABLE_POSTS_IMAGES = `
CREATE TABLE posts_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  image_url VARCHAR(512) NOT NULL,
  image_order INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT max_10_images CHECK (image_order <= 10),
  UNIQUE(post_id, image_order)
);

CREATE INDEX idx_posts_images_post_id ON posts_images(post_id);
`

/**
 * 4. COMMENTS TABLE
 * ==================
 * Supports nested comments (replies)
 */
const TABLE_COMMENTS = `
CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  likes_count INTEGER DEFAULT 0,
  parent_comment_id UUID REFERENCES comments(id) ON DELETE CASCADE, -- for replies
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL
);

CREATE INDEX idx_comments_post_user ON comments(post_id, user_id);
CREATE INDEX idx_comments_post_id ON comments(post_id);
CREATE INDEX idx_comments_created_at ON comments(created_at DESC);
`

/**
 * 5. LIKES TABLE
 * ================
 * Stores likes for posts and comments
 */
const TABLE_LIKES = `
CREATE TABLE likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, post_id), -- prevent duplicate likes on posts
  UNIQUE(user_id, comment_id), -- prevent duplicate likes on comments
  CHECK (post_id IS NOT NULL OR comment_id IS NOT NULL)
);

CREATE INDEX idx_likes_user_post ON likes(user_id, post_id);
CREATE INDEX idx_likes_post_id ON likes(post_id);
`

/**
 * 6. FOLLOWS TABLE
 * =================
 * Manages follower relationships
 * Supports private account follow requests
 */
const TABLE_FOLLOWS = `
CREATE TABLE follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'accepted', -- 'accepted' | 'pending'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(follower_id, following_id),
  CHECK (follower_id != following_id) -- can't follow yourself
);

CREATE INDEX idx_follows_follower_id ON follows(follower_id);
CREATE INDEX idx_follows_following_id ON follows(following_id, status);
CREATE INDEX idx_follows_status ON follows(status) WHERE status = 'pending';
`

/**
 * 7. STORIES TABLE
 * =================
 * 24-hour expiring stories
 * Database automatically deletes expired stories
 */
const TABLE_STORIES = `
CREATE TABLE stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  image_url VARCHAR(512) NOT NULL,
  caption TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL, -- created_at + 24 hours
  deleted_at TIMESTAMP NULL
);

-- Compound index for efficient story queries
CREATE INDEX idx_stories_user_created ON stories(user_id, created_at DESC);
-- Index for cleanup jobs (delete expired stories)
CREATE INDEX idx_stories_expires_at ON stories(expires_at);
-- Filter out expired stories: WHERE expires_at > NOW()
`

/**
 * 8. NOTIFICATIONS TABLE
 * =======================
 * Real-time activity notifications
 */
const TABLE_NOTIFICATIONS = `
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL, -- 'like', 'comment', 'follow', 'follow_request'
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notifications_user_id ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications(user_id, is_read);
`

// ==================== REST API ENDPOINTS ====================

/**
 * ======================
 * AUTHENTICATION ENDPOINTS
 * ======================
 */

const AUTH_ENDPOINTS = {
  // POST /api/auth/signup
  signup: {
    description: 'User registration',
    request: {
      email: 'user@example.com',
      username: 'username',
      fullName: 'Full Name',
      profilePicture: 'https://cdn.example.com/profile.jpg',
      password: 'Password123!' // min 8 chars, uppercase, number
    },
    response: {
      token: 'jwt_token_here',
      user: {
        id: 'uuid',
        email: 'user@example.com',
        username: 'username',
        fullName: 'Full Name',
        profilePicture: 'https://cdn.example.com/profile.jpg'
      }
    },
    security: 'Password must be bcrypt hashed on backend'
  },

  // POST /api/auth/login
  login: {
    description: 'User login',
    request: {
      email: 'user@example.com',
      password: 'Password123!'
    },
    response: {
      token: 'jwt_token_here',
      user: { /* user object */ }
    }
  },

  // GET /api/auth/me
  getCurrentUser: {
    description: 'Get currently logged-in user',
    headers: { Authorization: 'Bearer token' },
    response: { /* user object */ }
  },

  // POST /api/auth/logout
  logout: {
    description: 'Invalidate token',
    headers: { Authorization: 'Bearer token' }
  }
}

/**
 * ======================
 * POSTS ENDPOINTS
 * ======================
 */

const POSTS_ENDPOINTS = {
  // GET /api/posts/feed
  getFeed: {
    description: 'Get feed (posts from followed users)',
    query: { limit: 20, offset: 0 },
    headers: { Authorization: 'Bearer token' },
    logic: `
      SELECT posts.* FROM posts
      JOIN follows ON posts.user_id = follows.following_id
      WHERE follows.follower_id = current_user_id
      AND follows.status = 'accepted'
      AND (posts.user.is_private = false OR follows.status = 'accepted')
      ORDER BY posts.created_at DESC
      LIMIT 20 OFFSET 0
    `
  },

  // POST /api/posts
  createPost: {
    description: 'Create new post with up to 10 images',
    headers: { Authorization: 'Bearer token' },
    request: {
      caption: 'Post caption',
      images: ['file1.jpg', 'file2.jpg'] // Upload to S3, return URLs
    },
    response: { id: 'uuid', caption: '', images: [] }
  },

  // PUT /api/posts/:id
  updatePost: {
    description: 'Edit post caption (own posts only)',
    auth: 'Must be post owner'
  },

  // DELETE /api/posts/:id
  deletePost: {
    description: 'Delete post (own posts only)',
    auth: 'Must be post owner'
  },

  // GET /api/posts/:id
  getPost: {
    description: 'Get single post with comments'
  }
}

/**
 * ======================
 * COMMENTS ENDPOINTS
 * ======================
 */

const COMMENTS_ENDPOINTS = {
  // POST /api/posts/:id/comments
  createComment: {
    description: 'Add comment to post',
    headers: { Authorization: 'Bearer token' },
    request: { text: 'Comment text' }
  },

  // PUT /api/comments/:id
  updateComment: {
    description: 'Edit comment (own comments only)',
    auth: 'Must be comment owner'
  },

  // DELETE /api/comments/:id
  deleteComment: {
    description: 'Delete comment (own or post owner)'
  },

  // POST /api/comments/:id/like
  likeComment: {
    description: 'Like a comment'
  }
}

/**
 * ======================
 * LIKES ENDPOINTS
 * ======================
 */

const LIKES_ENDPOINTS = {
  // POST /api/posts/:id/like
  likePost: {
    description: 'Like a post',
    logic: 'INSERT INTO likes (user_id, post_id) VALUES (...)'
  },

  // DELETE /api/posts/:id/like
  unlikePost: {
    description: 'Unlike a post',
    logic: 'DELETE FROM likes WHERE user_id = ? AND post_id = ?'
  }
}

/**
 * ======================
 * FOLLOWERS ENDPOINTS
 * ======================
 */

const FOLLOWERS_ENDPOINTS = {
  // POST /api/users/:id/follow
  followUser: {
    description: 'Follow a user',
    logic: `
      If target user account is private:
        INSERT INTO follows (follower_id, following_id, status)
        VALUES (current_user, target_user, 'pending')
      Else:
        INSERT INTO follows (follower_id, following_id, status)
        VALUES (current_user, target_user, 'accepted')
    `
  },

  // DELETE /api/follows/:id
  unfollowUser: {
    description: 'Unfollow a user or cancel follow request'
  },

  // POST /api/follows/:id/approve
  approvFollowRequest: {
    description: 'Approve pending follow request (own account only)'
  },

  // POST /api/follows/:id/reject
  rejectFollowRequest: {
    description: 'Reject pending follow request'
  },

  // GET /api/users/:id/followers
  getFollowers: {
    description: 'Get list of followers'
  },

  // GET /api/users/:id/following
  getFollowing: {
    description: 'Get list of users being followed'
  },

  // GET /api/users/:id/follow-requests
  getFollowRequests: {
    description: 'Get pending follow requests (own account only)',
    query: `SELECT * FROM follows WHERE following_id = ? AND status = 'pending'`
  }
}

/**
 * ======================
 * STORIES ENDPOINTS
 * ======================
 */

const STORIES_ENDPOINTS = {
  // GET /api/stories/feed
  getStoriesFeed: {
    description: 'Get stories from followed users (24hr only)',
    query: `
      SELECT stories.* FROM stories
      JOIN follows ON stories.user_id = follows.following_id
      WHERE follows.follower_id = current_user_id
      AND stories.expires_at > NOW()
      ORDER BY stories.created_at DESC
    `
  },

  // POST /api/stories
  createStory: {
    description: 'Upload new story (expires in 24 hours)',
    request: { image: 'image_file' },
    logic: 'INSERT INTO stories (user_id, image_url, expires_at) VALUES (..., NOW() + INTERVAL 24 HOURS)'
  },

  // DELETE /api/stories/:id
  deleteStory: {
    description: 'Delete story (own stories only)',
    logic: 'DELETE FROM stories WHERE id = ? AND user_id = current_user'
  }
}

/**
 * ======================
 * SEARCH ENDPOINTS
 * ======================
 */

const SEARCH_ENDPOINTS = {
  // GET /api/users/search?q=<query>
  searchUsers: {
    description: 'Full-text search for users',
    query: 'q (minimum 3 characters)',
    limit: 20,
    logic: `
      PostgreSQL implementation:
      SELECT * FROM users
      WHERE to_tsvector('english', username || ' ' || full_name)
            @@ plainto_tsquery('english', ?)
      LIMIT 20
      
      OR with TRGM GIN index:
      SELECT * FROM users
      WHERE username ILIKE ? OR full_name ILIKE ?
      LIMIT 20
    `
  }
}

/**
 * ======================
 * USER PROFILE ENDPOINTS
 * ======================
 */

const USER_ENDPOINTS = {
  // GET /api/users/:username
  getUserProfile: {
    description: 'Get user profile with posts'
  },

  // PUT /api/users/:id
  updateProfile: {
    description: 'Update own profile',
    fields: ['fullName', 'bio', 'website', 'profilePicture', 'isPrivate']
  },

  // GET /api/users/:id/posts
  getUserPosts: {
    description: 'Get posts by specific user (respects private account)',
    logic: `
      If user.is_private:
        Only show if current_user = user OR is_follower_with_accepted_status
      Else:
        Show all posts
    `
  }
}

/**
 * ======================
 * SECURITY BEST PRACTICES
 * ======================
 */

const SECURITY = `
1. AUTHENTICATION & AUTHORIZATION
   ✓ Use JWT tokens (not session cookies for API)
   ✓ Include refresh tokens for token rotation
   ✓ Store tokens in httpOnly cookies for web
   ✓ Validate permissions on every endpoint (is_owner, is_public, etc.)

2. PASSWORD SECURITY
   ✓ Hash with bcrypt (cost factor: 12)
   ✓ Enforce strong passwords (8+ chars, uppercase, number)
   ✓ Never store plain passwords
   ✓ Implement rate limiting on login/signup (max 5 attempts/15min)

3. DATA VALIDATION
   ✓ Validate all inputs on server (never trust client)
   ✓ Prevent SQL injection with parameterized queries
   ✓ Validate file uploads (type, size, scan for malware)
   ✓ Sanitize user inputs before storing

4. API SECURITY
   ✓ Use HTTPS only (no HTTP)
   ✓ Implement CORS properly (whitelist domains)
   ✓ Rate limiting (prevent brute force, DoS)
   ✓ API versioning (/api/v1/...)
   ✓ Add request validation middleware

5. DATABASE SECURITY
   ✓ Use parameterized queries (prevent SQL injection)
   ✓ Implement soft deletes (deleted_at) for user data
   ✓ Regular backups and disaster recovery plan
   ✓ Encrypt sensitive data (passwords, tokens)

6. FILE UPLOAD SECURITY
   ✓ Store files in S3/Cloud Storage (not local filesystem)
   ✓ Generate random filenames (prevent directory attacks)
   ✓ Validate file types server-side
   ✓ Limit file sizes
   ✓ Scan uploads for malware

7. PRIVATE ACCOUNTS
   ✓ Check is_private flag before serving posts
   ✓ Verify follow request acceptance status
   ✓ Don't expose private user data to non-followers

8. REAL-TIME FEATURES (Optional)
   ✓ Use WebSockets for instant notifications
   ✓ Implement proper connection cleanup
   ✓ Rate limit WebSocket messages
`

console.log('Database Schema and API Documentation loaded successfully')
