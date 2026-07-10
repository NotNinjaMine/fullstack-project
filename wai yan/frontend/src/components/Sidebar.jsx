import {
  LayoutDashboard, PlusCircle, Clock, CalendarDays, Bell, User,
  CheckSquare, Shield, Building2, LogOut, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useNotifications } from '../hooks/useNotifications'
import { PAGE_ROUTES, isNavActive, nameInitials, nameColor } from '../utils/nav'
import { formatRole, PAGES_BY_ROLE } from '../utils/constants'
import { tint } from './ui'

const ICON_MAP = {
  LayoutDashboard, PlusCircle, Clock, CalendarDays, Bell, User, CheckSquare, Shield,
}

export default function Sidebar({ collapsed, setCollapsed }) {
  const { user, logout } = useAuth()
  const { unreadCount } = useNotifications()
  const navigate = useNavigate()
  const location = useLocation()

  const role = user?.role || 'employee'
  const pages = PAGES_BY_ROLE[role] || PAGES_BY_ROLE.employee
  const initials = nameInitials(user?.name)
  const color = nameColor(user?.name)

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <aside style={{
      width: collapsed ? 64 : 'var(--sidebar-width)',
      minHeight: '100%',
      margin: 'var(--space-3) 0 var(--space-3) var(--space-3)',
      background: 'var(--glass)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      boxShadow: 'var(--shadow-sm)',
      display: 'flex',
      flexDirection: 'column',
      transition: 'width var(--transition-slow), box-shadow var(--transition)',
      flexShrink: 0,
      position: 'relative',
      zIndex: 10,
      overflow: 'visible',
    }}>

      {/* Logo */}
      <div
        style={{
          height: 'var(--navbar-height)',
          display: 'flex',
          alignItems: 'center',
          padding: collapsed ? '0 12px' : '0 var(--space-5)',
          borderBottom: '1px solid var(--border-light)',
          gap: 'var(--space-3)',
          overflow: 'hidden',
          cursor: 'pointer',
        }}
        onClick={() => navigate('/')}
      >
        <div style={{
          width: 36, height: 36, borderRadius: 'var(--radius-sm)', flexShrink: 0,
          background: 'var(--accent-gradient)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: 'var(--shadow-accent)',
        }}>
          <Building2 size={16} color="var(--on-accent)" />
        </div>
        {!collapsed && (
          <div>
            <div style={{
              fontSize: 'var(--font-size-sm)',
              fontWeight: 'var(--font-weight-bold)',
              color: 'var(--text)',
              lineHeight: 1.2,
              letterSpacing: 'var(--letter-tight)',
            }}
            >
              LeaveFlow
            </div>
            <div style={{
              fontSize: 'var(--font-size-xs)',
              color: 'var(--text-dim)',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              marginTop: 2,
            }}
            >
              {user?.company_name || 'Apex Corp'}
            </div>
          </div>
        )}
      </div>

      {/* Nav links */}
      <nav style={{
        flex: 1,
        padding: collapsed ? 'var(--space-3) var(--space-2)' : 'var(--space-3) var(--space-3)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-1)',
        overflow: 'hidden',
      }}
      >
        {pages.map((p) => {
          const Icon = ICON_MAP[p.icon] || LayoutDashboard
          const active = isNavActive(p.id, location.pathname)
          const path = PAGE_ROUTES[p.id] || '/'
          const unread = p.id === 'notifications' ? unreadCount : 0
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => navigate(path)}
              title={collapsed ? p.label : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-3)',
                padding: collapsed ? '10px' : '10px 12px',
                borderRadius: 'var(--radius-sm)',
                background: active ? 'var(--accent-muted)' : 'transparent',
                border: active ? '1px solid color-mix(in srgb, var(--accent) 28%, transparent)' : '1px solid transparent',
                boxShadow: active ? '0 0 20px var(--accent-glow)' : 'none',
                color: active ? 'var(--accent-hover)' : 'var(--text-muted)',
                cursor: 'pointer',
                width: '100%',
                textAlign: 'left',
                transition: 'all var(--transition)',
                fontWeight: active ? 'var(--font-weight-semibold)' : 'var(--font-weight-medium)',
                fontSize: 'var(--font-size-sm)',
                justifyContent: collapsed ? 'center' : 'flex-start',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                position: 'relative',
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  e.currentTarget.style.background = 'var(--surface-2)'
                  e.currentTarget.style.color = 'var(--text)'
                }
                const iconBox = e.currentTarget.querySelector('[data-nav-icon]')
                if (iconBox) iconBox.style.transform = 'scale(1.06)'
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = 'var(--text-muted)'
                }
                const iconBox = e.currentTarget.querySelector('[data-nav-icon]')
                if (iconBox) iconBox.style.transform = 'scale(1)'
              }}
            >
              <span
                data-nav-icon
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  background: active ? tint('var(--accent)', 18) : 'var(--surface-2)',
                  border: `1px solid ${active ? tint('var(--accent)', 28) : 'var(--border-light)'}`,
                  transition: 'transform var(--transition), background var(--transition)',
                }}
              >
                <Icon size={15} />
              </span>
              {!collapsed && <span style={{ flex: 1 }}>{p.label}</span>}
              {!collapsed && unread > 0 && (
                <span style={{
                  background: 'var(--danger)',
                  color: 'var(--on-accent)',
                  borderRadius: 100,
                  fontSize: 'var(--font-size-xs)',
                  fontWeight: 'var(--font-weight-bold)',
                  padding: '1px 6px',
                  minWidth: 18,
                  textAlign: 'center',
                }}
                >
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
              {collapsed && unread > 0 && (
                <span style={{
                  position: 'absolute', top: 8, right: 8,
                  width: 8, height: 8, borderRadius: '50%',
                  background: 'var(--danger)',
                  boxShadow: '0 0 0 2px var(--surface)',
                }}
                />
              )}
            </button>
          )
        })}
      </nav>

      {/* Collapse toggle */}
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        style={{
          position: 'absolute', top: '50%', right: -12,
          width: 24, height: 24, borderRadius: '50%',
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          color: 'var(--text-muted)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all var(--transition)', zIndex: 20,
          boxShadow: 'var(--shadow-sm)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--accent)'
          e.currentTarget.style.color = 'var(--on-accent)'
          e.currentTarget.style.borderColor = 'transparent'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'var(--surface-2)'
          e.currentTarget.style.color = 'var(--text-muted)'
          e.currentTarget.style.borderColor = 'var(--border)'
        }}
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>

      {/* User section */}
      <div style={{
        padding: collapsed ? 'var(--space-3) var(--space-2)' : 'var(--space-3) var(--space-4)',
        borderTop: '1px solid var(--border-light)',
        display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
        overflow: 'hidden',
      }}
      >
        <div
          style={{
            width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
            background: tint(color, 16), border: `1.5px solid ${tint(color, 38)}`,
            color, display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 11, fontWeight: 'var(--font-weight-bold)',
            cursor: 'pointer',
            transition: 'transform var(--transition)',
          }}
          onClick={() => navigate('/profile')}
          title="My Profile"
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.05)' }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
        >
          {initials}
        </div>
        {!collapsed && (
          <div style={{ flex: 1, overflow: 'hidden', cursor: 'pointer' }} onClick={() => navigate('/profile')}>
            <div style={{
              fontSize: 'var(--font-size-sm)',
              fontWeight: 'var(--font-weight-semibold)',
              color: 'var(--text)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            >
              {user?.name || 'User'}
            </div>
            <div style={{
              fontSize: 'var(--font-size-xs)',
              color: 'var(--text-dim)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            >
              {user?.employee_id || formatRole(role)}
            </div>
          </div>
        )}
        {!collapsed && (
          <button
            type="button"
            title="Sign out"
            onClick={handleLogout}
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              cursor: 'pointer',
              color: 'var(--text-dim)',
              padding: 6,
              borderRadius: 8,
              display: 'flex',
              transition: 'all var(--transition)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--danger)'
              e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--danger) 35%, transparent)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-dim)'
              e.currentTarget.style.borderColor = 'var(--border)'
            }}
          >
            <LogOut size={14} />
          </button>
        )}
      </div>
    </aside>
  )
}
