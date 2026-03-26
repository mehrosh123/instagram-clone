import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import Feed from './components/Feed'
import Header from './components/Header'
import Profile from './components/Profile'
import Sidebar from './components/Sidebar'
import AuthLanding from './components/AuthLanding'
import ProtectedRoute from './components/ProtectedRoute'
import SplashScreen from './components/SplashScreen'
import FollowButton from './components/Followers'
import { useAuth } from './context/useAuth'
import { apiFetch } from './api/client'
import './App.css'

function App() {
  const { isAuthenticated, currentUser, checkAuth, hasCheckedAuth } = useAuth()

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  if (!hasCheckedAuth) {
    return <SplashScreen />
  }

  return (
    <Routes>
      <Route path="/" element={<Navigate to={isAuthenticated ? '/home' : '/login'} replace />} />
      <Route path="/login" element={<AuthLanding initialMode="login" />} />
      <Route path="/signup" element={<AuthLanding initialMode="signup" />} />
      <Route
        path="/home"
        element={(
          <ProtectedRoute>
            <ShellPage currentUser={currentUser} currentPage="home" />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/profile"
        element={(
          <ProtectedRoute>
            <ShellPage currentUser={currentUser} currentPage="profile" />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/users/:username"
        element={(
          <ProtectedRoute>
            <ShellPage currentUser={currentUser} currentPage="user-profile" />
          </ProtectedRoute>
        )}
      />
      <Route path="*" element={<Navigate to={isAuthenticated ? '/home' : '/login'} replace />} />
    </Routes>
  )
}

function ShellPage({ currentUser, currentPage }) {
  const navigate = useNavigate()

  const handleNavigation = (page) => {
    if (page === 'profile') {
      navigate('/profile')
      return
    }

    navigate('/home')
  }

  const handleOpenUserProfile = (username) => {
    const normalized = String(username || '').trim().replace(/^@/, '').toLowerCase()
    if (!normalized) return
    navigate(`/users/${normalized}`)
  }

  return (
    <div className="app">
      <div className="app-body">
        <Sidebar currentPage={currentPage} currentUser={currentUser} onNavigate={handleNavigation} />

        <div className="main-content">
          <Header
            currentUser={currentUser}
            onNavigate={handleNavigation}
            onSearchSelectUser={(user) => handleOpenUserProfile(user?.username)}
          />

          <main>
            {currentPage === 'home' ? (
              <Feed onOpenProfile={handleOpenUserProfile} />
            ) : currentPage === 'profile' ? (
              <Profile onOpenProfile={handleOpenUserProfile} />
            ) : (
              <UserProfileRoute onOpenProfile={handleOpenUserProfile} />
            )}
          </main>
        </div>

        {currentPage === 'home' && (
          <aside className="sidebar-right">
            <SuggestedUsers currentUser={currentUser} onOpenProfile={handleOpenUserProfile} />
          </aside>
        )}
      </div>

      <footer className="app-footer">
        <p>About | Help | Press | API | Jobs | Privacy | Terms | Locations</p>
        <p>Instagram from Meta</p>
      </footer>
    </div>
  )
}

function SuggestedUsers({ currentUser, onOpenProfile }) {
  const [users, setUsers] = useState([])
  const [showAllUsers, setShowAllUsers] = useState(false)

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const data = await apiFetch('/api/users/search?q=a')
        const filtered = (data.users || []).filter(user => user.id !== currentUser?.id)
        setUsers(filtered)
      } catch {
        setUsers([])
      }
    }

    loadUsers()
  }, [currentUser?.id])

  return (
    <div className="suggested-users">
      <div className="account-preview">
        {currentUser?.profilePicture ? (
          <img src={currentUser.profilePicture} alt={currentUser.username} className="avatar" />
        ) : (
          <span className="avatar">U</span>
        )}
        <div className="user-details">
          <p className="name">@{currentUser?.username || 'you'}</p>
          <small>{currentUser?.fullName || 'Welcome back'}</small>
        </div>
      </div>

      <div className="suggested-header">
        <h3>Suggested for you</h3>
        <button type="button" onClick={() => setShowAllUsers(prev => !prev)}>
          {showAllUsers ? 'See less' : 'See all'}
        </button>
      </div>

      {(showAllUsers ? users : users.slice(0, 5)).map(user => (
        <div key={user.id} className="suggested-user">
          <div className="user-info">
            <button type="button" className="profile-link-btn" onClick={() => onOpenProfile?.(user.username)}>
              {user.profilePicture ? (
                <img src={user.profilePicture} alt={user.username} className="avatar" />
              ) : (
                <span className="avatar">U</span>
              )}
            </button>
            <div className="user-details">
              <button type="button" className="profile-link-name" onClick={() => onOpenProfile?.(user.username)}>{user.fullName}</button>
              <button type="button" className="profile-link-username" onClick={() => onOpenProfile?.(user.username)}>@{user.username}</button>
            </div>
          </div>
          <FollowButton userId={user.id} isPrivate={user.isPrivate} />
        </div>
      ))}
    </div>
  )
}

function UserProfileRoute({ onOpenProfile }) {
  const { username } = useParams()
  const [profileData, setProfileData] = useState(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadProfile = async () => {
      setIsLoading(true)
      setError('')

      try {
        const data = await apiFetch(`/api/users/${encodeURIComponent(username || '')}`)
        setProfileData(data)
      } catch (err) {
        setProfileData(null)
        setError(err.message || 'Failed to load profile')
      } finally {
        setIsLoading(false)
      }
    }

    loadProfile()
  }, [username])

  if (isLoading) {
    return <div className="profile"><p>Loading profile...</p></div>
  }

  if (error) {
    return <div className="profile"><p className="profile-post-error">{error}</p></div>
  }

  return <UserProfileView username={username} data={profileData} onOpenProfile={onOpenProfile} />
}

function UserProfileView({ username, data, onOpenProfile }) {
  return (
    <div className="profile">
      <div className="profile-header">
        <div className="profile-avatar">
          {data.user?.profilePicture ? (
            <img src={data.user.profilePicture} alt={data.user.fullName} className="avatar-image" />
          ) : (
            <span className="avatar-emoji">{(data.user?.fullName || 'U').slice(0, 1).toUpperCase()}</span>
          )}
        </div>
        <div className="profile-info">
          <div className="profile-top">
            <h1 className="username">@{username}</h1>
            <FollowButton userId={data.user?.id} isPrivate={data.user?.isPrivate} />
            <span className={`privacy-badge ${data.user?.isPrivate ? 'private' : 'public'}`}>
              {data.user?.isPrivate ? 'Lock Private' : 'Public'}
            </span>
          </div>
          <div className="profile-stats">
            <div className="stat"><strong>{data.posts?.length || 0}</strong><p>Posts</p></div>
            <div className="stat"><strong>{data.user?.followerCount || 0}</strong><p>Followers</p></div>
            <div className="stat"><strong>{data.user?.followingCount || 0}</strong><p>Following</p></div>
          </div>
          <div className="profile-bio">
            <h2>{data.user?.fullName}</h2>
            <p>{data.user?.bio}</p>
            {data.user?.website ? (
              <a
                href={data.user.website.startsWith('http://') || data.user.website.startsWith('https://')
                  ? data.user.website
                  : `https://${data.user.website}`}
                target="_blank"
                rel="noreferrer"
              >
                {data.user.website}
              </a>
            ) : null}
          </div>
        </div>
      </div>

      <div className="posts-grid">
        {data.user?.canViewPosts ? (
          (data.posts || []).map(post => (
            <div key={post.id} className="grid-post" onClick={() => onOpenProfile?.(username)}>
              <img src={post.images?.[0]} alt={post.caption} />
            </div>
          ))
        ) : (
          <p className="no-posts-message">This account is private. Posts are visible after an accepted follow.</p>
        )}
      </div>
    </div>
  )
}

export default App
