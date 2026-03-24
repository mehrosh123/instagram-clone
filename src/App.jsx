import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Feed from './components/Feed'
import Profile from './components/Profile'
import Sidebar from './components/Sidebar'
import AuthLanding from './components/AuthLanding'
import ProtectedRoute from './components/ProtectedRoute'
import SplashScreen from './components/SplashScreen'
import FollowButton from './components/Followers'
import { useAuth } from './context/AuthContext'
import { apiFetch } from './api/client'
import './App.css'

/**
 * THEORY: Main App Component - Application State & Navigation
 * ===========================================================
 * 
 * React Application Architecture:
 * 
 * 1. COMPONENT HIERARCHY:
 *    App (Root)
 *    ├── Header (Navigation)
 *    ├── Sidebar (Left nav)
 *    └── MainContent
 *        ├── Feed (Home view)
 *        └── Profile (User profile view)
 *
 * 2. STATE MANAGEMENT:
 *    - currentPage: Tracks which view to display (home/profile)
 *    - Modern apps use Context API or Redux for complex state
 *    - This starter uses "lifting state up" pattern
 *
 * 3. COMPONENT COMMUNICATION:
 *    Parent → Child: Props (one-way data flow)
 *    Child → Parent: Callbacks/Event handlers
 *    
 * 4. VIRTUAL DOM CONCEPT:
 *    React creates virtual representation of UI
 *    Compares new vs old virtual DOM (diffing)
 *    Only updates changed elements in real DOM (reconciliation)
 *    This makes apps fast and efficient
 */

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
      <Route
        path="/"
        element={<Navigate to={isAuthenticated ? '/home' : '/login'} replace />}
      />
      <Route
        path="/login"
        element={<AuthLanding initialMode="login" />}
      />
      <Route
        path="/signup"
        element={<AuthLanding initialMode="signup" />}
      />
      <Route
        path="/home"
        element={(
          <ProtectedRoute>
            <HomePage currentUser={currentUser} />
          </ProtectedRoute>
        )}
      />
      <Route
        path="*"
        element={<Navigate to={isAuthenticated ? '/home' : '/login'} replace />}
      />
    </Routes>
  )
}

function HomePage({ currentUser }) {
  // Navigation state - tracks which page is currently shown
  const [currentPage, setCurrentPage] = useState('home')
  const [selectedUsername, setSelectedUsername] = useState('')
  const [selectedUserData, setSelectedUserData] = useState(null)

  /**
   * THEORY: Event Handler (Callback)
   * ================================
   * This function is passed down to Header component.
   * When header receives navigation click, it calls this to update parent state.
   * This demonstrates Parent-Child communication flow.
   */
  const handleNavigation = (page) => {
    setCurrentPage(page)
  }

  const handleOpenUserProfile = async (username) => {
    const normalized = String(username || '').trim().replace(/^@/, '').toLowerCase()
    if (!normalized) return

    try {
      const data = await apiFetch(`/api/users/${normalized}`)
      setSelectedUsername(normalized)
      setSelectedUserData(data)
      setCurrentPage('user-profile')
    } catch {
      // Ignore navigation when profile fetch fails.
    }
  }

  return (
    <div className="app">
      <div className="app-body">
        {/* Sidebar - left navigation */}
        <Sidebar currentPage={currentPage} currentUser={currentUser} onNavigate={handleNavigation} />

        {/* Main Content Area - changes based on currentPage state */}
        <main className="main-content">
          {currentPage === 'home' ? (
            /* 
              THEORY: Conditional Rendering
              ==============================
              Renders Feed when currentPage is 'home'
              React only renders the active view, saving performance
            */
            <Feed onOpenProfile={handleOpenUserProfile} />
          ) : currentPage === 'profile' ? (
            <Profile />
          ) : currentPage === 'user-profile' && selectedUserData ? (
            <UserProfileView username={selectedUsername} data={selectedUserData} />
          ) : null}
        </main>

        {currentPage === 'home' && (
          <aside className="sidebar-right">
            <SuggestedUsers currentUser={currentUser} onOpenProfile={handleOpenUserProfile} />
          </aside>
        )}
      </div>

      <footer className="app-footer">
        <p>About · Help · Press · API · Jobs · Privacy · Terms · Locations</p>
        <p>Instagram from Meta</p>
      </footer>
    </div>
  )
}

/**
 * THEORY: Child Component
 * ======================
 * Suggested users sidebar shows accounts to follow.
 * Demonstrates data-driven rendering and reusable component patterns.
 */
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
          <span className="avatar">👤</span>
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
                <span className="avatar">👤</span>
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

function UserProfileView({ username, data }) {
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
          </div>
          <div className="profile-stats">
            <div className="stat"><strong>{data.posts?.length || 0}</strong><p>Posts</p></div>
            <div className="stat"><strong>{data.user?.followerCount || 0}</strong><p>Followers</p></div>
            <div className="stat"><strong>{data.user?.followingCount || 0}</strong><p>Following</p></div>
          </div>
          <div className="profile-bio">
            <h2>{data.user?.fullName}</h2>
            <p>{data.user?.bio}</p>
          </div>
        </div>
      </div>

      <div className="posts-grid">
        {(data.posts || []).map(post => (
          <div key={post.id} className="grid-post">
            <img src={post.images?.[0]} alt={post.caption} />
          </div>
        ))}
      </div>
    </div>
  )
}

export default App
