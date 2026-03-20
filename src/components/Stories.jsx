import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { apiFetch } from '../api/client'
import '../styles/Stories.css'

/**
 * THEORY: Stories Feature (24-hour Visibility)
 * =============================================
 * 
 * Database Schema for Stories:
 * 
 * stories table:
 * - id: primary key (UUID)
 * - user_id: foreign key (users)
 * - image_url: story image path
 * - caption: optional caption text
 * - created_at: timestamp (ISO 8601)
 * - expires_at: timestamp (created_at + 24 hours)
 * 
 * Implementation Details:
 * 1. When story is uploaded, set expires_at = NOW() + INTERVAL '24 hours'
 * 2. Query only stories where expires_at > NOW()
 * 3. Background jobs periodically delete expired stories
 * 4. Client-side countdown shows time remaining
 * 
 * Indexes:
 * - INDEX on (user_id, created_at DESC) for user's stories
 * - INDEX on (expires_at) for cleanup queries
 * - Compound INDEX for feed queries
 */

export default function Stories() {
  const { currentUser } = useAuth()
  const [stories, setStories] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [selectedStory, setSelectedStory] = useState(null)
  const [timeRemaining, setTimeRemaining] = useState({})

  const loadStories = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await apiFetch('/api/stories/feed')
      const mapped = (data.stories || []).map(story => ({
        ...story,
        image: story.imageUrl,
        author: story.userId === currentUser?.id ? currentUser.fullName : 'User',
        avatar: story.userId === currentUser?.id
          ? (currentUser.profilePicture || currentUser.initials || '👤')
          : '👤',
        createdAt: new Date(story.createdAt),
        expiresAt: new Date(story.expiresAt),
        viewed: false
      }))
      setStories(mapped)
    } catch (err) {
      setError(err.message)
      setStories([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStories()
  }, [currentUser?.id])

  /**
   * THEORY: useEffect for Side Effects
   * ===================================
   * Side effects = operations that affect things outside the component
   * Examples:
   * - API calls (fetching stories from server)
   * - Setting up timers/intervals (countdown timer)
   * - Updating document title
   * - Setting up subscriptions
   * 
   * Setup: useEffect(() => { ... }, [dependencies])
   * Cleanup: return () => { ... } (runs when component unmounts)
   */

  // Calculate time remaining for each story
  useEffect(() => {
    const calculateTimeRemaining = () => {
      const now = new Date()
      const remaining = {}

      stories.forEach(story => {
        const diff = story.expiresAt - now
        if (diff <= 0) {
          remaining[story.id] = 'Expired'
        } else {
          const hours = Math.floor(diff / (1000 * 60 * 60))
          const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
          remaining[story.id] = `${hours}h ${minutes}m`
        }
      })

      setTimeRemaining(remaining)
    }

    calculateTimeRemaining()
    // Update every minute
    const interval = setInterval(calculateTimeRemaining, 60000)

    return () => clearInterval(interval)
  }, [stories])

  /**
   * THEORY: Story Deletion
   * ======================
   * User can delete own stories at any time
   * This triggers:
   * 1. DELETE story from database
   * 2. Remove image file from storage
   * 3. Update client state immediately (optimistic update)
   * 4. If API fails, rollback the UI change
   */
  const handleDeleteStory = async (storyId) => {
    setStories(prev => prev.filter(s => s.id !== storyId))

    try {
      await apiFetch(`/api/stories/${storyId}`, { method: 'DELETE' })
    } catch (err) {
      console.error('Failed to delete story:', err)
      loadStories()
    }
  }

  const handleAddStory = async (e) => {
    if (e) e.preventDefault()

    const imageUrl = window.prompt('Paste story image URL')
    if (!imageUrl || !imageUrl.trim()) return

    const caption = window.prompt('Add a caption (optional)') || ''

    try {
      await apiFetch('/api/stories', {
        method: 'POST',
        body: JSON.stringify({ imageUrl: imageUrl.trim(), caption: caption.trim() })
      })
      await loadStories()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="stories-container">
      {error && <p className="story-error">{error}</p>}
      {loading && <p className="story-loading">Loading stories...</p>}

      {selectedStory ? (
        /* Story Viewer */
        <div className="story-viewer">
          <button 
            className="story-close"
            onClick={() => setSelectedStory(null)}
          >
            ✕
          </button>

          <div className="story-content">
            <div className="story-header-viewer">
              <div className="story-info">
                <span className="avatar">{selectedStory.avatar}</span>
                <div>
                  <p className="author-name">{selectedStory.author}</p>
                  <p className="time-ago">
                    {getTimeAgo(selectedStory.createdAt)} ago
                  </p>
                </div>
              </div>
              <div className="story-actions">
                <span className="expiration">
                  Expires in {timeRemaining[selectedStory.id]}
                </span>
                {selectedStory.userId === currentUser?.id && (
                  <button
                    className="delete-story-btn"
                    onClick={() => {
                      handleDeleteStory(selectedStory.id)
                      setSelectedStory(null)
                    }}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>

            <img 
              src={selectedStory.image} 
              alt="Story" 
              className="story-image"
            />

            {/* Navigation */}
            <button 
              className="story-nav prev"
              onClick={() => {
                const currentIndex = stories.findIndex(s => s.id === selectedStory.id)
                if (currentIndex > 0) {
                  setSelectedStory(stories[currentIndex - 1])
                }
              }}
              disabled={stories.findIndex(s => s.id === selectedStory.id) === 0}
            >
              ❮
            </button>
            <button 
              className="story-nav next"
              onClick={() => {
                const currentIndex = stories.findIndex(s => s.id === selectedStory.id)
                if (currentIndex < stories.length - 1) {
                  setSelectedStory(stories[currentIndex + 1])
                }
              }}
              disabled={stories.findIndex(s => s.id === selectedStory.id) === stories.length - 1}
            >
              ❯
            </button>
          </div>
        </div>
      ) : (
        /* Stories List */
        <div className="stories-list">
          <button className="story-add" onClick={handleAddStory}>
            <span>+</span>
            <small>Your story</small>
          </button>
          {stories.map(story => (
            <div 
              key={story.id}
              className="story-card"
              onClick={() => setSelectedStory(story)}
            >
              <div className="story-ring">
                <img 
                  src={story.image} 
                  alt={story.author}
                  className={`story-thumbnail ${story.viewed ? 'viewed' : ''}`}
                />
              </div>
              <p className="story-name">{story.author}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * THEORY: Utility Function
 * ========================
 * Pure function that takes time and returns relative string
 * Examples: "2 hours", "30 minutes", "just now"
 */
function getTimeAgo(date) {
  const now = new Date()
  const diff = now - date
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 60) return 'just now'
  if (minutes < 60) return `${minutes}m`
  if (hours < 24) return `${hours}h`
  return `${days}d`
}
