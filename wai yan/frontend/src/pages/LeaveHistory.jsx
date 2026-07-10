import { useEffect, useState } from 'react'
import { Download, Search, Clock, CalendarDays } from 'lucide-react'
import toast from 'react-hot-toast'
import { Card, Badge, Button, ConfirmDialog } from '../components/ui'
import { useAuth } from '../hooks/useAuth'
import * as leaveService from '../services/leaveService'
import * as dashboardService from '../services/dashboardService'
import { toBalance, toLeaveRows } from '../lib/adapters'

export default function LeaveHistory() {
  const { user } = useAuth()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [rows, setRows] = useState([])
  const [balance, setBalance] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [confirmState, setConfirmState] = useState(null)
  const [confirmLoading, setConfirmLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const params = {}
      if (statusFilter !== 'all') params.status = statusFilter
      if (typeFilter !== 'all') params.leave_type = typeFilter
      const [leaves, bal] = await Promise.all([
        leaveService.getMyLeaves(params),
        leaveService.getLeaveBalance().catch(() => null),
      ])
      setRows(toLeaveRows(leaves, user))
      if (bal) setBalance(toBalance(bal))
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load leave history')
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, typeFilter, user?.id])

  const filtered = rows.filter((r) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      (r.typeLabel || '').toLowerCase().includes(q) ||
      (r.remarks || '').toLowerCase().includes(q) ||
      (r.status || '').toLowerCase().includes(q)
    )
  })

  const stats = {
    approved: rows.filter((r) => r.status === 'approved').reduce((s, r) => s + r.days, 0),
    pending: rows.filter((r) => r.status === 'pending').length,
  }

  const exportCsv = async () => {
    try {
      await dashboardService.exportMyLeaveCsv()
      toast.success('CSV downloaded')
    } catch (e) {
      toast.error(e.message || 'Export failed')
    }
  }

  const closeConfirm = () => {
    if (confirmLoading) return
    setConfirmState(null)
  }

  const runConfirm = async () => {
    if (!confirmState?.run || confirmLoading) return
    setConfirmLoading(true)
    try {
      await confirmState.run()
      setConfirmState(null)
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Cancel failed')
    } finally {
      setConfirmLoading(false)
    }
  }

  const requestCancel = (row) => {
    const isPending = row.status === 'pending'
    setConfirmState({
      title: isPending ? 'Cancel this leave request?' : 'Request cancellation of this approved leave?',
      message: isPending
        ? 'This pending request will be cancelled immediately and cannot be easily undone.'
        : 'A cancellation request will be sent for approval. Your leave stays active until approved.',
      confirmLabel: isPending ? 'Cancel leave' : 'Request cancel',
      variant: 'danger',
      run: async () => {
        await leaveService.cancelLeave(row.id, 'Cancelled by employee')
        toast.success(isPending ? 'Cancelled' : 'Cancellation requested')
        load()
      },
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: 0 }}>My Leave History</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            All your leave requests for {balance?.year || new Date().getFullYear()}.
          </p>
        </div>
        <Button variant="secondary" size="md" style={{ gap: 8 }} onClick={exportCsv}>
          <Download size={14} /> Export CSV
        </Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        {[
          { label: 'Annual Remaining', value: balance ? `${balance.annual.remaining} days` : '—', color: 'var(--accent)', sub: balance ? `of ${balance.annual.total}` : '' },
          { label: 'Sick Remaining', value: balance ? `${balance.sick.remaining} days` : '—', color: 'var(--info)', sub: balance ? `of ${balance.sick.total}` : '' },
          { label: 'Total Days Used', value: `${stats.approved} days`, color: 'var(--success)', sub: 'approved in history' },
          { label: 'Pending Requests', value: stats.pending, color: 'var(--warning)', sub: 'awaiting approval' },
        ].map((s) => (
          <Card key={s.label}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color, marginBottom: 2 }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{s.sub}</div>
          </Card>
        ))}
      </div>

      <Card padding="12px 16px">
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '7px 12px', flex: 1, minWidth: 160 }}>
            <Search size={13} color="var(--text-muted)" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by type or remarks..."
              style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 13, flex: 1 }}
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '7px 12px', color: 'var(--text)', fontSize: 13, outline: 'none' }}
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '7px 12px', color: 'var(--text)', fontSize: 13, outline: 'none' }}
          >
            <option value="all">All types</option>
            <option value="annual">Annual Leave</option>
            <option value="sick">Sick Leave</option>
            <option value="unpaid">Unpaid Leave</option>
            <option value="other">Other</option>
          </select>
        </div>
      </Card>

      {loading && <div style={{ color: 'var(--text-muted)', padding: 24 }}>Loading…</div>}
      {error && !loading && (
        <Card style={{ color: 'var(--danger)' }}>{error} <Button size="xs" variant="secondary" onClick={load}>Retry</Button></Card>
      )}

      {!loading && !error && (
        <Card padding="0">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Type', 'Dates', 'Duration', 'Status', 'Submitted', 'Remarks', 'Actions'].map((h) => (
                  <th key={h} style={{
                    padding: '12px 16px', textAlign: 'left', fontSize: 10, fontWeight: 700,
                    color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em',
                    background: 'var(--surface-2)',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr
                  key={r.id}
                  style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--border-light)' : 'none' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-2)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <CalendarDays size={14} color="var(--text-muted)" />
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{r.typeLabel}</span>
                    </div>
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: 12, color: 'var(--text-muted)' }}>
                    {r.start === r.end ? r.start : `${r.start} → ${r.end}`}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{r.days}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 4 }}>{r.days === 1 ? 'day' : 'days'}</span>
                  </td>
                  <td style={{ padding: '14px 16px' }}><Badge status={r.status} /></td>
                  <td style={{ padding: '14px 16px', fontSize: 12, color: 'var(--text-muted)' }}>
                    {String(r.submittedAt).slice(0, 10)}
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: 12, color: 'var(--text-muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.remarks || '—'}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    {r.status === 'pending' && (
                      <Button variant="danger" size="xs" onClick={() => requestCancel(r)}>Cancel</Button>
                    )}
                    {(r.status === 'approved' || r.status === 'supervisor_approved') && (
                      <Button variant="warning" size="xs" onClick={() => requestCancel(r)}>Request Cancel</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
              <Clock size={32} color="var(--text-dim)" style={{ margin: '0 auto 12px' }} />
              <div style={{ fontSize: 14, fontWeight: 600 }}>No records found</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>Try adjusting your filters</div>
            </div>
          )}
        </Card>
      )}

      <ConfirmDialog
        open={Boolean(confirmState)}
        title={confirmState?.title}
        message={confirmState?.message}
        confirmLabel={confirmState?.confirmLabel}
        variant={confirmState?.variant || 'danger'}
        loading={confirmLoading}
        onCancel={closeConfirm}
        onConfirm={runConfirm}
      />
    </div>
  )
}
