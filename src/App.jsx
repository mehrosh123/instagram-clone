import { useEffect, useState } from 'react'
import Header from './components/Header'
import Feed from './components/Feed'
import Profile from './components/Profile'
import Sidebar from './components/Sidebar'
import Login from './components/Login'
import Signup from './components/Signup'
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
  const { isAuthenticated, checkAuth, currentUser } = useAuth()
  // Navigation state - tracks which page is currently shown
  const [currentPage, setCurrentPage] = useState('home')
  const [authPage, setAuthPage] = useState('signup')
  const [selectedUsername, setSelectedUsername] = useState('')
  const [selectedUserData, setSelectedUserData] = useState(null)

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  useEffect(() => {
    if (!isAuthenticated && authPage !== 'login' && authPage !== 'signup') {
      setAuthPage('signup')
    }
  }, [authPage, isAuthenticated])

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

  const handleSearchSelectUser = async (user) => {
    try {
      const data = await apiFetch(`/api/users/${user.username}`)
      setSelectedUsername(user.username)
      setSelectedUserData(data)
      setCurrentPage('user-profile')
    } catch (err) {
      console.error('Failed to load user profile:', err)
    }
  }

  if (!isAuthenticated) {
    return authPage === 'signup' ? (
      <Signup onSwitch={() => setAuthPage('login')} />
    ) : (
      <Login onSwitch={() => setAuthPage('signup')} />
    )
  }

  return (
    <div className="app">
      {/* Header - shown on all pages */}
      <Header
        onNavigate={handleNavigation}
        currentUser={currentUser}
        onSearchSelectUser={handleSearchSelectUser}
      />

      <div className="app-body">
        {/* Sidebar - left navigation */}
        <Sidebar currentPage={currentPage} currentUser={currentUser} />

        {/* Main Content Area - changes based on currentPage state */}
        <main className="main-content">
          {currentPage === 'home' ? (
            <>
              {/* 
                THEORY: Conditional Rendering
                ==============================
                Renders Feed when currentPage is 'home'
                React only renders the active view, saving performance
              */}
              <Feed />
              <aside className="sidebar-right">
                <SuggestedUsers currentUser={currentUser} />
              </aside>
            </>
          ) : currentPage === 'profile' ? (
            <Profile />
          ) : currentPage === 'user-profile' && selectedUserData ? (
            <UserProfileView username={selectedUsername} data={selectedUserData} />
          ) : null}
        </main>
      </div>
    </div>
  )
}

/**
 * THEORY: Child Component
 * ======================
 * Suggested users sidebar shows accounts to follow.
 * Demonstrates data-driven rendering and reusable component patterns.
 */
function SuggestedUsers({ currentUser }) {
  const [users, setUsers] = useState([])

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const data = await apiFetch('/api/users/search?q=a')
        const filtered = (data.users || []).filter(user => user.id !== currentUser?.id)
        setUsers(filtered.slice(0, 5))
      } catch {
        setUsers([])
      }
    }

    loadUsers()
  }, [currentUser?.id])

  return (
    <div className="suggested-users">
      <h3>Suggested for you</h3>
      {users.map(user => (
        <div key={user.id} className="suggested-user">
          <div className="user-info">
            {user.profilePicture ? (
              <img src={user.profilePicture} alt={user.username} className="avatar" />
            ) : (
              <span className="avatar">👤</span>
            )}
            <div className="user-details">
              <p className="name">{user.fullName}</p>
              <small>@{user.username}</small>
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
