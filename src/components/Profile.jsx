import { useCallback, useEffect, useState } from 'react'
import { FollowersList, FollowingList } from './Followers'
import { useAuth } from '../context/AuthContext'
import { apiFetch } from '../api/client'
import '../styles/Profile.css'

export default function Profile() {
  const { currentUser, updateCurrentUser } = useAuth()
  const [userPosts, setUserPosts] = useState([])
  const [followers, setFollowers] = useState([])
  const [following, setFollowing] = useState([])
  const [activePanel, setActivePanel] = useState('posts')
  const [postActionError, setPostActionError] = useState('')
  const [relationshipError, setRelationshipError] = useState('')

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

    if (raw.startsWith('data:image/')) {
      return [raw]
    }

    return raw
      .split(/[\s,]+/)
      .map(item => item.trim())
      .filter(Boolean)
  }

  const loadProfileData = useCallback(async () => {
    if (!currentUser?.id || !currentUser?.username) {
      setUserPosts([])
      setFollowers([])
      setFollowing([])
      return
    }

    const [profileData, followersData, followingData] = await Promise.all([
      apiFetch(`/api/users/${currentUser.username}`),
      apiFetch(`/api/users/${currentUser.id}/followers`),
      apiFetch(`/api/users/${currentUser.id}/following`)
    ])

    const mappedPosts = (profileData.posts || []).map(post => ({
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
    setFollowers(Array.isArray(followersData.followers) ? followersData.followers : [])
    setFollowing(Array.isArray(followingData.following) ? followingData.following : [])

    if (profileData.user) {
      updateCurrentUser({
        fullName: profileData.user.fullName,
        bio: profileData.user.bio,
        website: profileData.user.website,
        profilePicture: profileData.user.profilePicture,
        isPrivate: profileData.user.isPrivate,
        isVerified: profileData.user.isVerified,
        followerCount: profileData.user.followerCount ?? 0,
        followingCount: profileData.user.followingCount ?? 0
      })
    }
  }, [currentUser?.id, currentUser?.username, updateCurrentUser])

  useEffect(() => {
    let active = true

    const run = async () => {
      try {
        await loadProfileData()
      } catch {
        if (!active) return
        setUserPosts([])
        setFollowers([])
        setFollowing([])
      }
    }

    run()

    return () => {
      active = false
    }
  }, [loadProfileData])

  const profile = {
    avatar: currentUser?.profilePicture || '',
    initials: currentUser?.initials || 'U',
    name: currentUser?.fullName || 'User',
    username: currentUser?.username ? `@${currentUser.username}` : '@user',
    bio: currentUser?.bio || '',
    followers: currentUser?.followerCount ?? followers.length,
    following: currentUser?.followingCount ?? following.length,
    postsCount: userPosts.length,
    website: currentUser?.website || ''
  }

  const websiteHref = profile.website
    ? (profile.website.startsWith('http://') || profile.website.startsWith('https://')
      ? profile.website
      : `https://${profile.website}`)
    : ''

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
      // Existing profile UI keeps update errors inline-light.
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
      await loadProfileData()
      setActivePanel('posts')
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
      await loadProfileData()
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
      await loadProfileData()
    } catch (err) {
      setPostActionError(err.message || 'Failed to delete post')
    }
  }

  const handleRemoveFollower = async (followId) => {
    if (!followId) return
    const confirmed = window.confirm('Remove this follower?')
    if (!confirmed) return

    try {
      setRelationshipError('')
      await apiFetch(`/api/follows/${followId}`, { method: 'DELETE' })
      await loadProfileData()
    } catch (err) {
      setRelationshipError(err.message || 'Failed to remove follower')
    }
  }

  const handleUnfollow = async (userId) => {
    if (!userId) return
    const confirmed = window.confirm('Unfollow this user?')
    if (!confirmed) return

    try {
      setRelationshipError('')
      await apiFetch(`/api/users/${userId}/follow`, { method: 'DELETE' })
      await loadProfileData()
    } catch (err) {
      setRelationshipError(err.message || 'Failed to unfollow user')
    }
  }

  return (
    <div className="profile">
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
            <button className="message-btn" onClick={() => loadProfileData()}>Refresh</button>
          </div>

          <div className="profile-stats">
            <button type="button" className={`stat stat-button ${activePanel === 'posts' ? 'active' : ''}`} onClick={() => setActivePanel('posts')}>
              <strong>{profile.postsCount}</strong>
              <p>Posts</p>
            </button>
            <button type="button" className={`stat stat-button ${activePanel === 'followers' ? 'active' : ''}`} onClick={() => setActivePanel('followers')}>
              <strong>{profile.followers.toLocaleString()}</strong>
              <p>Followers</p>
            </button>
            <button type="button" className={`stat stat-button ${activePanel === 'following' ? 'active' : ''}`} onClick={() => setActivePanel('following')}>
              <strong>{profile.following}</strong>
              <p>Following</p>
            </button>
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

      <div className="profile-tabs">
        <button className={`tab ${activePanel === 'posts' ? 'active' : ''}`} onClick={() => setActivePanel('posts')}>Posts</button>
        <button className={`tab ${activePanel === 'followers' ? 'active' : ''}`} onClick={() => setActivePanel('followers')}>Followers</button>
        <button className={`tab ${activePanel === 'following' ? 'active' : ''}`} onClick={() => setActivePanel('following')}>Following</button>
        <button className="tab create-post-tab" onClick={handleCreatePost}>Create Post</button>
      </div>

      {(postActionError || relationshipError) && (
        <p className="profile-post-error">{postActionError || relationshipError}</p>
      )}

      {activePanel === 'followers' ? (
        <div className="profile-connections">
          <FollowersList followers={followers} onRemove={handleRemoveFollower} />
        </div>
      ) : activePanel === 'following' ? (
        <div className="profile-connections">
          <FollowingList following={following} onUnfollow={handleUnfollow} />
        </div>
      ) : (
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
      )}
    </div>
  )
}
