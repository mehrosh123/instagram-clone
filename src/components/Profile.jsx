import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { apiFetch } from '../api/client'
import '../styles/Profile.css'

/**
 * THEORY: User Profile Component
 * ===============================
 * Displays user profile information with stats and user's posts.
 * Shows:
 * - User info (name, bio, avatar)
 * - Stats (followers, following, posts)
 * - User's posts grid
 */

export default function Profile() {
  const { currentUser, updateCurrentUser } = useAuth()
  const [userPosts, setUserPosts] = useState([])
  const [postActionError, setPostActionError] = useState('')

  const isValidImageSource = (value) => {
    if (typeof value !== 'string') return false
    const src = value.trim()
    if (!src) return false

    if (src.startsWith('http://') || src.startsWith('https://')) {
      try {
        const parsed = new URL(src)
        return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      } catch {
        return false
      }
    }

    if (src.startsWith('data:image/')) {
      const marker = ';base64,'
      const markerIndex = src.indexOf(marker)
      return markerIndex > 0 && markerIndex + marker.length < src.length
    }

    return src.startsWith('blob:')
  }

  const parseImageInput = (rawValue) => {
    const raw = String(rawValue || '').trim()
    if (!raw) return []

    // Data URLs contain commas as part of payload; treat as a single image input.
    if (raw.startsWith('data:image/')) {
      return [raw]
    }

    return raw
      .split(/[\s,]+/)
      .map(item => item.trim())
      .filter(Boolean)
  }

  const loadMyPosts = useCallback(async () => {
    if (!currentUser?.username) {
      setUserPosts([])
      return
    }

    try {
      const data = await apiFetch(`/api/users/${currentUser.username}`)
      const mappedPosts = (data.posts || []).map(post => ({
        id: post.id,
        image: Array.isArray(post.images) && post.images.length > 0
          ? post.images[0]
          : 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=600&auto=format&fit=crop',
        images: Array.isArray(post.images) ? post.images : [],
        caption: post.caption || '',
        likes: post.likesCount || 0,
        comments: post.commentsCount || 0
      }))
      setUserPosts(mappedPosts)
    } catch {
      setUserPosts([])
    }
  }, [currentUser?.username])

  useEffect(() => {
    loadMyPosts()
  }, [loadMyPosts])

  const profile = {
    avatar: currentUser?.profilePicture || '',
    initials: currentUser?.initials || 'SC',
    name: currentUser?.fullName || 'Sarah Chen',
    username: currentUser?.username ? `@${currentUser.username}` : '@sarahchen',
    bio: currentUser?.bio || '',
    followers: currentUser?.followerCount ?? 15234,
    following: currentUser?.followingCount ?? 892,
    postsCount: userPosts.length,
    website: currentUser?.website || '',
    isFollowing: false
  }

  const websiteHref = profile.website
    ? (profile.website.startsWith('http://') || profile.website.startsWith('https://')
      ? profile.website
      : `https://${profile.website}`)
    : ''

  const [isFollowing, setIsFollowing] = useState(profile.isFollowing)

  const handleFollowClick = () => {
    setIsFollowing(!isFollowing)
  }

  const handleChangeDisplayPicture = async () => {
    const nextUrl = window.prompt('Enter display picture URL', currentUser?.profilePicture || '')
    if (nextUrl === null) return

    try {
      const updated = await apiFetch(`/api/users/${currentUser.id}`, {
        method: 'PUT',
        body: JSON.stringify({ profilePicture: nextUrl.trim() })
      })
      updateCurrentUser({ profilePicture: updated.profilePicture || '' })
    } catch {
      // Ignore silently for now; existing UI does not include inline alerts.
    }
  }

  const handleCreatePost = async () => {
    const imagesInput = window.prompt('Enter image URLs (comma-separated, max 10)')
    if (!imagesInput || !imagesInput.trim()) return

    const images = parseImageInput(imagesInput)

    if (images.length === 0) return
    if (images.length > 10) {
      setPostActionError('Maximum 10 images allowed per post')
      return
    }

    if (!images.every(isValidImageSource)) {
      setPostActionError('Use valid image URLs (http/https) or a single data:image URL')
      return
    }

    const caption = window.prompt('Enter caption (optional)') || ''

    try {
      setPostActionError('')
      await apiFetch('/api/posts', {
        method: 'POST',
        body: JSON.stringify({
          caption: caption.trim(),
          images
        })
      })
      await loadMyPosts()
    } catch (err) {
      setPostActionError(err.message || 'Failed to create post')
    }
  }

  const handleEditPost = async (post) => {
    const nextCaption = window.prompt('Edit caption', post.caption || '')
    if (nextCaption === null) return

    const nextImagesInput = window.prompt(
      'Edit image URLs (comma-separated, max 10)',
      (post.images || []).join(', ')
    )
    if (nextImagesInput === null) return

    const nextImages = parseImageInput(nextImagesInput)

    if (nextImages.length === 0) {
      setPostActionError('At least one image is required')
      return
    }

    if (nextImages.length > 10) {
      setPostActionError('Maximum 10 images allowed per post')
      return
    }

    if (!nextImages.every(isValidImageSource)) {
      setPostActionError('Use valid image URLs (http/https) or a single data:image URL')
      return
    }

    try {
      setPostActionError('')
      await apiFetch(`/api/posts/${post.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          caption: nextCaption.trim(),
          images: nextImages
        })
      })
      await loadMyPosts()
    } catch (err) {
      setPostActionError(err.message || 'Failed to edit post')
    }
  }

  const handleDeletePost = async (postId) => {
    const confirmed = window.confirm('Delete this post?')
    if (!confirmed) return

    try {
      setPostActionError('')
      await apiFetch(`/api/posts/${postId}`, { method: 'DELETE' })
      setUserPosts(prev => prev.filter(post => post.id !== postId))
    } catch (err) {
      setPostActionError(err.message || 'Failed to delete post')
    }
  }

  return (
    <div className="profile">
      {/* Profile Header */}
      <div className="profile-header">
        <div className="profile-avatar">
          {profile.avatar ? (
            <img src={profile.avatar} alt={profile.name} className="avatar-image" />
          ) : (
            <span className="avatar-emoji">{profile.initials}</span>
          )}
        </div>

        <div className="profile-info">
          <div className="profile-top">
            <h1 className="username">{profile.username}</h1>
            <button className="message-btn" onClick={handleChangeDisplayPicture}>Change photo</button>
            <button 
              className={`follow-btn ${isFollowing ? 'following' : ''}`}
              onClick={handleFollowClick}
            >
              {isFollowing ? 'Following' : 'Follow'}
            </button>
            <button className="message-btn">Message</button>
            <button className="menu-btn">⋯</button>
          </div>

          <div className="profile-stats">
            <div className="stat">
              <strong>{profile.postsCount}</strong>
              <p>Posts</p>
            </div>
            <div className="stat">
              <strong>{profile.followers.toLocaleString()}</strong>
              <p>Followers</p>
            </div>
            <div className="stat">
              <strong>{profile.following}</strong>
              <p>Following</p>
            </div>
          </div>

          <div className="profile-bio">
            <h2>{profile.name}</h2>
            <p>{profile.bio}</p>
            {profile.website && (
              <a href={websiteHref} target="_blank" rel="noopener noreferrer">
                {profile.website}
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Profile Tabs */}
      <div className="profile-tabs">
        <button className="tab active">📷 Posts</button>
        <button className="tab">🎬 Reels</button>
        <button className="tab">🔖 Saved</button>
        <button className="tab">👥 Tagged</button>
        <button className="tab create-post-tab" onClick={handleCreatePost}>＋ Create Post</button>
      </div>

      {postActionError && <p className="profile-post-error">{postActionError}</p>}

      {/* Posts Grid */}
      <div className="posts-grid">
        {userPosts.map(post => (
          <div key={post.id} className="grid-post">
            <img src={post.image} alt={`Post ${post.id}`} />
            <div className="post-overlay">
              <div className="post-overlay-content">
                <div className="post-stats">
                  <span>❤️ {post.likes}</span>
                  <span>💬 {post.comments}</span>
                </div>
                <div className="profile-post-actions">
                  <button onClick={() => handleEditPost(post)}>Edit</button>
                  <button className="danger" onClick={() => handleDeletePost(post.id)}>Delete</button>
                </div>
              </div>
            </div>
          </div>
        ))}

        {userPosts.length === 0 && (
          <p className="no-posts-message">No posts yet. Create your first post.</p>
        )}
      </div>
    </div>
  )
}
