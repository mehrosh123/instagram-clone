import { useState } from 'react'
import { apiFetch } from '../api/client'
import '../styles/Followers.css'

/**
 * THEORY: Followers & Follow System
 * ==================================
 * 
 * Database Schema:
 * 
 * follows table (Many-to-Many relationship):
 * - id: primary key
 * - follower_id: foreign key (users) - who is following
 * - following_id: foreign key (users) - who is being followed
 * - created_at: timestamp
 * - status: 'accepted' | 'pending' (if private account)
 * - UNIQUE CONSTRAINT (follower_id, following_id) - prevent duplicates
 * 
 * Indexes:
 * - INDEX on (follower_id) for "following" feed queries
 * - INDEX on (following_id) for "followers" list
 * - Compound INDEX on (following_id, status) for feed queries on private accounts
 * 
 * Private Account Logic:
 * When user sets account to private:
 * 1. New follow requests get status='pending'
 * 2. Only show user's posts to accepted followers
 * 3. User must approve follow requests
 * 4. Can see pending requests and accept/reject them
 * 
 * Query Example (Show feed only from accepted followers):
 * SELECT posts.* FROM posts
 * JOIN follows ON posts.user_id = follows.following_id
 * WHERE follows.follower_id = ? AND follows.status = 'accepted'
 * ORDER BY posts.created_at DESC
 */

export default function FollowButton({ userId, isPrivate = false }) {
  const [isFollowing, setIsFollowing] = useState(false)
  const [isPending, setIsPending] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  /**
   * THEORY: Toggle Follow State
   * ===========================
   * Optimistic update: Update UI immediately, then call API
   * If API fails, rollback the UI state
   * 
   * For private accounts:
   * - First click: pending (user sent request)
   * - Private account owner: sees in "follow requests"
   * - Second click: can unfollow (cancels request)
   */
  const handleFollowClick = async () => {
    if (isLoading) return

    setIsLoading(true)
    setError(null)

    // Optimistic update
    if (isFollowing) {
      setIsFollowing(false)
    } else {
      setIsFollowing(true)
      if (isPrivate) {
        setIsPending(true)
      }
    }

    try {
      if (isFollowing) {
        await apiFetch(`/api/users/${userId}/follow`, {
          method: 'DELETE'
        })
      } else {
        await apiFetch(`/api/users/${userId}/follow`, {
          method: 'POST'
        })
      }

      if (!isFollowing && isPrivate) {
        // Follow request sent to private account
        setIsPending(true)
        setIsFollowing(false) // Don't show as following until approved
      }
    } catch (err) {
      setError(err.message)
      // Rollback optimistic update
      setIsFollowing(!isFollowing)
      setIsPending(false)
      console.error('Follow error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const buttonText = isPending 
    ? 'Pending' 
    : isFollowing 
      ? 'Following' 
      : 'Follow'

  return (
    <button 
      className={`follow-btn ${isFollowing ? 'following' : ''} ${isPending ? 'pending' : ''}`}
      onClick={handleFollowClick}
      disabled={isLoading}
      title={`${buttonText}`}
    >
      {isLoading ? '...' : buttonText}
      {error && <span className="error-tooltip">{error}</span>}
    </button>
  )
}

/**
 * THEORY: Followers List Component
 * ================================
 * Shows users who follow the current user
 * Allows managing follower relationships
 */
export function FollowersList({ currentUserId, followers, onRemove }) {
  return (
    <div className="followers-list">
      <div className="followers-header">
        <h3>{followers.length} Followers</h3>
      </div>
      
      <div className="followers-container">
        {followers.map(follower => (
          <div key={follower.id} className="follower-card">
            <div className="follower-info">
              <img 
                src={follower.profilePicture} 
                alt={follower.username}
                className="follower-avatar"
              />
              <div className="follower-details">
                <p className="follower-username">{follower.username}</p>
                <p className="follower-name">{follower.fullName}</p>
              </div>
            </div>
            
            <div className="follower-actions">
              <button className="msg-btn" title="Message">💬</button>
              <button 
                className="remove-btn"
                onClick={() => onRemove(follower.id)}
                title="Remove follower"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * THEORY: Following List Component
 * ================================
 * Shows users that current user is following
 */
export function FollowingList({ following, onUnfollow }) {
  return (
    <div className="following-list">
      <div className="following-header">
        <h3>{following.length} Following</h3>
      </div>
      
      <div className="following-container">
        {following.map(user => (
          <div key={user.id} className="following-card">
            <div className="following-info">
              <img 
                src={user.profilePicture} 
                alt={user.username}
                className="following-avatar"
              />
              <div className="following-details">
                <p className="following-username">{user.username}</p>
                <p className="following-name">{user.fullName}</p>
              </div>
            </div>
            
            <button 
              className="unfollow-btn"
              onClick={() => onUnfollow(user.id)}
            >
              Unfollow
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * THEORY: Follow Requests Component
 * ==================================
 * For private accounts - shows pending follow requests
 * User can approve or reject
 */
export function FollowRequests({ requests, onApprove, onReject }) {
  if (requests.length === 0) {
    return (
      <div className="follow-requests">
        <p className="empty-state">No pending follow requests</p>
      </div>
    )
  }

  return (
    <div className="follow-requests">
      <div className="requests-header">
        <h3>Follow Requests</h3>
      </div>
      
      <div className="requests-list">
        {requests.map(request => (
          <div key={request.id} className="request-card">
            <div className="request-info">
              <img 
                src={request.profilePicture} 
                alt={request.username}
                className="request-avatar"
              />
              <div className="request-details">
                <p className="request-username">{request.username}</p>
                <p className="request-name">{request.fullName}</p>
              </div>
            </div>
            
            <div className="request-actions">
              <button 
                className="approve-btn"
                onClick={() => onApprove(request.id)}
              >
                ✓
              </button>
              <button 
                className="reject-btn"
                onClick={() => onReject(request.id)}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
