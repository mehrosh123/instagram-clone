import Search from './Search'
import BrandLogo from './BrandLogo'
import { useAuth } from '../context/AuthContext'
import '../styles/Header.css'

/**
 * THEORY: Header Component
 * ========================
 * Navigation header similar to Instagram's top bar.
 * Demonstrates:
 * - Conditional Rendering
 * - Event handling
 * - State for toggling modals/menus
 */

export default function Header({ onNavigate, currentUser, onSearchSelectUser }) {
  const { logout } = useAuth()

  /**
   * THEORY: Conditional Rendering
   * ==============================
   * Using ternary operators and && to conditionally show UI elements.
   * {showSearch && <SearchBox />} means: only render SearchBox if showSearch is true
   */

  return (
    <header className="header">
      <div className="header-container">
        {/* Logo */}
        <div className="logo">
          <BrandLogo compact imageOnly />
        </div>

        {/* Search bar */}
        <div className="search-container">
          <Search onSelectUser={onSearchSelectUser} />
        </div>

        {/* Navigation icons */}
        <nav className="header-nav">
          <button 
            className="nav-btn"
            title="Home"
            onClick={() => onNavigate('home')}
          >
            🏠
          </button>
          <button 
            className="nav-btn notification-btn"
            title="Notifications"
          >
            <span className="notification-badge">3</span>
            🔔
          </button>
          <button 
            className="nav-btn"
            title="Messages"
          >
            ✉️
          </button>
          <button 
            className="nav-btn"
            title="Likes"
          >
            ❤️
          </button>
          <button 
            className="nav-btn"
            title="Create"
          >
            ➕
          </button>
          <button
            className="nav-btn"
            title="Log out"
            onClick={logout}
          >
            ↩
          </button>
          <button 
            className="nav-btn profile-btn"
            title="Profile"
            onClick={() => onNavigate('profile')}
          >
            {currentUser?.profilePicture ? (
              <img
                src={currentUser.profilePicture}
                alt={currentUser.username || 'Profile'}
                className="header-profile-image"
              />
            ) : (
              <span className="header-profile-fallback">
                {currentUser?.initials || '👤'}
              </span>
            )}
          </button>
        </nav>
      </div>
    </header>
  )
}
