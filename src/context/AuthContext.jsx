import { createContext, useContext, useState, useCallback } from 'react'

const STORAGE_KEYS = {
  token: 'auth_token'
}

function getInitials(fullName = '', email = '') {
  const trimmedName = fullName.trim()
  if (trimmedName) {
    const parts = trimmedName.split(' ').filter(Boolean)
    const initials = parts.slice(0, 2).map(part => part[0]).join('')
    return initials.toUpperCase()
  }
  return (email?.[0] || 'U').toUpperCase()
}

function buildUserWithInitials(user) {
  return {
    ...user,
    initials: user.initials || getInitials(user.fullName || '', user.email || '')
  }
}

function storeAuthSession(token) {
  localStorage.setItem(STORAGE_KEYS.token, token)
}

/**
 * THEORY: Context API & State Management
 * ========================================
 * 
 * Context API provides a way to pass data through the component tree without
 * having to pass props down manually at every level.
 * 
 * Benefits:
 * 1. Avoids "prop drilling" - passing props through many layers
 * 2. Centralizes global state (auth, user data, theme)
 * 3. Makes state accessible to any component that needs it
 * 
 * How it works:
 * 1. Create context with createContext()
 * 2. Create provider component that wraps app
 * 3. Use useContext hook in any component to access state
 * 
 * Database Schema Context:
 * - Stores user authentication state
 * - Manages current logged-in user data
 * - Tracks follow/unfollow relationships
 */

const AuthContext = createContext(null)

/**
 * THEORY: Provider Pattern
 * ========================
 * Wraps the app and makes auth state available to all child components
 * Similar to Redux provider
 */
export function AuthProvider({ children }) {
  // Current authenticated user
  const [currentUser, setCurrentUser] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  /**
   * Database Schema for Users:
   * 
   * users table:
   * - id: primary key (UUID)
   * - email: unique, indexed for login
   * - username: unique, profile URL identifier
   * - password_hash: bcrypt hashed password (NEVER store plain text!)
   * - full_name: display name
   * - bio: user description
   * - profile_picture_url: image file path
   * - website: optional user website
   * - is_private: boolean for private account
   * - created_at: timestamp
   * - updated_at: timestamp
   * 
   * Indexes:
   * - UNIQUE INDEX on (email)
   * - UNIQUE INDEX on (username)
   * - INDEX on (created_at) for feed queries
   */

  /**
   * THEORY: Async State Management
   * ==============================
   * Signup/login are async operations that:
   * 1. Set loading state while processing
   * 2. Make API call to backend
   * 3. Handle errors
   * 4. Store JWT token in localStorage
   * 5. Update currentUser
   */

  const signup = useCallback(async (email, password, username, fullName, profilePicture = '', profileMeta = {}) => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          username,
          fullName,
          profilePicture,
          bio: profileMeta.bio || '',
          website: profileMeta.website || '',
          isPrivate: !!profileMeta.isPrivate
        })
      })

      if (!response.ok) {
        let message = 'Signup failed'
        try {
          const payload = await response.json()
          message = payload.error || message
        } catch {
          // Keep default message when response body is not JSON.
        }
        throw new Error(message)
      }

      const data = await response.json()
      storeAuthSession(data.token)
      const user = buildUserWithInitials(data.user)
      setCurrentUser(user)
      return user
    } catch (err) {
      const message = err?.message === 'Failed to fetch'
        ? 'Unable to connect to backend. Start backend server and try again.'
        : (err.message || 'Unable to connect to backend. Start backend server and try again.')
      setError(message)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  const login = useCallback(async (email, password) => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })

      if (!response.ok) {
        let message = 'Invalid email or password'
        try {
          const payload = await response.json()
          message = payload.error || message
        } catch {
          // Keep default message when response body is not JSON.
        }
        throw new Error(message)
      }

      const data = await response.json()
      storeAuthSession(data.token)
      const user = buildUserWithInitials(data.user)
      setCurrentUser(user)
      return user
    } catch (err) {
      const message = err?.message === 'Failed to fetch'
        ? 'Unable to connect to backend. Start backend server and try again.'
        : (err.message || 'Unable to connect to backend. Start backend server and try again.')
      setError(message)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEYS.token)
    setCurrentUser(null)
  }, [])

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  // Check if user is already logged in (e.g., on page refresh)
  const checkAuth = useCallback(async () => {
    const token = localStorage.getItem(STORAGE_KEYS.token)
    if (!token) return

    try {
      const response = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (response.ok) {
        const user = await response.json()
        setCurrentUser(buildUserWithInitials(user))
        return
      }

      logout()
    } catch (err) {
      console.error('Auth check failed:', err)
      logout()
    }
  }, [logout])

  const value = {
    currentUser,
    isLoading,
    error,
    clearError,
    signup,
    login,
    logout,
    checkAuth,
    isAuthenticated: !!currentUser
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

/**
 * THEORY: Custom Hook
 * ===================
 * Custom hooks encapsulate logic and state
 * Can only be used inside components
 * Promotes code reuse and organization
 */
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
