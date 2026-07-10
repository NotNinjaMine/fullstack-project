import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Navbar from './Navbar'

/** FIGMA shell — navbar + sidebar + routed content via <Outlet /> */
export default function Layout() {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: 'var(--bg)' }}>
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <Navbar />

        <main style={{
          flex: 1,
          overflow: 'auto',
          padding: 'var(--space-6) var(--space-8)',
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
        }}
          className="animate-in"
        >
          <Outlet />
        </main>
      </div>
    </div>
  )
}
