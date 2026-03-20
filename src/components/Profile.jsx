import { useMemo, useState } from 'react'
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
  const userPosts = useMemo(() => {
    const demoPosts = [
      {
        id: 1,
        image: 'https://picsum.photos/id/1015/700/700',
        likes: 1264,
        comments: 32
      },
      {
        id: 2,
        image: 'https://picsum.photos/id/1025/700/700',
        likes: 983,
        comments: 21
      },
      {
        id: 3,
        image: 'https://picsum.photos/id/1035/700/700',
        likes: 1742,
        comments: 49
      },
      {
        id: 4,
        image: 'https://picsum.photos/id/1043/700/700',
        likes: 1110,
        comments: 18
      },
      {
        id: 5,
        image: 'https://picsum.photos/id/1050/700/700',
        likes: 2051,
        comments: 57
      },
      {
        id: 6,
        image: 'https://picsum.photos/id/1062/700/700',
        likes: 894,
        comments: 16
      },
      {
        id: 7,
        image: 'https://picsum.photos/id/1074/700/700',
        likes: 1433,
        comments: 40
      },
      {
        id: 8,
        image: 'https://picsum.photos/id/1084/700/700',
        likes: 732,
        comments: 12
      },
      {
        id: 9,
        image: 'https://picsum.photos/id/1080/700/700',
        likes: 1678,
        comments: 44
      }
    ]

    return demoPosts
  }, [])

  const profile = {
    avatar: currentUser?.profilePicture || '',
    initials: currentUser?.initials || 'SC',
    name: currentUser?.fullName || 'Sarah Chen',
    username: currentUser?.username ? `@${currentUser.username}` : '@sarahchen',
    bio: currentUser?.bio || 'Photographer | Traveler | Coffee enthusiast',
    followers: currentUser?.followerCount ?? 15234,
    following: currentUser?.followingCount ?? 892,
    postsCount: userPosts.length,
    website: currentUser?.website || 'sarahchen.com',
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
