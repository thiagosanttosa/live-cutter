import Home from './pages/Home'
import { useState } from 'react'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import Settings from './pages/Settings'
import History from './pages/History'

export default function App() {
  const [page, setPage] = useState<'dashboard' | 'history' | 'settings'>('dashboard')
  return (
    <div className="app-shell">
      <Sidebar page={page} onNavigate={setPage} />
      <main className="main-area">
        <Header title={page === 'dashboard' ? 'Dashboard' : page === 'history' ? 'Clip History' : 'Settings'} subtitle={page === 'dashboard' ? 'Extract clips from YouTube livestreams.' : page === 'history' ? 'Review clips and processing attempts stored on this device.' : 'Manage output, quality and file naming.'} />
        <div hidden={page !== 'dashboard'}><Home /></div>
        <div hidden={page !== 'history'}><History active={page === 'history'} /></div>
        <div hidden={page !== 'settings'}><Settings /></div>
      </main>
    </div>
  )
}
