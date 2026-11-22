interface HeaderProps { title?: string; subtitle?: string }

export default function Header({ title = 'Dashboard', subtitle = 'Extract clips from YouTube livestreams.' }: HeaderProps) {
  return (
    <header className="page-header">
      <div><p className="eyebrow">LIVE CUTTER / WORKSPACE</p><h1>{title}</h1><p className="page-header__subtitle">{subtitle}</p></div>
      <div className="system-status"><span className="status__dot" /> SYSTEM READY</div>
    </header>
  )
}
