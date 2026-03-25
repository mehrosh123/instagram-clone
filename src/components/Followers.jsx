import { useEffect, useState } from 'react'
import { apiFetch } from '../api/client'
import { useAuth } from '../context/AuthContext'
import '../styles/Followers.css'

function Avatar({ src, alt, className }) {
  if (src) {
    return <img src={src} alt={alt} className={className} />
  }

  return <span className={className}>👤</span>
}

export default function FollowButton({ userId, isPrivate = false }) {
  const { currentUser } = useAuth()
  const isSelf = !userId || currentUser?.id === userId
  const [relationship, setRelationship] = useState({
    status: 'none',
    isFollowing: false,
    isPending: false,
    followsMe: false,
    isMutual: false
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true

    const loadStatus = async () => {
      if (isSelf) {
        setRelationship({
          status: 'self',
          isFollowing: false,
          isPending: false,
          followsMe: false,
          isMutual: false
        })
        return
      }

      const normalizedId = String(userId || '').trim()
      if (!normalizedId || /[\s/,]/.test(normalizedId)) {
        setRelationship({
          status: 'none',
          isFollowing: false,
          isPending: false,
          followsMe: false,
          isMutual: false
        })
        return
      }

      try {
        const status = await apiFetch(`/api/users/${encodeURIComponent(normalizedId)}/follow-status`)
        if (!active) return
        setRelationship({
          status: status.status || 'none',
          isFollowing: !!status.isFollowing,
          isPending: !!status.isPending,
          followsMe: !!status.followsMe,
          isMutual: !!status.isMutual
        })
      } catch {
        if (!active) return
        setRelationship({
          status: 'none',
          isFollowing: false,
          isPending: false,
          followsMe: false,
          isMutual: false
        })
      }
    }

    loadStatus()

    return () => {
      active = false
    }
  }, [isSelf, userId])

  const handleFollowClick = async () => {
    if (isLoading) return

    const normalizedId = String(userId || '').trim()
    if (!normalizedId || /[\s/,]/.test(normalizedId)) return

    setIsLoading(true)
    setError(null)

    try {
      if (relationship.isFollowing || relationship.isPending) {
        await apiFetch(`/api/users/${encodeURIComponent(normalizedId)}/follow`, {
          method: 'DELETE'
        })
        setRelationship(prev => ({
          ...prev,
          status: 'none',
          isFollowing: false,
          isPending: false,
          isMutual: false
        }))
      } else {
        const relationship = await apiFetch(`/api/users/${encodeURIComponent(normalizedId)}/follow`, {
          method: 'POST'
        })

        if (relationship.status === 'pending' || isPrivate) {
          setRelationship(prev => ({
            ...prev,
            status: 'pending',
            isFollowing: false,
            isPending: true,
            isMutual: false
          }))
        } else {
          const latestStatus = await apiFetch(`/api/users/${encodeURIComponent(normalizedId)}/follow-status`)
          setRelationship({
            status: latestStatus.status || 'accepted',
            isFollowing: !!latestStatus.isFollowing,
            isPending: !!latestStatus.isPending,
            followsMe: !!latestStatus.followsMe,
            isMutual: !!latestStatus.isMutual
          })
        }
      }
    } catch (err) {
      setError(err.message)
      console.error('Follow error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const buttonText = relationship.isPending
    ? 'Requested'
    : relationship.isMutual
      ? 'Friends'
      : relationship.isFollowing
        ? 'Following'
        : 'Follow'

  if (isSelf) {
    return null
  }

  return (
    <button
      className={`follow-btn ${relationship.isFollowing ? 'following' : ''} ${relationship.isPending ? 'pending' : ''} ${relationship.isMutual ? 'friends' : ''}`}
      onClick={handleFollowClick}
      disabled={isLoading}
      title={buttonText}
    >
      {isLoading ? '...' : buttonText}
      {error && <span className="error-tooltip">{error}</span>}
    </button>
  )
}

export function FollowersList({ followers, onRemove, onOpenProfile }) {
  return (
    <div className="followers-list">
      <div className="followers-header">
        <h3>{followers.length} Followers</h3>
      </div>

      <div className="followers-container">
        {followers.map(follower => (
          <div key={follower.id} className="follower-card">
            <div className="follower-info">
              <Avatar src={follower.profilePicture} alt={follower.username} className="follower-avatar" />
              <div className="follower-details">
                <button type="button" className="follower-username" onClick={() => onOpenProfile?.(follower.username)}>{follower.username}</button>
                <button type="button" className="follower-name" onClick={() => onOpenProfile?.(follower.username)}>{follower.fullName}</button>
              </div>
            </div>

            <div className="follower-actions">
              <button className="msg-btn" title="Message">Chat</button>
              <button
                className="remove-btn"
                onClick={() => onRemove(follower.followId || follower.id)}
                title="Remove follower"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function FollowingList({ following, onUnfollow, onOpenProfile }) {
  return (
    <div className="following-list">
      <div className="following-header">
        <h3>{following.length} Following</h3>
      </div>

      <div className="following-container">
        {following.map(user => (
          <div key={user.id} className="following-card">
            <div className="following-info">
              <Avatar src={user.profilePicture} alt={user.username} className="following-avatar" />
              <div className="following-details">
                <button type="button" className="following-username" onClick={() => onOpenProfile?.(user.username)}>{user.username}</button>
                <button type="button" className="following-name" onClick={() => onOpenProfile?.(user.username)}>{user.fullName}</button>
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
        {requests.map(request => {
          const follower = request.follower || request
          return (
            <div key={request.id} className="request-card">
              <div className="request-info">
                <Avatar src={follower.profilePicture} alt={follower.username} className="request-avatar" />
                <div className="request-details">
                  <p className="request-username">{follower.username}</p>
                  <p className="request-name">{follower.fullName}</p>
                </div>
              </div>

              <div className="request-actions">
                <button
                  className="approve-btn"
                  onClick={() => onApprove(request.id)}
                >
                  Approve
                </button>
                <button
                  className="reject-btn"
                  onClick={() => onReject(request.id)}
                >
                  Reject
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
