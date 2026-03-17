# Backend Setup (Demo)

## Run Commands

From project root (my instagram):

- Install deps: `npm install`
- Run frontend only: `npm run dev`
- Run backend only: `npm run dev:backend`
- Run frontend + backend together: `npm run dev:full`

Backend URL: `http://localhost:4000`
Frontend URL: `http://localhost:5173`

## Implemented Backend Modules

- Users: signup, login, current user, update profile, profile picture support
- Posts: create, feed, edit own post, delete own post, up to 10 images
- Stories: create, 24-hour visibility, delete own story, stories feed
- Comments: add to own/others post, edit/delete own or post-owner moderation
- Likes: like/unlike posts
- Followers: follow, pending requests for private accounts, approve/reject, followers/following lists
- Search: user search endpoint

## Main Endpoints

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `PUT /api/users/:id`
- `GET /api/users/:username`
- `GET /api/users/search?q=<query>`
- `POST /api/posts`
- `GET /api/posts/feed`
- `PUT /api/posts/:id`
- `DELETE /api/posts/:id`
- `POST /api/posts/:id/comments`
- `PUT /api/comments/:id`
- `DELETE /api/comments/:id`
- `POST /api/posts/:id/like`
- `DELETE /api/posts/:id/like`
- `POST /api/stories`
- `GET /api/stories/feed`
- `DELETE /api/stories/:id`
- `POST /api/users/:id/follow`
- `DELETE /api/follows/:id`
- `POST /api/follows/:id/approve`
- `POST /api/follows/:id/reject`
- `GET /api/users/:id/followers`
- `GET /api/users/:id/following`
- `GET /api/users/:id/follow-requests`

## Storage

- Demo persistence uses `backend/data.json`
- PostgreSQL schema reference is in `backend/sql/schema.postgres.sql`

## Notes

- This backend is a demo API for project requirements coverage.
- For production: add PostgreSQL, migrations, refresh tokens, rate limiting, validation middleware, and upload storage (S3/GCS).
