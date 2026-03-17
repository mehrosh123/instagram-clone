/**
 * INSTAGRAM CLONE - COMPREHENSIVE THEORY & ARCHITECTURE GUIDE
 * ============================================================
 * 
 * This document explains the key concepts, patterns, and best practices
 * used in building this Instagram clone application.
 */

// ==================== REACT CONCEPTS ====================

/**
 * 1. COMPONENTS & JSX
 * ====================
 * 
 * Components are reusable pieces of UI.
 * Two types: Functional (modern) and Class (legacy)
 * 
 * Functional Components (recommended):
 * - Regular JavaScript functions
 * - Return JSX (HTML-like syntax)
 * - Can use React hooks (useState, useEffect, etc.)
 * - Simpler, more readable code
 * 
 * Example:
 * function MyComponent() {
 *   return <h1>Hello World</h1>
 * }
 * 
 * JSX is NOT HTML. It's JavaScript:
 * - JSX compiles to React.createElement() calls
 * - className instead of class (class is reserved)
 * - onClick instead of onclick
 * - camelCase for attributes
 */

/**
 * 2. STATE & useState HOOK
 * =========================
 * 
 * State = Data that can change over time
 * When state changes, component re-renders
 * 
 * Pattern:
 * const [state, setState] = useState(initialValue)
 * 
 * setState triggers re-render with new state
 * React compares old & new JSX, updates only changed DOM elements
 * 
 * Immutable updates:
 * // WRONG: mutates state
 * state.name = 'new name'
 * 
 * // RIGHT: creates new object
 * setState({ ...state, name: 'new name' })
 * 
 * Array updates:
 * // Add item
 * setState([...state, newItem])
 * 
 * // Remove item
 * setState(state.filter(item => item.id !== id))
 * 
 * // Update item
 * setState(state.map(item =>
 *   item.id === id ? { ...item, updated: true } : item
 * ))
 */

/**
 * 3. PROPS (PROPERTIES)
 * =====================
 * 
 * Props = How parent components pass data to children
 * Data flows one way: Parent → Child
 * Child cannot modify parent props
 * 
 * Usage:
 * function PostCard({ post, onLike }) {
 *   return <button onClick={() => onLike(post.id)}>Like</button>
 * }
 * 
 * // Parent component:
 * <PostCard post={post} onLike={handleLike} />
 * 
 * Benefits:
 * - Reusable components (pass different data)
 * - Easier testing (inject test data)
 * - Clear data flow (predictable)
 * 
 * Prop Drilling Problem:
 * When data must pass through many component levels
 * Solution: Context API (for global state)
 */

/**
 * 4. useEffect HOOK (SIDE EFFECTS)
 * =================================
 * 
 * Side effects = operations that affect things outside the component
 * Examples:
 * - API calls (fetch data)
 * - DOM manipulation
 * - Timers/intervals
 * - Event listeners
 * - LocalStorage
 * 
 * Pattern:
 * useEffect(() => {
 *   // This runs AFTER render
 *   console.log('Component mounted or dependencies changed')
 *   
 *   // Cleanup function (optional)
 *   return () => {
 *     console.log('Component will unmount')
 *   }
 * }, [dependencies]) // Re-run when dependencies change
 * 
 * Dependency array:
 * - [] (empty): runs once on mount
 * - [var]: runs when var changes
 * - [var1, var2]: runs when either var1 or var2 change
 * - Omitted: runs every render (BAD - infinite loops!)
 * 
 * Common pattern (fetch data):
 * useEffect(() => {
 *   fetch('/api/data').then(data => setState(data))
 * }, []) // Only on mount
 */

/**
 * 5. CONTEXT API (GLOBAL STATE)
 * ==============================
 * 
 * Problem: Prop drilling (data passed through many levels)
 * Solution: Context provides global state access
 * 
 * Key Concept: Provider Pattern
 * const Context = createContext()
 * 
 * function Provider({ children }) {
 *   const [state, setState] = useState()
 *   return (
 *     <Context.Provider value={{ state, setState }}>
 *       {children}
 *     </Context.Provider>
 *   )
 * }
 * 
 * Any child can access value with useContext:
 * function MyComponent() {
 *   const { state, setState } = useContext(Context)
 *   return <p>{state}</p>
 * }
 * 
 * When to use:
 * ✓ Authentication state (current user, is logged in)
 * ✓ Theme (dark/light mode)
 * ✓ Notifications
 * ✗ Frequently changing data (use Redux/Zustand instead)
 * 
 * Instagram clone uses Context for AuthContext
 * Stores currentUser, login/logout methods
 */

/**
 * 6. CONTROLLED COMPONENTS
 * =========================
 * 
 * Form inputs controlled by React state
 * React is "single source of truth" for form data
 * 
 * Pattern:
 * function Form() {
 *   const [email, setEmail] = useState('')
 *   
 *   return (
 *     <input
 *       value={email}
 *       onChange={(e) => setEmail(e.target.value)}
 *     />
 *   )
 * }
 * 
 * Benefits:
 * - Can validate input in real-time
 * - Can disable submit if invalid
 * - Easy to reset form
 * - Can integrate with state management
 * 
 * Uncontrolled components (old style):
 * - Let browser manage input state
 * - Use refs to get value
 * - Not recommended for forms
 */

// ==================== FRONTEND PATTERNS ====================

/**
 * 7. LIFT STATE UP
 * =================
 * 
 * If multiple components need same state,
 * move state to their common parent
 * 
 * Problem:
 * function Parent() {
 *   return (
 *     <>
 *       <Child1 /> {/* has local state */}
 *       <Child2 /> {/* needs Child1's state */}
 *     </>
 *   )
 * }
 * 
 * Solution:
 * function Parent() {
 *   const [state, setState] = useState()
 *   return (
 *     <>
 *       <Child1 state={state} setState={setState} />
 *       <Child2 state={state} />
 *     </>
 *   )
 * }
 * 
 * This is used in Feed component:
 * Feed has posts state
 * Post components receive posts via props
 * Posts call handleLike function (prop) to update Feed state
 */

/**
 * 8. OPTIMISTIC UPDATES
 * ======================
 * 
 * User clicks "Like"
 * Immediately show liked (update UI)
 * Then make API call in background
 * If API fails, rollback the change
 * 
 * Benefits:
 * - Feels instant (better UX)
 * - Doesn't wait for server response
 * - Works on slow connections
 * 
 * Implementation:
 * function handleLike(postId) {
 *   // 1. Update UI immediately (optimistic)
 *   setLiked(true)
 *   
 *   // 2. Make API call
 *   fetch(`/api/posts/${postId}/like`, { method: 'POST' })
 *     .catch(err => {
 *       // 3. If fails, rollback
 *       setLiked(false)
 *     })
 * }
 * 
 * Used in Follow button: Like button shows liked immediately
 */

/**
 * 9. DEBOUNCING & THROTTLING
 * ============================
 * 
 * Debouncing: Wait for user to stop action, then fire once
 * Throttling: Fire repeatedly at fixed intervals
 * 
 * Search example (Debouncing):
 * User types "instagram"
 * Instead of searching 9 times:
 * 1. Wait 300ms after each keystroke
 * 2. If user keeps typing, cancel previous timeout
 * 3. After 300ms of no input, search once
 * 
 * Benefits:
 * - Reduces server load
 * - Reduces network bandwidth
 * - Improves perceived performance
 *
 * Implementation:
 * const handleSearch = (query) => {
 *   clearTimeout(timeoutId)
 *   timeoutId = setTimeout(() => {
 *     fetch(`/api/search?q=${query}`)
 *   }, 300)
 * }
 */

/**
 * 10. CONDITIONAL RENDERING
 * ===========================
 * 
 * Show/hide elements based on condition
 * 
 * Patterns:
 * 
 * // Ternary operator (most common)
 * {isLoggedIn ? <Feed /> : <LoginPage />}
 * 
 * // AND operator (show only if true)
 * {hasError && <ErrorMessage />}
 * 
 * // If/else statement
 * if (isLoading) return <Loading />
 * return <Content />
 * 
 * // Switch statement (multiple conditions)
 * switch(currentPage) {
 *   case 'home': return <Feed />
 *   case 'profile': return <Profile />
 *   default: return <NotFound />
 * }
 * 
 * Used in Instagram clone:
 * {showResults && <SearchDropdown />}
 * {currentUser === 'home' ? <Feed /> : <Profile />}
 */

// ==================== FRONTEND ARCHITECTURE ====================

/**
 * 11. FOLDER STRUCTURE
 * ======================
 * 
 * Best practices for organizing React projects:
 * 
 * my instagram/
 * ├── public/             // Static files (favicon, etc)
 * ├── src/
 * │   ├── components/    // Reusable UI components
 * │   │   ├── Feed.jsx
 * │   │   ├── Post.jsx
 * │   │   ├── Login.jsx  // Page components
 * │   │   └── Profile.jsx
 * │   ├── context/       // Context API providers
 * │   │   └── AuthContext.jsx
 * │   ├── hooks/         // Custom React hooks
 * │   │   └── useAuth.js
 * │   ├── styles/        // Component CSS files
 * │   │   ├── Post.css
 * │   │   └── Feed.css
 * │   ├── backend/       // Backend docs & types
 * │   │   └── DATABASE_SCHEMA.js
 * │   ├── utils/         // Helper functions
 * │   │   └── api.js    // API calls
 * │   ├── App.jsx       // Root component
 * │   ├── main.jsx      // Entry point
 * │   └── index.css     // Global styles
 * └── package.json
 * 
 * Organization rules:
 * - One component per file
 * - Components named PascalCase
 * - Utilities/hooks named camelCase
 * - Group related files
 * - Keep file sizes small (<200 lines)
 */

/**
 * 12. SEPARATION OF CONCERNS
 * ============================
 * 
 * Each file/component has ONE responsibility
 * 
 * ✓ Feed.jsx: Only manages post list
 * ✓ Post.jsx: Only renders single post
 * ✓ Header.jsx: Only renders header
 * ✗ Don't put all code in one file
 * 
 * Benefits:
 * - Easier to test
 * - Easier to maintain
 * - Easier to reuse
 * - Code is more readable
 * 
 * In Instagram clone:
 * - Feed handles post data
 * - Post handles individual post UI
 * - Comments are embedded in Post (could be separate)
 * - Header handles navigation
 */

// ==================== DATABASE CONCEPTS ====================

/**
 * 13. DATABASE RELATIONSHIPS
 * ===========================
 * 
 * One-to-Many:
 * User has many Posts
 * users (1) ←→ (∞) posts
 * Post has foreign key: user_id
 * 
 * Many-to-Many:
 * Users have many Followers, Followers have many Users
 * users (∞) ←→ (∞) follows
 * Requires junction table: follows(follower_id, following_id)
 * 
 * Self-referential:
 * Comments can have parent comments (replies)
 * comments table has: id, parent_comment_id
 * 
 * Denormalization:
 * Store likes_count in posts table
 * Could calculate from likes table, but slow
 * Instead: store count, increment/decrement on like/unlike
 * Trade-off: slightly stale data for better performance
 */

/**
 * 14. INDEXES FOR PERFORMANCE
 * =============================
 * 
 * Indexes make queries faster (O(log n) instead of O(n))
 * 
 * When to index:
 * ✓ Foreign keys (joins)
 * ✓ WHERE clause columns
 * ✓ ORDER BY columns
 * ✓ Search columns
 * 
 * Indexes in Instagram clone:
 * - users(email) - login queries
 * - users(username) - profile lookup
 * - posts(user_id, created_at) - user's posts
 * - posts(created_at) - feed sorting
 * - follows(following_id, status) - check if accepted follower
 * - stories(expires_at) - cleanup job
 * 
 * Trade-off: Indexes speed up reads, slow down writes
 */

/**
 * 15. FULL-TEXT SEARCH
 * =====================
 * 
 * Instead of LIKE queries (slow):
 * SELECT * FROM users WHERE username LIKE '%john%'
 * This does a full table scan
 * 
 * Use full-text search (fast):
 * PostgreSQL:
 * CREATE INDEX idx_search ON users USING GIN (
 *   to_tsvector('english', username || ' ' || full_name)
 * )
 * 
 * Query:
 * SELECT * FROM users
 * WHERE to_tsvector('english', username || ' ' || full_name)
 *       @@ plainto_tsquery('english', 'john')
 * 
 * Benefits:
 * - Much faster (especially large tables)
 * - Handles typos and stemming
 * - Can exclude stop words (the, a, and)
 * - O(log n) instead of O(n)
 * 
 * Alternatives:
 * - Elasticsearch (external service)
 * - MySQL FULLTEXT index
 * - TRGM GIN index in PostgreSQL
 */

/**
 * 16. SOFT DELETES VS HARD DELETES
 * ==================================
 * 
 * Hard delete:
 * DELETE FROM users WHERE id = ?
 * - Removes row permanently
 * - Can't recover data
 * - Can break foreign key references
 * 
 * Soft delete:
 * UPDATE users SET deleted_at = NOW() WHERE id = ?
 * - Marks as deleted, keeps data
 * - Can recover/restore
 * - Must filter out in queries
 * - Query: WHERE deleted_at IS NULL
 * 
 * Instagram clone uses soft deletes:
 * - Allows account recovery
 * - Keeps audit trail
 * - Safer for business data
 * 
 * Trade-off: Harder to ensure data privacy (GDPR right to be forgotten)
 */

// ==================== API & BACKEND PATTERNS ====================

/**
 * 17. REST API DESIGN
 * ====================
 * 
 * REST = Representational State Transfer
 * 
 * Resource-based URLs (not action-based):
 * ✓ GET /api/posts - list all posts
 * ✓ POST /api/posts - create post
 * ✓ GET /api/posts/123 - get specific post
 * ✓ PUT /api/posts/123 - update post
 * ✓ DELETE /api/posts/123 - delete post
 * 
 * ✗ GET /api/getPosts - not RESTful
 * ✗ POST /api/deletePost - not RESTful
 * 
 * HTTP Methods:
 * - GET: Retrieve (safe, idempotent)
 * - POST: Create (not idempotent - creates multiple on retry)
 * - PUT: Replace (idempotent - same result on retry)
 * - PATCH: Partial update (idempotent)
 * - DELETE: Remove (idempotent)
 * 
 * Status codes:
 * - 200 OK
 * - 201 Created
 * - 204 No Content
 * - 400 Bad Request
 * - 401 Unauthorized
 * - 403 Forbidden (authenticated but not allowed)
 * - 404 Not Found
 * - 409 Conflict
 * - 500 Server Error
 */

/**
 * 18. AUTHENTICATION vs AUTHORIZATION
 * =====================================
 * 
 * Authentication: Who are you?
 * - Login with email/password
 * - Receive JWT token
 * - Include token in API requests
 * 
 * Authorization: What can you do?
 * - Can you access this resource?
 * - Can you delete this post?
 * - Check on backend: is_owner, is_admin, is_follower
 * 
 * JWT Token:
 * - Self-contained (includes user info)
 * - Signed by server
 * - Client includes in every API request
 * - Format: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 * - Contains: header.payload.signature
 * 
 * Session comparison:
 * Sessions: Server stores session data, client gets session ID
 * JWT: Server doesn't store data, client stores token
 * 
 * JWT advantages:
 * - Stateless (easier to scale)
 * - Works across domains (CORS)
 * - Mobile-friendly
 */

/**
 * 19. DATA VALIDATION
 * ====================
 * 
 * CLIENT-SIDE validation:
 * - Regex for email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
 * - Length checks
 * - Type checks
 * - Real-time feedback to user
 * - IMPORTANT: Not for security (client can be bypassed)
 * 
 * SERVER-SIDE validation (ESSENTIAL):
 * - Never trust client input
 * - Validate all parameters
 * - Check data types
 * - Check ranges
 * - Prevent SQL injection with parameterized queries
 * - Examples in Instagram clone auth:
 *   - Email format
 *   - Username alphanumeric only
 *   - Password strength
 *   - Unique email/username
 */

/**
 * 20. CACHING STRATEGIES
 * =======================
 * 
 * Redis cache for:
 * - User sessions
 * - Feed data (frequently accessed, changes slowly)
 * - Search results
 * - User profile data
 * 
 * Cache invalidation (hard problem in CS):
 * 1. Time-based: Expire after X hours
 * 2. Event-based: Invalidate when data changes
 *    - User updates profile → invalidate profile cache
 *    - New post created → invalidate feed cache
 * 3. Manual: Admin clears cache
 * 
 * Example: Feed cache
 * GET /api/posts/feed → check Redis
 * If cached, return immediately
 * If not, query database, cache for 1 hour
 * When new post created, invalidate cache
 */

console.log('Theory and Architecture Guide loaded successfully')
