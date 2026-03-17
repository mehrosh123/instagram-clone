import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
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
  const { currentUser } = useAuth()
  const [profile] = useState({
    avatar: currentUser?.profilePicture || '',
    initials: currentUser?.initials || 'SC',
    name: currentUser?.fullName || 'Sarah Chen',
    username: currentUser?.username ? `@${currentUser.username}` : '@sarahchen',
    bio: currentUser?.bio || 'Photographer | Traveler | Coffee enthusiast',
    followers: currentUser?.followerCount ?? 15234,
    following: currentUser?.followingCount ?? 892,
    postsCount: 256,
    website: currentUser?.website || 'sarahchen.com',
    isFollowing: false
  })

  const websiteHref = profile.website
    ? (profile.website.startsWith('http://') || profile.website.startsWith('https://')
      ? profile.website
      : `https://${profile.website}`)
    : ''

  const [userPosts] = useState([
    {
      id: 1,
      image: 'https://images.unsplash.com/photo-1682288946918-3ffcc7c03a05?w=200',
      likes: 2345,
      comments: 125
    },
    {
      id: 2,
      image: 'https://images.unsplash.com/photo-1506157786151-b8491531f063?w=200',
      likes: 1890,
      comments: 98
    },
    {
      id: 3,
      image: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=200',
      likes: 3456,
      comments: 201
    },
    {
      id: 4,
      image: 'https://images.unsplash.com/photo-1469022563149-aa64dbd37dae?w=200',
      likes: 2100,
      comments: 156
    }
  ])

  const [isFollowing, setIsFollowing] = useState(profile.isFollowing)

  const handleFollowClick = () => {
    setIsFollowing(!isFollowing)
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
      </div>

      {/* Posts Grid */}
      <div className="posts-grid">
        {userPosts.map(post => (
          <div key={post.id} className="grid-post">
            <img src={post.image} alt={`Post ${post.id}`} />
            <div className="post-overlay">
              <div className="post-stats">
                <span>❤️ {post.likes}</span>
                <span>💬 {post.comments}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
