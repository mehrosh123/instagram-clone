import { useState, useCallback, useEffect } from 'react'
import { apiFetch } from '../api/client'
import '../styles/Search.css'

/**
 * THEORY: Full-Text Search Implementation
 * ========================================
 * 
 * Backend Database Optimization:
 * 
 * PostgreSQL Full-Text Search (Recommended):
 * - Use tsvector for efficient text indexing
 * - CREATE INDEX on tsvector column for O(log n) search
 * - Query: SELECT * FROM users WHERE username_tsv @@ plainto_tsquery('username')
 * 
 * Alternative: TRGM GIN Index (Trigram)
 * - For LIKE/ILIKE searches: LIKE '%username%'
 * - CREATE EXTENSION pg_trgm;
 * - CREATE INDEX ON users USING GIN (username gin_trgm_ops);
 * - Performance: O(log n) instead of O(n) sequential scan
 * 
 * MongoDB: Text Index
 * - db.users.createIndex({ username: "text", full_name: "text" })
 * 
 * Client-side:
 * - Debounce search input (wait 300ms after user stops typing)
 * - Don't search if query < 3 chars
 * - Cache results to avoid duplicate requests
 */

export default function Search({ onSelectUser }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [searchHistory, setSearchHistory] = useState([])

  // Load search history from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('search_history')
    if (saved) {
      setSearchHistory(JSON.parse(saved))
    }
  }, [])

  /**
   * THEORY: Debouncing
   * ==================
   * Don't fire API request on every keystroke
   * Instead, wait for user to finish typing (300ms of no input)
   * 
   * Benefits:
   * - Reduces server load
   * - Reduces network traffic
   * - Improves perceived performance (less flickering)
   * 
   * Implementation:
   * - Track timeout ID
   * - Clear previous timeout on new input
   * - Only fire request if user stops typing
   */
  const performSearch = useCallback(async (searchQuery) => {
    if (!searchQuery || searchQuery.length < 3) {
      setResults([])
      return
    }

    setIsLoading(true)
    try {
      const data = await apiFetch(`/api/users/search?q=${encodeURIComponent(searchQuery)}`)
      setResults(data.users || [])
    } catch (err) {
      console.error('Search failed:', err)
      setResults([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  const handleInputChange = useCallback((e) => {
    const value = e.target.value
    setQuery(value)
    setShowResults(!!value)
  }, [])

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      performSearch(query)
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [query, performSearch])

  const handleSelectUser = (user) => {
    // Save to search history
    const updated = [
      user,
      ...searchHistory.filter(u => u.id !== user.id)
    ].slice(0, 10) // Keep last 10 searches

    setSearchHistory(updated)
    localStorage.setItem('search_history', JSON.stringify(updated))

    if (onSelectUser) {
      onSelectUser(user)
    }
    setQuery('')
    setShowResults(false)
  }

  const handleClearHistory = () => {
    setSearchHistory([])
    localStorage.removeItem('search_history')
  }

  const renderDropdownContent = () => {
    if (isLoading) {
      return (
        <div className="search-loading">
          <span className="spinner"></span> Searching...
        </div>
      )
    }

    if (results.length > 0) {
      return (
        <div className="search-results">
          <div className="results-header">
            <p>Users</p>
          </div>
          {results.map(user => (
            <div
              key={user.id}
              className="search-result-item"
              onClick={() => handleSelectUser(user)}
            >
              {user.profilePicture ? (
                <img
                  src={user.profilePicture}
                  alt={user.username}
                  className="user-avatar"
                />
              ) : (
                <div className="user-avatar user-avatar-fallback">👤</div>
              )}
              <div className="user-info-search">
                <p className="username">{user.username}</p>
                <p className="full-name">{user.fullName}</p>
              </div>
            </div>
          ))}
        </div>
      )
    }

    if (query && !isLoading) {
      return (
        <div className="search-empty">
          <p>No users found for "{query}"</p>
          <small>Try searching for username or full name</small>
        </div>
      )
    }

    if (searchHistory.length > 0) {
      return (
        <div className="search-history">
          <div className="history-header">
            <p>Recent searches</p>
            <button
              className="clear-history-btn"
              onClick={handleClearHistory}
            >
              Clear
            </button>
          </div>
          {searchHistory.map(user => (
            <div
              key={user.id}
              className="history-item"
              onClick={() => handleSelectUser(user)}
            >
              {user.profilePicture ? (
                <img
                  src={user.profilePicture}
                  alt={user.username}
                  className="user-avatar"
                />
              ) : (
                <div className="user-avatar user-avatar-fallback">👤</div>
              )}
              <div className="user-info-search">
                <p className="username">{user.username}</p>
                <p className="full-name">{user.fullName}</p>
              </div>
              <button
                className="remove-history-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  setSearchHistory(prev => prev.filter(u => u.id !== user.id))
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )
    }

    return null
  }

  return (
    <div className="search-component">
      <div className="search-box">
        <input
          type="text"
          placeholder="Search users..."
          value={query}
          onChange={handleInputChange}
          onFocus={() => setShowResults(!!query)}
          className="search-input-field"
        />
        <span className="search-icon">🔍</span>
      </div>

      {showResults && (
        <div className="search-dropdown">
          {renderDropdownContent()}
        </div>
      )}
    </div>
  )
}
