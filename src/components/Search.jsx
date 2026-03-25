import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../api/client'
import '../styles/Search.css'

export default function Search({ onSelectUser }) {
  const containerRef = useRef(null)
  const inputRef = useRef(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [searchHistory, setSearchHistory] = useState([])

  useEffect(() => {
    const saved = localStorage.getItem('search_history')
    if (saved) {
      setSearchHistory(JSON.parse(saved))
    }
  }, [])

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setShowResults(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [])

  useEffect(() => {
    const searchQuery = query.trim()
    const timeoutId = setTimeout(async () => {
      if (searchQuery.length < 2) {
        setResults([])
        setIsLoading(false)
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
    }, 250)

    return () => clearTimeout(timeoutId)
  }, [query])

  const persistHistory = (users) => {
    setSearchHistory(users)
    localStorage.setItem('search_history', JSON.stringify(users))
  }

  const handleSelectUser = (user) => {
    const updated = [user, ...searchHistory.filter(item => item.id !== user.id)].slice(0, 10)
    persistHistory(updated)

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

  const handleRemoveHistoryItem = (event, userId) => {
    event.preventDefault()
    event.stopPropagation()
    persistHistory(searchHistory.filter(user => user.id !== userId))
  }

  const renderUserLink = (user, className) => (
    <Link
      key={user.id}
      to={user.profilePath || `/users/${user.username}`}
      className={className}
      onClick={() => handleSelectUser(user)}
    >
      {user.profilePicture ? (
        <img src={user.profilePicture} alt={user.username} className="user-avatar" />
      ) : (
        <div className="user-avatar user-avatar-fallback">U</div>
      )}
      <div className="user-info-search">
        <p className="username">
          {user.username}
          {user.isPrivate ? <span className="privacy-badge private">Lock Private</span> : <span className="privacy-badge public">Public</span>}
        </p>
        <p className="full-name">{user.fullName}</p>
      </div>
    </Link>
  )

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
          {results.map(user => renderUserLink(user, 'search-result-item'))}
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
            <button type="button" className="clear-history-btn" onClick={handleClearHistory}>
              Clear
            </button>
          </div>
          {searchHistory.map(user => (
            <Link
              key={user.id}
              to={user.profilePath || `/users/${user.username}`}
              className="history-item"
              onClick={() => handleSelectUser(user)}
            >
              {user.profilePicture ? (
                <img src={user.profilePicture} alt={user.username} className="user-avatar" />
              ) : (
                <div className="user-avatar user-avatar-fallback">U</div>
              )}
              <div className="user-info-search">
                <p className="username">
                  {user.username}
                  {user.isPrivate ? <span className="privacy-badge private">Lock Private</span> : <span className="privacy-badge public">Public</span>}
                </p>
                <p className="full-name">{user.fullName}</p>
              </div>
              <button
                type="button"
                className="remove-history-btn"
                onClick={(event) => handleRemoveHistoryItem(event, user.id)}
              >
                x
              </button>
            </Link>
          ))}
        </div>
      )
    }

    return null
  }

  return (
    <div ref={containerRef} className="search-component">
      <div className="search-box">
        <input
          ref={inputRef}
          type="text"
          placeholder="Search users..."
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setShowResults(true)
          }}
          onFocus={() => setShowResults(true)}
          className="search-input-field"
        />
        <button
          type="button"
          className="search-icon-btn"
          onClick={() => {
            inputRef.current?.focus()
            setShowResults(true)
          }}
          aria-label="Open search"
        >
          <span className="search-icon-glyph">Q</span>
        </button>
      </div>

      {showResults && (
        <div className="search-dropdown">
          {renderDropdownContent()}
        </div>
      )}
    </div>
  )
}
