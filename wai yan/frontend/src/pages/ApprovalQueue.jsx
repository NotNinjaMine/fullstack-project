import { useEffect, useState } from 'react'
import {
  Filter, Search, AlertTriangle, CheckCircle,
  XCircle, CheckSquare,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Card, Badge, Avatar, Button, RejectLeaveModal, ConfirmDialog } from '../components/ui'
import { useAuth } from '../hooks/useAuth'
import * as approvalService from '../services/approvalService'
import { toLeaveRows } from '../lib/adapters'

function ApprovalCard({ request, level, onApprove, onReject, selected, onSelect }) {
  return (
    <Card style={{
      marginBottom: 12,
      border: selected ? '1px solid var(--accent)' : '1px solid var(--border)',
      background: selected ? 'var(--accent-muted)' : 'var(--surface)',
      transition: 'all var(--transition)',
    }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <div
          onClick={onSelect}
          style={{
            width: 18, height: 18, borderRadius: 4, border: `2px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
            background: selected ? 'var(--accent)' : 'transparent', cursor: 'pointer', flexShrink: 0, marginTop: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {selected && <span style={{ color: 'var(--on-accent)', fontSize: 10, fontWeight: 700 }}>✓</span>}
        </div>

        <Avatar initials={request.avatar} color={request.avatarColor} size={40} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{request.employee}</span>
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }} className="mono">{request.employeeId}</span>
            <Badge status={request.type} />
            {request.overlap && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600, color: 'var(--warning)', background: 'var(--warning-muted)', padding: '2px 8px', borderRadius: 100 }}>
                <AlertTriangle size={10} /> Overlap
              </span>
            )}
            {request.specialApproval && (
              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--danger)', background: 'var(--danger-muted)', padding: '2px 8px', borderRadius: 100 }}>
                Special Approval
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>Date Range</div>
              <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600 }}>{request.start} → {request.end}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>Duration</div>
              <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600 }}>{request.days} {request.days === 1 ? 'day' : 'days'}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>Department</div>
              <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600 }}>{request.department || '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>Submitted</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{String(request.submittedAt).slice(0, 10)}</div>
            </div>
          </div>

          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>
              Remarks
            </div>
            <div style={{
              fontSize: 12,
              color: request.remarks?.trim() ? 'var(--text-muted)' : 'var(--text-dim)',
              lineHeight: 1.45,
              whiteSpace: 'pre-wrap',
            }}>
              {request.remarks?.trim() || 'No remarks provided'}
            </div>
          </div>

          {request.supervisorNote && level === 'manager' && (
            <div style={{ fontSize: 12, color: 'var(--info)', background: 'var(--info-muted)', border: '1px solid color-mix(in srgb, var(--info) 25%, transparent)', padding: '6px 10px', borderRadius: 6, marginBottom: 8 }}>
              <span style={{ fontWeight: 600 }}>Supervisor note: </span>{request.supervisorNote}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0, alignItems: 'flex-end' }}>
          <Button variant="success" size="sm" onClick={() => onApprove(request.id)} style={{ gap: 6, minWidth: 96 }}>
            <CheckCircle size={13} /> Approve
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => onReject(request)}
            style={{ gap: 6, minWidth: 96 }}
          >
            <XCircle size={13} /> Reject
          </Button>
        </div>
      </div>
    </Card>
  )
}

export default function ApprovalQueue() {
  const { user } = useAuth()
  const role = user?.role || 'employee'
  const [selected, setSelected] = useState([])
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rejectTarget, setRejectTarget] = useState(null)
  const [rejectLoading, setRejectLoading] = useState(false)
  const [confirmState, setConfirmState] = useState(null)
  const [confirmLoading, setConfirmLoading] = useState(false)

  const isHR = role === 'hr_admin'
  const isSupervisor = role === 'supervisor'
  const isManager = role === 'manager'

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await approvalService.getPendingApprovals()
      setRows(toLeaveRows(data, user))
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load approvals')
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  const filtered = rows.filter((r) => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false
    if (searchQuery && !r.employee.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  const toggleSelect = (id) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  const allSelected = filtered.length > 0 && filtered.every((r) => selected.includes(r.id))

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
      toast.error(err.response?.data?.message || err.message || 'Action failed')
    } finally {
      setConfirmLoading(false)
    }
  }

  const requestApprove = (id) => {
    setConfirmState({
      title: 'Approve this request?',
      message:
        "This will deduct the employee's leave balance and notify them.",
      confirmLabel: 'Approve',
      variant: 'success',
      run: async () => {
        await approvalService.approveRequest(id, '')
        toast.success('Approved')
        load()
      },
    })
  }

  const openReject = (request) => setRejectTarget(request)

  const bulk = (action) => {
    if (!selected.length) return
    const n = selected.length
    const noun = n === 1 ? 'request' : 'requests'

    if (action === 'reject') {
      setConfirmState({
        title: `Reject ${n} selected ${noun}?`,
        message:
          'You will enter a rejection reason next. This cannot be easily undone.',
        confirmLabel: 'Continue',
        variant: 'danger',
        run: async () => {
          const first = filtered.find((r) => selected.includes(r.id))
          if (first) setRejectTarget({ ...first, _bulkIds: [...selected] })
        },
      })
      return
    }

    setConfirmState({
      title: `Approve ${n} selected ${noun}?`,
      message:
        'Approved leave will deduct balances and notify employees. This is a high-impact bulk action.',
      confirmLabel: `Approve ${n}`,
      variant: 'success',
      run: async () => {
        await approvalService.bulkAction({
          action: 'approve',
          ids: selected,
          note: '',
        })
        toast.success(`Bulk approve complete`)
        setSelected([])
        load()
      },
    })
  }

  const confirmReject = async (note) => {
    if (!rejectTarget || !note?.trim()) return
    setRejectLoading(true)
    try {
      if (rejectTarget._bulkIds?.length) {
        await approvalService.bulkAction({
          action: 'reject',
          ids: rejectTarget._bulkIds,
          note: note.trim(),
        })
        toast.success(rejectTarget._bulkIds.length > 1 ? 'Bulk reject complete' : 'Rejected')
        setSelected([])
      } else {
        await approvalService.rejectRequest(rejectTarget.id, note.trim())
        toast.success('Rejected')
      }
      setRejectTarget(null)
      load()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Reject failed')
    } finally {
      setRejectLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Approval Queue</h1>
            {isSupervisor && (
              <span style={{ fontSize: 11, fontWeight: 700, background: 'var(--accent-muted)', color: 'var(--accent)', border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)', padding: '3px 10px', borderRadius: 100 }}>
                Level 1 — Supervisor Review
              </span>
            )}
            {isManager && (
              <span style={{ fontSize: 11, fontWeight: 700, background: 'var(--success-muted)', color: 'var(--success)', border: '1px solid color-mix(in srgb, var(--success) 30%, transparent)', padding: '3px 10px', borderRadius: 100 }}>
                Level 2 — Final Approval
              </span>
            )}
            {isHR && (
              <span style={{ fontSize: 11, fontWeight: 700, background: 'var(--pink-muted)', color: 'var(--pink)', border: '1px solid color-mix(in srgb, var(--pink) 30%, transparent)', padding: '3px 10px', borderRadius: 100 }}>
                HR Admin — Queue
              </span>
            )}
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
            {isSupervisor && 'Review and action leave requests from your direct reports.'}
            {isManager && 'Final approval required for supervisor-approved requests.'}
            {isHR && 'Full visibility across departments and regions.'}
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)' }}>{filtered.length}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>requests</div>
        </div>
      </div>

      <Card padding="14px 16px">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '7px 12px', flex: 1, minWidth: 180 }}>
            <Search size={13} color="var(--text-muted)" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search employees..."
              style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 13, flex: 1 }}
            />
          </div>

          {isHR && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '7px 12px', color: 'var(--text)', fontSize: 13, outline: 'none' }}
            >
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="supervisor_approved">Sup. Approved</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          )}

          <Button variant="secondary" size="sm" style={{ gap: 6 }} onClick={load}>
            <Filter size={12} /> Refresh
          </Button>

          <div style={{ width: 1, height: 24, background: 'var(--border)', flexShrink: 0 }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              onClick={() => setSelected(allSelected ? [] : filtered.map((r) => r.id))}
              style={{
                width: 18, height: 18, borderRadius: 4, border: `2px solid ${allSelected ? 'var(--accent)' : 'var(--border)'}`,
                background: allSelected ? 'var(--accent)' : 'transparent', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {allSelected && <span style={{ color: 'var(--on-accent)', fontSize: 10, fontWeight: 700 }}>✓</span>}
            </div>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {selected.length > 0 ? `${selected.length} selected` : 'Select all'}
            </span>
          </div>

          {selected.length > 0 && (
            <>
              <Button variant="success" size="sm" style={{ gap: 6 }} onClick={() => bulk('approve')}>
                <CheckCircle size={12} /> Approve {selected.length}
              </Button>
              <Button variant="danger" size="sm" style={{ gap: 6 }} onClick={() => bulk('reject')}>
                <XCircle size={12} /> Reject {selected.length}
              </Button>
            </>
          )}
        </div>
      </Card>

      {loading && <div style={{ color: 'var(--text-muted)' }}>Loading queue…</div>}
      {error && !loading && (
        <Card style={{ color: 'var(--danger)' }}>{error} <Button size="xs" variant="secondary" onClick={load}>Retry</Button></Card>
      )}

      {!loading && !error && (
        <div>
          {filtered.length === 0 ? (
            <Card style={{ textAlign: 'center', padding: '60px 24px' }}>
              <CheckSquare size={40} color="var(--text-dim)" style={{ margin: '0 auto 16px' }} />
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>All clear!</div>
              <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>No requests matching your filters.</div>
            </Card>
          ) : (
            filtered.map((r) => (
              <ApprovalCard
                key={r.id}
                request={r}
                level={isSupervisor ? 'supervisor' : 'manager'}
                selected={selected.includes(r.id)}
                onSelect={() => toggleSelect(r.id)}
                onApprove={requestApprove}
                onReject={openReject}
              />
            ))
          )}
        </div>
      )}

      <RejectLeaveModal
        open={Boolean(rejectTarget)}
        request={rejectTarget}
        loading={rejectLoading}
        onClose={() => { if (!rejectLoading) setRejectTarget(null) }}
        onConfirm={confirmReject}
      />

      <ConfirmDialog
        open={Boolean(confirmState)}
        title={confirmState?.title}
        message={confirmState?.message}
        confirmLabel={confirmState?.confirmLabel}
        variant={confirmState?.variant || 'default'}
        loading={confirmLoading}
        onCancel={closeConfirm}
        onConfirm={runConfirm}
      />
    </div>
  )
}
