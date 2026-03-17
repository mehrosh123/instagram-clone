# Demo Project Requirements (Instagram Clone)

Date baseline: 27/07/2021
Updated: 17/03/2026

## 1. Users Module

### Functional Requirements
- User can sign-up.
- User can sign-in.
- User profile contains required account fields.
- User can set display picture.

### Users Table (Required Columns)
- id (UUID, primary key)
- email (unique, indexed, required)
- username (unique, indexed, required)
- password_hash (required in real backend; demo may use local placeholder)
- full_name
- bio
- website
- profile_picture_url
- is_private (default false)
- is_verified (default false)
- follower_count (default 0)
- following_count (default 0)
- created_at
- updated_at
- deleted_at (nullable soft delete)

### Validation Rules
- email format valid
- username unique and normalized
- password minimum 8 chars, uppercase, number
- display picture URL optional but valid when provided

## 2. Posts Module

### Functional Requirements
- User can create posts.
- User can edit/delete own posts.
- Post supports up to 10 images.

### Posts Tables (Required)
posts:
- id (UUID, PK)
- user_id (FK users.id)
- caption
- likes_count
- comments_count
- is_edited
- created_at
- updated_at
- deleted_at

posts_images:
- id (UUID, PK)
- post_id (FK posts.id)
- image_url
- image_order
- created_at
- constraint: image_order <= 10
- unique(post_id, image_order)

### Authorization Rules
- only owner can update/delete post
- create requires authenticated user

## 3. Stories Module

### Functional Requirements
- User can add stories.
- User can delete own stories.
- Story expires in 24 hours unless deleted.
- Users can see each others stories based on visibility rules.

### Stories Table (Required)
- id (UUID, PK)
- user_id (FK users.id)
- image_url
- caption
- created_at
- expires_at
- deleted_at

### Visibility Rules
- only stories where expires_at > NOW() are visible
- private account stories visible only to accepted followers

## 4. Comments + Likes Module

### Functional Requirements
- Post can have many comments.
- User can comment on own and others posts.
- Comment owner can edit/delete own comment.
- Post owner can delete comments on their post.
- Users can like own/others posts.

### Comments Table (Required)
- id (UUID, PK)
- post_id (FK posts.id)
- user_id (FK users.id)
- text
- likes_count
- parent_comment_id (nullable FK comments.id for replies)
- created_at
- updated_at
- deleted_at

### Likes Table (Required)
- id (UUID, PK)
- user_id (FK users.id)
- post_id (nullable FK posts.id)
- comment_id (nullable FK comments.id)
- created_at
- unique(user_id, post_id)
- unique(user_id, comment_id)
- check(post_id is not null or comment_id is not null)

## 5. Followers / Privacy Module

### Functional Requirements
- Users can follow each other.
- Account can be private or public.
- Private posts visible only after follow request accepted.

### Follows Table (Required)
- id (UUID, PK)
- follower_id (FK users.id)
- following_id (FK users.id)
- status ('pending' | 'accepted')
- created_at
- unique(follower_id, following_id)
- check(follower_id != following_id)

### Privacy Logic
- public account: follow creates accepted relation immediately
- private account: follow creates pending request
- private posts visible only to accepted followers

## 6. Search Module

### Functional Requirements
- Header has search field.
- Searching users shows results dropdown/list below input.
- Clicking user redirects to profile show page.

### Search Implementation Rules
- preferred: full-text search (PostgreSQL tsvector/tsquery)
- acceptable: ILIKE/LIKE only with proper TRGM GIN index

### Required Indexes
- CREATE EXTENSION IF NOT EXISTS pg_trgm;
- CREATE INDEX idx_users_username_trgm ON users USING GIN (username gin_trgm_ops);
- CREATE INDEX idx_users_full_name_trgm ON users USING GIN (full_name gin_trgm_ops);
- optional full-text GIN index on (username || full_name)

## API Summary (Minimum)
- POST /api/auth/signup
- POST /api/auth/login
- GET /api/auth/me
- POST /api/posts
- PUT /api/posts/:id
- DELETE /api/posts/:id
- POST /api/posts/:id/comments
- PUT /api/comments/:id
- DELETE /api/comments/:id
- POST /api/posts/:id/like
- DELETE /api/posts/:id/like
- POST /api/users/:id/follow
- POST /api/follows/:id/approve
- POST /api/follows/:id/reject
- POST /api/stories
- DELETE /api/stories/:id
- GET /api/stories/feed
- GET /api/users/search?q=query

## Demo Note
This frontend currently includes demo/local behavior for authentication state and user profile picture handling. Production deployment should replace local demo persistence with real backend APIs and secure password hashing.
