import '../styles/Sidebar.css'

/**
 * THEORY: Sidebar Component
 * ==========================
 * Left navigation sidebar showing menu items.
 * Usually receives props to update parent component state.
 */

export default function Sidebar({ currentPage, currentUser, onNavigate }) {
  const menuItems = [
    { id: 'home', label: 'Home', icon: '🏠' },
    { id: 'explore', label: 'Explore', icon: '🔍' },
    { id: 'reels', label: 'Reels', icon: '🎬' },
    { id: 'messages', label: 'Messages', icon: '✉️' },
    { id: 'likes', label: 'Likes', icon: '❤️' },
    {
      id: 'profile',
      label: 'Profile',
      icon: currentUser?.profilePicture ? null : (currentUser?.initials || '👤'),
      profilePicture: currentUser?.profilePicture || ''
    }
  ]

  return (
    <aside className="sidebar">
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

        {/* Create Post Button */}
        <button className="create-btn" onClick={() => onNavigate('home')}>
          <span>➕</span>
          Create
        </button>
      </div>

      {/* Footer */}
      <footer className="sidebar-footer">
        <button className="footer-btn">⚙️</button>
        <button className="footer-btn" title="More">⋯</button>
      </footer>
    </aside>
  )
}
