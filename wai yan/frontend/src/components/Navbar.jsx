import { useState } from 'react'
import { Bell, Search, ChevronDown, Sun, Moon } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useNotifications } from '../hooks/useNotifications'
import { useTheme } from '../hooks/useTheme'
import { PATH_TITLES, nameInitials, nameColor } from '../utils/nav'
import { formatRole } from '../utils/constants'
import { Avatar } from './ui'

function formatToday() {
  try {
    return new Date().toLocaleDateString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return ''
  }
}

export default function Navbar() {
  const { user } = useAuth()
  const { notifications, unreadCount, markAllRead } = useNotifications()
  const { isDark, toggleTheme } = useTheme()
  const location = useLocation()
  const navigate = useNavigate()
  const [notifDrop, setNotifDrop] = useState(false)

  const title = PATH_TITLES[location.pathname]
    || Object.entries(PATH_TITLES).find(([p]) => p !== '/' && location.pathname.startsWith(p))?.[1]
    || 'Dashboard'

  const color = nameColor(user?.name)
  const initials = nameInitials(user?.name)

  const preview = (notifications || []).slice(0, 3)

  return (
    <header style={{
      height: 'var(--navbar-height)',
      margin: 'var(--space-3) var(--space-3) 0 0',
      background: 'var(--glass)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      boxShadow: 'var(--shadow-sm)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 var(--space-5)',
      gap: 'var(--space-4)',
      position: 'sticky',
      top: 'var(--space-3)',
      zIndex: 100,
    }}
    >

      {/* Page title */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1 style={{
          fontSize: 'var(--font-size-md)',
          fontWeight: 'var(--font-weight-bold)',
          color: 'var(--text)',
          margin: 0,
          letterSpacing: 'var(--letter-tight)',
        }}
        >
          {title}
        </h1>
        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-dim)', marginTop: 2 }}>
          {formatToday()}
        </div>
      </div>

      {/* Search — visual only, design fidelity */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '8px 14px',
        color: 'var(--text-muted)',
        cursor: 'text',
        fontSize: 'var(--font-size-sm)',
        minWidth: 200,
        boxShadow: 'var(--shadow-sm)',
        transition: 'border-color var(--transition), box-shadow var(--transition)',
      }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-strong)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--border)'
        }}
      >
        <Search size={14} style={{ flexShrink: 0, opacity: 0.85 }} />
        <span style={{ flex: 1 }}>Search...</span>
        <kbd style={{
          fontSize: 10,
          fontFamily: 'inherit',
          fontWeight: 600,
          color: 'var(--text-dim)',
          background: 'var(--surface-3)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          padding: '2px 6px',
          letterSpacing: '0.02em',
        }}
        >
          ⌘K
        </kbd>
      </div>

      {/* Theme toggle */}
      <button
        type="button"
        onClick={toggleTheme}
        title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
        aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
        style={{
          width: 40,
          height: 40,
          borderRadius: 'var(--radius-sm)',
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all var(--transition)',
          flexShrink: 0,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--surface-3)'
          e.currentTarget.style.color = 'var(--accent)'
          e.currentTarget.style.transform = 'translateY(-1px)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'var(--surface-2)'
          e.currentTarget.style.color = 'var(--text-muted)'
          e.currentTarget.style.transform = 'translateY(0)'
        }}
      >
        {isDark ? <Sun size={16} /> : <Moon size={16} />}
      </button>

      {/* Notification bell */}
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => setNotifDrop(!notifDrop)}
          style={{
            position: 'relative',
            width: 40,
            height: 40,
            borderRadius: 'var(--radius-sm)',
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all var(--transition)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--surface-3)'
            e.currentTarget.style.color = 'var(--text)'
            e.currentTarget.style.transform = 'translateY(-1px)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--surface-2)'
            e.currentTarget.style.color = 'var(--text-muted)'
            e.currentTarget.style.transform = 'translateY(0)'
          }}
        >
          <Bell size={16} />
          {unreadCount > 0 && (
            <span style={{
              position: 'absolute',
              top: 6,
              right: 6,
              minWidth: 16,
              height: 16,
              padding: '0 4px',
              borderRadius: 100,
              background: 'var(--danger)',
              border: '2px solid var(--surface)',
              color: 'var(--on-accent)',
              fontSize: 9,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
            }}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {notifDrop && (
          <>
            <div onClick={() => setNotifDrop(false)} style={{ position: 'fixed', inset: 0, zIndex: 200 }} />
            <div style={{
              position: 'absolute', top: '100%', right: 0, marginTop: 10,
              width: 340,
              background: 'var(--glass-strong)',
              backdropFilter: 'blur(16px)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              boxShadow: 'var(--shadow)',
              zIndex: 300,
              overflow: 'hidden',
              animation: 'fade-in-up var(--transition) ease both',
            }}
            >
              <div style={{
                padding: '14px 16px',
                borderBottom: '1px solid var(--border-light)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
              >
                <span style={{ fontWeight: 'var(--font-weight-bold)', fontSize: 'var(--font-size-sm)' }}>Notifications</span>
                <span
                  style={{ fontSize: 'var(--font-size-xs)', color: 'var(--accent-hover)', cursor: 'pointer', fontWeight: 600 }}
                  onClick={() => { markAllRead().catch(() => {}) }}
                >
                  Mark all read
                </span>
              </div>
              {preview.length === 0 ? (
                <div style={{ padding: '24px 16px', fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)', textAlign: 'center' }}>
                  No notifications yet
                </div>
              ) : (
                preview.map((n) => {
                  const unread = !n.read_flag && !n.read
                  const msg = n.body || n.message || ''
                  return (
                    <div
                      key={n.id}
                      style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid var(--border-light)',
                        background: unread ? 'var(--accent-muted)' : 'transparent',
                        cursor: 'pointer',
                        display: 'flex',
                        gap: 12,
                        transition: 'background var(--transition)',
                      }}
                      onClick={() => { setNotifDrop(false); navigate('/notifications') }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = unread ? 'var(--accent-muted)' : 'transparent' }}
                    >
                      {unread && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', marginTop: 6, flexShrink: 0 }} />}
                      {!unread && <div style={{ width: 6 }} />}
                      <div>
                        <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{n.title || 'Notification'}</div>
                        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', lineHeight: 1.45 }}>{msg}</div>
                      </div>
                    </div>
                  )
                })
              )}
              <div
                onClick={() => { navigate('/notifications'); setNotifDrop(false) }}
                style={{
                  padding: '12px 16px',
                  textAlign: 'center',
                  fontSize: 'var(--font-size-sm)',
                  color: 'var(--accent-hover)',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                View all notifications →
              </div>
            </div>
          </>
        )}
      </div>

      {/* User pill */}
      <button
        type="button"
        onClick={() => navigate('/profile')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '6px 10px 6px 6px',
          cursor: 'pointer',
          transition: 'all var(--transition)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--surface-3)'
          e.currentTarget.style.borderColor = 'var(--border-strong)'
          e.currentTarget.style.transform = 'translateY(-1px)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'var(--surface-2)'
          e.currentTarget.style.borderColor = 'var(--border)'
          e.currentTarget.style.transform = 'translateY(0)'
        }}
      >
        <Avatar initials={initials} color={color} size={30} online />
        <div style={{ textAlign: 'left' }}>
          <div style={{
            fontSize: 'var(--font-size-sm)',
            fontWeight: 'var(--font-weight-semibold)',
            color: 'var(--text)',
            lineHeight: 1.2,
          }}
          >
            {user?.name || 'User'}
          </div>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', lineHeight: 1.2 }}>
            <span style={{ color: 'var(--accent-hover)', fontWeight: 600 }}>{formatRole(user?.role)}</span>
            {(user?.office_branch || user?.office_city) && (
              <> · {user.office_branch || user.office_city}</>
            )}
          </div>
        </div>
        <ChevronDown size={14} color="var(--text-dim)" style={{ marginLeft: 2, flexShrink: 0 }} />
      </button>
    </header>
  )
}
