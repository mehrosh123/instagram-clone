# Instagram Clone - Complete Implementation Guide

## 📋 Project Overview

A full-featured Instagram clone built with **React + Vite** frontend with comprehensive backend documentation. Includes authentication, posts with multiple images, stories, comments, and social features.

### Key Features Implemented
- ✅ User Authentication (Sign-up/Login)
- ✅ Posts (Create, Edit, Delete)
- ✅ Multiple Images per Post (up to 10)
- ✅ Comments (CRUD operations)
- ✅ Likes on Posts and Comments
- ✅ Stories (24-hour visibility)
- ✅ Follow/Unfollow System
- ✅ Private Accounts (Follow Requests)
- ✅ Full-Text Search
- ✅ User Profiles
- ✅ Responsive Design

---

## 🏗️ Architecture Overview

### Frontend Structure
```
src/
├── components/          # React components
│   ├── Feed.jsx        # Posts feed
│   ├── Post.jsx        # Individual post
│   ├── Header.jsx      # Navigation header
│   ├── Profile.jsx     # User profile
│   ├── Sidebar.jsx     # Left navigation
│   ├── Stories.jsx     # Stories carousel
│   ├── Search.jsx      # User search
│   ├── Followers.jsx   # Follow system
│   ├── Login.jsx       # Login page
│   └── Signup.jsx      # Registration page
├── context/
│   └── AuthContext.jsx # Global auth state (Context API)
├── styles/             # Component CSS
├── backend/            # Backend documentation
│   └── DATABASE_SCHEMA.js  # Database & API docs
├── App.jsx            # Root component
├── index.css          # Global styles
└── THEORY_AND_ARCHITECTURE.js

package.json           # Dependencies
vite.config.js        # Build configuration
```

### Component Hierarchy
```
App (Root)
├── Header (Navigation)
├── Sidebar (Left menu)
├── MainContent
│   ├── Feed
│   │   ├── Stories
│   │   └── Post (Multiple)
│   │       ├── Comments
│   │       └── Likes
│   ├── Profile
│   │   ├── FollowersList
│   │   ├── FollowingList
│   │   └── FollowRequests
│   └── Search
└── SuggestedUsers (Right sidebar)
```

### Technology Stack

**Frontend:**
- React 19.2.4
- Vite 8 (build tool)
- CSS3 (Flexbox, Grid)
- Context API (state management)

**Backend (To be implemented):**
- PostgreSQL (database)
- Node.js/Express or Python/Django
- JWT Authentication
- AWS S3 / Cloud Storage
- Redis (caching, sessions)

---

## 🎯 React Concepts Used

### 1. **State Management (useState)**
State determines what the UI renders. When state changes, component re-renders:
```javascript
const [count, setCount] = useState(0)
setCount(count + 1) // Triggers re-render
```

### 2. **Props (Component Communication)**
Parent passes data to children via props:
```javascript
<Post post={post} onLike={handleLike} />
```

### 3. **Context API (Global State)**
Share state across components without prop drilling:
```javascript
const { currentUser, login } = useAuth()
```

### 4. **useEffect (Side Effects)**
Handle API calls, timers, and other side effects:
```javascript
useEffect(() => {
  fetchPosts() // Runs once on mount
}, [])
```

### 5. **Conditional Rendering**
Show/hide UI based on conditions:
```javascript
{isLoading ? <Loading /> : <Feed />}
```

### 6. **Event Handling**
Handle user interactions:
```javascript
const handleLike = (postId) => { /* ... */ }
<button onClick={() => handleLike(postId)}>Like</button>
```

### 7. **Controlled Components**
Form inputs managed by React state:
```javascript
<input value={email} onChange={(e) => setEmail(e.target.value)} />
```

### 8. **Array Rendering (.map())**
Render lists of components:
```javascript
{posts.map(post => <Post key={post.id} post={post} />)}
```

---

## 🗄️ Database Schema (Backend)

### Key Tables

**Users Table**
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR UNIQUE,
  username VARCHAR UNIQUE,
  password_hash VARCHAR,
  full_name VARCHAR,
  bio TEXT,
  profile_picture_url VARCHAR,
  is_private BOOLEAN,
  created_at TIMESTAMP
);
```

**Posts Table**
```sql
CREATE TABLE posts (
  id UUID PRIMARY KEY,
  user_id UUID FOREIGN KEY,
  caption TEXT,
  created_at TIMESTAMP
);
```

**Posts_Images Table** (supports up to 10 images)
```sql
CREATE TABLE posts_images (
  id UUID PRIMARY KEY,
  post_id UUID FOREIGN KEY,
  image_url VARCHAR,
  image_order INTEGER (1-10)
);
```

**Comments Table**
```sql
CREATE TABLE comments (
  id UUID PRIMARY KEY,
  post_id UUID FOREIGN KEY,
  user_id UUID FOREIGN KEY,
  text TEXT,
  parent_comment_id UUID (for replies),
  created_at TIMESTAMP
);
```

**Follows Table** (Many-to-Many)
```sql
CREATE TABLE follows (
  follower_id UUID FOREIGN KEY,
  following_id UUID FOREIGN KEY,
  status VARCHAR ('accepted' | 'pending'),
  UNIQUE(follower_id, following_id)
);
```

**Stories Table** (24-hour expiration)
```sql
CREATE TABLE stories (
  id UUID PRIMARY KEY,
  user_id UUID FOREIGN KEY,
  image_url VARCHAR,
  expires_at TIMESTAMP (NOW() + 24 hours),
  created_at TIMESTAMP
);
-- Delete expired: DELETE FROM stories WHERE expires_at < NOW()
```

**Likes Table**
```sql
CREATE TABLE likes (
  id UUID PRIMARY KEY,
  user_id UUID FOREIGN KEY,
  post_id UUID FOREIGN KEY,
  comment_id UUID FOREIGN KEY,
  UNIQUE(user_id, post_id) -- prevent duplicate likes
);
```

---

## 🔐 Authentication Flow

### Sign-Up
1. User enters email, username, password
2. Frontend validates inputs
3. Frontend sends to `/api/auth/signup`
4. Backend:
   - Validates data on server (important!)
   - Hashes password with bcrypt
   - Creates user in database
   - Returns JWT token
5. Frontend stores token, redirects to home

### Login
1. User enters email, password
2. Frontend sends to `/api/auth/login`
3. Backend:
   - Finds user by email
   - Compares password hash
   - Returns JWT token if match
4. Frontend stores token in localStorage
5. All API requests include: `Authorization: Bearer token`

### Protected Routes
- Check if token exists
- Verify token validity
- Get current user info from token

---

## 📱 Key Features Explained

### Posts with Multiple Images
- **Frontend:** Image upload component, preview carousel
- **Backend:** Store image URLs in posts_images table
- **Constraint:** Maximum 10 images per post (database CHECK constraint)
- **Storage:** Upload to S3/Cloud Storage, store URL in database

### Stories (24-hour Expiration)
- **Creation:** Store `expires_at = NOW() + 24 hours`
- **Query:** `WHERE expires_at > NOW()`
- **Cleanup:** Scheduled job deletes at expiration
- **Client Display:** Show countdown timer
- **Database Index:** On `expires_at` for cleanup queries

### Private Accounts & Follow Requests
- **Flow:**
  1. User sets account to private: `UPDATE users SET is_private = TRUE`
  2. Others try to follow → creates `follows` entry with `status='pending'`
  3. User approves → `UPDATE follows SET status='accepted'`
  4. Feed query: Only show posts if `is_follower AND (is_public OR accepted)`

### Comments
- **Nesting:** `parent_comment_id` allows replies
- **Editing:** User can edit own comments
- **Deletion:** Owner of post can delete any comment
- **Likes:** Comments can be liked separately

### Full-Text Search
**PostgreSQL Implementation:**
```sql
CREATE INDEX idx_users_search ON users USING GIN (
  to_tsvector('english', username || ' ' || full_name)
);

SELECT * FROM users 
WHERE to_tsvector('english', username || ' ' || full_name)
      @@ plainto_tsquery('english', 'search query')
LIMIT 20;
```

**Frontend:** Debounced search input (wait 300ms after user stops typing)

---

## 🚀 Getting Started

### Install Dependencies
```bash
cd "my instagram"
npm install
```

### Start Development Server
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173)

### Build for Production
```bash
npm run build
```

### Project Structure Quick Reference
- `src/components` - All React components
- `src/styles` - Component-specific CSS
- `src/context` - Global state (AuthContext)
- `src/backend` - Backend documentation
- `public` - Static files
- `index.html` - HTML entry point

---

## 🔄 State Management Flow

### Using Context API
```javascript
// 1. Wrap app with provider
<AuthProvider>
  <App />
</AuthProvider>

// 2. Use in any component
const { currentUser, logout } = useAuth()

// 3. Update state
const handleLogout = () => logout()
```

### Component State vs Global State
**Use local state (useState) for:**
- Form inputs
- UI toggles (show/hide)
- Animations

**Use global state (Context) for:**
- Current user
- Authentication status
- Settings
- Theme

---

## 🎨 Styling Approach

### CSS Variables (Global Theme)
```css
:root {
  --primary-color: #0095f6;
  --text-color: #262626;
  --border-color: #dbdbdb;
  --light-bg: #fafafa;
}
```

### Flexbox Layout
```css
.post {
  display: flex;
  flex-direction: column;
  gap: 12px; /* spacing between items */
}
```

### CSS Grid (for complex layouts)
```css
.app-body {
  display: grid;
  grid-template-columns: 260px 1fr 320px; /* sidebar, content, suggestions */
  gap: 30px;
}
```

### Mobile Responsive
```css
@media (max-width: 768px) {
  /* Mobile styles */
  .app-body {
    grid-template-columns: 1fr; /* Single column on mobile */
  }
}
```

---

## 🔗 API Endpoints (To Be Implemented)

### Authentication
- `POST /api/auth/signup` - Create account
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Current user
- `POST /api/auth/logout` - Logout

### Posts
- `GET /api/posts/feed` - Get feed
- `POST /api/posts` - Create post
- `PUT /api/posts/:id` - Edit post
- `DELETE /api/posts/:id` - Delete post
- `POST /api/posts/:id/like` - Like post

### Comments
- `POST /api/posts/:id/comments` - Add comment
- `PUT /api/comments/:id` - Edit comment
- `DELETE /api/comments/:id` - Delete comment

### Follows
- `POST /api/users/:id/follow` - Follow user
- `DELETE /api/follows/:id` - Unfollow
- `GET /api/users/:id/followers` - List followers
- `POST /api/follows/:id/approve` - Approve follow request

### Stories
- `POST /api/stories` - Create story
- `DELETE /api/stories/:id` - Delete story
- `GET /api/stories/feed` - Get feed stories

### Search
- `GET /api/users/search?q=<query>` - Search users

---

## 🧠 Key Design Decisions

### 1. **Context API instead of Redux**
- Smaller project, simpler state needs
- Context is sufficient for authentication
- Redux would be overkill

### 2. **Separation of Concerns**
- Feed component manages posts list
- Post component renders single post
- Comments component (in Post) handles comments
- Each component has clear responsibility

### 3. **Optimistic Updates**
- Like button shows liked immediately
- If API fails, rollback
- Improves UX (feels responsive)

### 4. **Immutable State Updates**
- Never mutate state directly
- Use spread operator to create new objects
- Ensures React detects changes and re-renders

### 5. **Props Drilling vs Context**
- Small data: Props (Keep flow explicit)
- Global data: Context (Avoid prop drilling)

---

## 📚 Learning Resources

### React Official
- [React.dev Documentation](https://react.dev)
- [Hooks API Reference](https://react.dev/reference/react)

### Key Concepts Explained
- `useState` - Managing component state
- `useEffect` - Side effects and lifecycle
- `useContext` - Global state without Redux
- `Custom Hooks` - Encapsulate logic

### Database Design
- SQL relationships and constraints
- Indexes for performance
- Full-text search implementation

---

## 🛠️ Extending the Project

### Add Messaging Feature
1. Create `Messages.jsx` component
2. Add `messages` table in database
3. Implement WebSocket for real-time updates
4. Add message notifications

### Add Reels (Video Posts)
1. Similar to posts, but store video_url instead
2. Video metadata (duration, views)
3. Reels feed with infinite scroll

### Add Notifications
1. Create `Notifications.jsx` component
2. Add `notifications` table
3. Implement WebSocket for real-time
4. Show badge count on notification icon

### Add Dark Mode
1. Add theme context
2. CSS variables for dark colors
3. Toggle button in header
4. Save preference to localStorage

---

## ⚠️ Security Best Practices

### Backend Implementation Should Include:
1. **Password Security**
   - Hash with bcrypt (cost factor: 12)
   - Enforce strong passwords
   - Never store plain passwords

2. **Authentication**
   - Use JWT for stateless auth
   - Implement refresh tokens
   - Validate permissions on every endpoint

3. **Input Validation**
   - Validate all user inputs
   - Prevent SQL injection with parameterized queries
   - Sanitize outputs

4. **HTTPS Only**
   - Redirect HTTP to HTTPS
   - No sensitive data over HTTP

5. **Rate Limiting**
   - Limit login attempts (5 per 15 min)
   - Limit API calls per user
   - Prevent brute force attacks

6. **CORS Configuration**
   - Whitelist allowed domains
   - Don't allow all origins (Access-Control-Allow-Origin: *)

7. **File Upload Security**
   - Validate file types
   - Limit file sizes
   - Store in external service (S3)
   - Generate random filenames

---

## 📊 Performance Optimization Tips

### Frontend
- Code splitting for lazy loading
- Image optimization and lazy loading
- Memoization (React.memo) for expensive components
- Virtualization for long lists

### Backend
- Database indexes on frequently queried columns
- Query optimization and pagination
- Caching with Redis
- CDN for static image delivery

### Database
- Create indexes on foreign keys
- Use EXPLAIN to analyze queries
- Archive old data (stories, deleted posts)
- Regular VACUUM and ANALYZE

---

## 🐛 Common Issues & Solutions

### Issue: Infinite re-renders
**Cause:** Missing dependency array in useEffect
```javascript
// WRONG: runs on every render
useEffect(() => { fetch('/api/data') })

// RIGHT: runs once on mount
useEffect(() => { fetch('/api/data') }, [])
```

### Issue: Stale data after update
**Solution:** Refetch data or invalidate cache
```javascript
const handleLike = async (postId) => {
  // Update UI optimistically
  setLiked(true)
  
  try {
    await fetch(`/api/posts/${postId}/like`, { method: 'POST' })
    // Refetch post data
    const post = await fetch(`/api/posts/${postId}`)
  } catch {
    setLiked(false) // Rollback
  }
}
```

### Issue: Prop drilling (too many component levels)
**Solution:** Use Context API
```javascript
// Create context
const PostContext = createContext()

// Wrap component tree
<PostContext.Provider value={posts}>
  <Feed />
</PostContext.Provider>

// Use anywhere
const { posts } = useContext(PostContext)
```

---

## 📝 Code Conventions

### Naming
- Components: PascalCase (`Feed.jsx`, `Post.jsx`)
- Functions/hooks: camelCase (`handleLike`, `useAuth`)
- Constants: UPPERCASE (`MAX_IMAGES = 10`)
- CSS classes: kebab-case (`.post-header`)

### Comments
- Document WHY, not WHAT (code shows what)
- Use JSDoc for functions
- Explain complex algorithms
- Link to external resources if needed

### Component Structure
```javascript
// 1. Imports
import { useState } from 'react'
import '../styles/Post.css'

// 2. Comments explaining component
/**
 * Post Component
 * Shows individual post with likes and comments
 */

// 3. Component definition
export default function Post({ post, onLike }) {
  // State
  const [liked, setLiked] = useState(false)
  
  // Effects
  useEffect(() => { /* ... */ }, [])
  
  // Event handlers
  const handleLike = () => { /* ... */ }
  
  // Render
  return <div>...</div>
}
```

---

## ✅ Check Implementation Completeness

- [ ] All 6 modules implemented
- [ ] User authentication (signup/login)
- [ ] Posts with up to 10 images
- [ ] Stories with 24-hour expiration
- [ ] Comments with edit/delete
- [ ] Followers with private account support
- [ ] Full-text search functionality
- [ ] Responsive design (mobile, tablet, desktop)
- [ ] Error handling and validation
- [ ] Loading states

---

## 📞 Getting Help

If you encounter issues:
1. Check the error message carefully
2. Review related code documentation in comments
3. Check THEORY_AND_ARCHITECTURE.js for concept explanations
4. Review DATABASE_SCHEMA.js for backend structure
5. Test in browser console (F12 → Console)

---

## 🎓 Further Learning

After completing this project:
- Learn Redux for more complex state
- Implement real-time features with WebSockets
- Add infinite scrolling to feed
- Implement image optimization and CDN
- Add E2E testing with Cypress/Playwright
- Deploy to production (Vercel, Netlify, AWS)

---

**Happy Coding! 🚀**
