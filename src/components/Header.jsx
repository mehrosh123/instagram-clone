import Search from './Search'
import BrandLogo from './BrandLogo'
import { useAuth } from '../context/useAuth'
import '../styles/Header.css'

export default function Header({ onNavigate, currentUser, onSearchSelectUser }) {
  const { logout } = useAuth()

  return (
    <header className="header">
      <div className="header-container">
        <div className="logo">
          <BrandLogo compact imageOnly />
        </div>

        <div className="search-container">
          <Search onSelectUser={onSearchSelectUser} />
        </div>

        <nav className="header-nav">
          <button className="nav-btn" title="Home" onClick={() => onNavigate('home')}>Home</button>
          <button className="nav-btn notification-btn" title="Notifications">
            <span className="notification-badge">3</span>
            Alerts
          </button>
          <button className="nav-btn" title="Messages">Inbox</button>
          <button className="nav-btn" title="Likes">Likes</button>
          <button className="nav-btn" title="Create">Create</button>
          <button className="nav-btn" title="Log out" onClick={logout}>Logout</button>
          <button className="nav-btn profile-btn" title="Profile" onClick={() => onNavigate('profile')}>
            {currentUser?.profilePicture ? (
              <img
                src={currentUser.profilePicture}
                alt={currentUser.username || 'Profile'}
                className="header-profile-image"
              />
            ) : (
              <span className="header-profile-fallback">
                {currentUser?.initials || 'U'}
              </span>
            )}
          </button>
        </nav>
      </div>
    </header>
  )
}
