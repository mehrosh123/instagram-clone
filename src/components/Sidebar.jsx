import '../styles/Sidebar.css'
import { useAuth } from '../context/useAuth'
import BrandLogo from './BrandLogo'

/**
 * THEORY: Sidebar Component
 * ==========================
 * Left navigation sidebar showing menu items.
 * Usually receives props to update parent component state.
 */

export default function Sidebar({ currentPage, currentUser, onNavigate }) {
  const { logout } = useAuth()

  const menuItems = [
    { id: 'home', label: 'Home', icon: '⌂' },
    { id: 'reels', label: 'Reels', icon: '▻' },
    { id: 'messages', label: 'Messages', icon: '✉' },
    { id: 'search', label: 'Search', icon: '⌕' },
    { id: 'explore', label: 'Explore', icon: '◌' },
    { id: 'likes', label: 'Notifications', icon: '♡' },
    { id: 'create', label: 'Create', icon: '+' },
    {
      id: 'profile',
      label: 'Profile',
      icon: currentUser?.profilePicture ? null : (currentUser?.initials || '👤'),
      profilePicture: currentUser?.profilePicture || ''
    }
  ]

  return (
    <aside className="sidebar">
      <div className="sidebar-brand" onClick={() => onNavigate('home')}>
        <BrandLogo imageOnly compact />
      </div>

      <div className="sidebar-sticky">
        <nav className="sidebar-nav">
          <ul>
            {menuItems.map(item => (
              <li key={item.id}>
                <a 
                  href={`#${item.id}`} 
                  className={`nav-link ${currentPage === item.id ? 'active' : ''}`}
                  onClick={(e) => {
                    e.preventDefault()
                    onNavigate(item.id)
                  }}
                >
                  <span className="icon">
                    {item.profilePicture ? (
                      <img
                        src={item.profilePicture}
                        alt={currentUser?.username || 'Profile'}
                        className="sidebar-profile-image"
                      />
                    ) : item.icon}
                  </span>
                  <span className="label">{item.label}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {/* Footer */}
      <footer className="sidebar-footer">
        <button className="footer-btn" title="More">≡ <span>More</span></button>
        <button className="footer-btn" title="Also from Meta">⌗ <span>Also from Meta</span></button>
        <button className="footer-btn logout-btn" title="Log out" onClick={logout}>↩ <span>Log out</span></button>
      </footer>
    </aside>
  )
}
