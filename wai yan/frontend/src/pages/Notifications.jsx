import { useState } from 'react'
import { CheckCircle, Clock, FileText, XCircle, AlertTriangle, RefreshCw, Bell } from 'lucide-react'
import toast from 'react-hot-toast'
import { Card, Button } from '../components/ui'
import { useNotifications } from '../hooks/useNotifications'
import { toNotifications } from '../lib/adapters'

const NOTIF_CONFIG = {
  approved: { icon: CheckCircle, color: 'var(--success)', bg: 'var(--success-muted)' },
  rejected: { icon: XCircle, color: 'var(--danger)', bg: 'var(--danger-muted)' },
  submitted: { icon: FileText, color: 'var(--accent)', bg: 'var(--accent-muted)' },
  leave_submitted: { icon: FileText, color: 'var(--accent)', bg: 'var(--accent-muted)' },
  reminder: { icon: Clock, color: 'var(--warning)', bg: 'var(--warning-muted)' },
  overlap: { icon: AlertTriangle, color: 'var(--warning)', bg: 'var(--warning-muted)' },
  cancel: { icon: RefreshCw, color: 'var(--info)', bg: 'var(--info-muted)' },
  cancelled: { icon: RefreshCw, color: 'var(--info)', bg: 'var(--info-muted)' },
}

export default function Notifications() {
  const {
    notifications: raw,
    unreadCount,
    loading,
    markRead,
    markAllRead,
    fetchNotifications,
  } = useNotifications()

  const [filter, setFilter] = useState('all')
  const notifs = toNotifications(raw)
  const visible = filter === 'unread' ? notifs.filter((n) => !n.read) : notifs

  const onMarkRead = async (id) => {
    try {
      await markRead(id)
    } catch {
      toast.error('Could not mark as read')
    }
  }

  const onMarkAll = async () => {
    try {
      await markAllRead()
      toast.success('All marked read')
    } catch {
      toast.error('Could not mark all read')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Notifications</h1>
            {unreadCount > 0 && (
              <span style={{ background: 'var(--danger)', color: 'var(--on-accent)', borderRadius: 100, fontSize: 11, fontWeight: 700, padding: '2px 8px' }}>
                {unreadCount} unread
              </span>
            )}
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Stay updated on leave requests and approvals.</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ display: 'flex', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
            {['all', 'unread'].map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                style={{
                  padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none',
                  background: filter === f ? 'var(--accent)' : 'transparent',
                  color: filter === f ? 'var(--on-accent)' : 'var(--text-muted)',
                  textTransform: 'capitalize',
                }}
              >
                {f}
              </button>
            ))}
          </div>
          <Button variant="secondary" size="sm" onClick={() => fetchNotifications()}>Refresh</Button>
          {unreadCount > 0 && (
            <Button variant="secondary" size="sm" onClick={onMarkAll}>Mark all read</Button>
          )}
        </div>
      </div>

      {loading && <div style={{ color: 'var(--text-muted)' }}>Loading…</div>}

      {!loading && visible.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: '60px 24px' }}>
          <Bell size={40} color="var(--text-dim)" style={{ margin: '0 auto 16px' }} />
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>All caught up!</div>
          <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>No {filter === 'unread' ? 'unread' : ''} notifications.</div>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visible.map((n) => {
            const config = NOTIF_CONFIG[n.type] || NOTIF_CONFIG.submitted
            const Icon = config.icon
            return (
              <div
                key={n.id}
                onClick={() => { if (!n.read) onMarkRead(n.id) }}
                style={{
                  display: 'flex', gap: 14, padding: '16px 20px',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderLeft: n.read ? '3px solid var(--border)' : `3px solid ${config.color}`,
                  borderRadius: 'var(--radius)',
                  cursor: 'pointer',
                  opacity: n.read ? 0.75 : 1,
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-2)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'var(--surface)'}
              >
                <div style={{
                  width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                  background: config.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={16} color={config.color} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{n.title}</span>
                    {!n.read && <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)' }} />}
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>{n.message}</p>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', flexShrink: 0, marginTop: 2, whiteSpace: 'nowrap' }}>{n.time}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
