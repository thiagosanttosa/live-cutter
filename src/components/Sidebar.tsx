interface SidebarProps {
  page: 'dashboard' | 'history' | 'settings'
  onNavigate: (page: 'dashboard' | 'history' | 'settings') => void
}

export default function Sidebar({ page, onNavigate }: SidebarProps) {
  return (
    <aside className="sidebar">
      <a className="brand" href="#dashboard" onClick={() => onNavigate('dashboard')} aria-label="LIVE CUTTER Dashboard">
        <span className="brand__mark" aria-hidden="true">✂</span><span>LIVE <b>CUTTER</b></span>
      </a>
      <span className="sidebar__label">WORKSPACE</span>
      <nav className="nav" aria-label="Main navigation">
        <button className={`nav__item ${page === 'dashboard' ? 'nav__item--active' : ''}`} onClick={() => onNavigate('dashboard')}>
          <span aria-hidden="true">▦</span> Dashboard
        </button>
        <button className={`nav__item ${page === 'history' ? 'nav__item--active' : ''}`} onClick={() => onNavigate('history')}>
          <span aria-hidden="true">◷</span> Clip History
        </button>
        <button className={`nav__item ${page === 'settings' ? 'nav__item--active' : ''}`} onClick={() => onNavigate('settings')}>
          <span aria-hidden="true">⚙</span> Settings
        </button>
      </nav>
      <div className="sidebar__footer"><span className="status__dot" /> LOCAL WORKSPACE</div>
    </aside>
  )
}
