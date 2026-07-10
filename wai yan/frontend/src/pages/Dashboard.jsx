import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CalendarDays, Clock, TrendingUp, Users, CheckSquare,
  AlertTriangle, PlusCircle, ChevronRight, Sparkles, ShieldCheck,
  Building2, Globe, Zap, Activity,
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  StatCard, Card, Badge, Avatar, Button, ProgressBar, SectionHeader,
  AiButton, AiReveal, ListRow, StatusPill, leaveTypeColor, RejectLeaveModal, ConfirmDialog,
} from '../components/ui'
import { useAuth } from '../hooks/useAuth'
import { PAGE_ROUTES } from '../utils/nav'
import { canAccessApprovals } from '../utils/constants'
import * as dashboardService from '../services/dashboardService'
import * as leaveService from '../services/leaveService'
import * as approvalService from '../services/approvalService'
import * as aiService from '../services/aiService'
import { toBalance, toLeaveRows, toOrgStats, toAwayPeople } from '../lib/adapters'

function BalanceCard({ label, used, remaining, total, color = 'var(--text-muted)', carry, size = 'md' }) {
  const isHero = size === 'hero'
  return (
    <StatCard
      size={size}
      color={color}
      icon={<CalendarDays size={isHero ? 26 : 18} />}
      label={label}
      value={remaining}
      sub={`${used} used · ${total} total${carry ? ` · +${carry} carried` : ''}`}
      footer={(
        <ProgressBar value={used} max={total || 1} color={color} height={isHero ? 7 : 5} />
      )}
    />
  )
}

function awayStatusPill(status) {
  const s = String(status || '').toLowerCase()
  if (s.includes('pending')) return { tone: 'warning', label: 'Pending' }
  // On leave / active are presence labels, not approval status — keep neutral
  if (s === 'approved' || s === 'on_leave' || s.includes('leave')) return { tone: 'muted', label: 'On Leave' }
  return { tone: 'muted', label: 'Active' }
}

function LoadingBlock({ label = 'Loading…' }) {
  return (
    <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>{label}</div>
  )
}

function ErrorBlock({ message, onRetry }) {
  return (
    <Card style={{ textAlign: 'center', padding: 32 }}>
      <div style={{ color: 'var(--danger)', fontWeight: 600, marginBottom: 8 }}>{message || 'Failed to load'}</div>
      {onRetry && <Button variant="secondary" size="sm" onClick={onRetry}>Retry</Button>}
    </Card>
  )
}

function EmployeeDashboard({
  setPage, user, balance, requests,
  aiText, aiLoading, aiError, onGetAiInsight,
  loading, error, onRetry, onCancel,
}) {
  const first = (user?.name || 'there').split(' ')[0]
  const showAiOutput = Boolean(aiText) || aiError
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }} className="animate-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>
            Good morning, {first}! 👋
          </h1>
          <p className="page-subtitle" style={{ marginTop: 'var(--space-2)', marginBottom: 0 }}>
            Here's your leave summary for {balance?.year || new Date().getFullYear()}.
          </p>
        </div>
        <Button onClick={() => setPage('apply')} size="md" style={{ gap: 8 }}>
          <PlusCircle size={15} /> Apply for Leave
        </Button>
      </div>

      {loading && <LoadingBlock label="Loading dashboard…" />}
      {error && !loading && <ErrorBlock message={error} onRetry={onRetry} />}

      {!loading && !error && balance && (
        <>
          {/* North-star: Annual Leave Remaining (hero) + supporting balances */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <BalanceCard
              size="hero"
              label="Annual Leave Remaining"
              used={balance.annual.used}
              remaining={balance.annual.remaining}
              total={balance.annual.total}
              color="var(--accent)"
              carry={balance.carriedForward || undefined}
            />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-4)' }}>
              <BalanceCard label="Sick Leave" used={balance.sick.used} remaining={balance.sick.remaining} total={balance.sick.total} color="var(--text-muted)" />
              <BalanceCard label="Unpaid Leave" used={balance.unpaid.used} remaining={balance.unpaid.remaining} total={balance.unpaid.total || 0} color="var(--text-dim)" />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 'var(--space-4)' }}>
            <Card style={{ background: 'var(--accent-muted)', border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                  background: 'var(--accent-gradient)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: 'var(--shadow-accent)',
                }}>
                  <Sparkles size={18} color="var(--on-accent)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                    AI Leave Assistant
                  </div>
                  {!showAiOutput && (
                    <AiButton loading={aiLoading} disabled={aiLoading} onClick={onGetAiInsight}>
                      {aiLoading ? 'Getting insight…' : 'Get AI Insight'}
                    </AiButton>
                  )}
                  {showAiOutput && (
                    <AiReveal>
                      {aiError ? (
                        <p style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5, margin: 0 }}>
                          AI insight unavailable
                        </p>
                      ) : (
                        <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, margin: 0 }}>
                          {aiText}
                        </p>
                      )}
                      {aiError && (
                        <div style={{ marginTop: 10 }}>
                          <AiButton loading={aiLoading} disabled={aiLoading} onClick={onGetAiInsight} size="xs">
                            {aiLoading ? 'Retrying…' : 'Retry'}
                          </AiButton>
                        </div>
                      )}
                    </AiReveal>
                  )}
                </div>
              </div>
            </Card>

            <Card>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14 }}>
                Quick Actions
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { icon: <PlusCircle size={14} />, label: 'Apply for Leave', page: 'apply', primary: true },
                  { icon: <Clock size={14} />, label: 'View Leave History', page: 'history', primary: false },
                  { icon: <CalendarDays size={14} />, label: 'Team Calendar', page: 'calendar', primary: false },
                ].map((a, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setPage(a.page)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', borderRadius: 'var(--radius-sm)',
                      background: 'var(--surface-2)', border: '1px solid var(--border)',
                      color: a.primary ? 'var(--accent)' : 'var(--text-muted)',
                      cursor: 'pointer', width: '100%', textAlign: 'left',
                      fontSize: 13, fontWeight: 500, transition: 'all var(--transition)',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-3)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'var(--surface-2)'}
                  >
                    {a.icon}
                    <span style={{ flex: 1, color: 'var(--text)' }}>{a.label}</span>
                    <ChevronRight size={12} color="var(--text-dim)" />
                  </button>
                ))}
              </div>
            </Card>
          </div>

          <Card>
            <SectionHeader
              title="My Leave Requests"
              subtitle="Recent submissions and their status"
              action={<Button variant="ghost" size="sm" onClick={() => setPage('history')}>View all →</Button>}
            />
            {requests.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-dim)', padding: '12px 4px' }}>No leave requests yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {requests.slice(0, 5).map((r, i, arr) => (
                  <ListRow key={r.id} accent={leaveTypeColor(r.type)} last={i === arr.length - 1}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                      background: 'var(--surface-2)', border: '1px solid var(--border-light)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <CalendarDays size={15} color={leaveTypeColor(r.type)} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{r.typeLabel}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                        {r.start} → {r.end} · {r.days} {r.days === 1 ? 'day' : 'days'}
                      </div>
                    </div>
                    <Badge status={r.status} />
                    {r.status === 'pending' && (
                      <Button variant="ghost" size="xs" style={{ fontSize: 11, color: 'var(--danger)' }} onClick={() => onCancel(r.id)}>
                        Cancel
                      </Button>
                    )}
                  </ListRow>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  )
}

function SupervisorDashboard({ setPage, pending, teamAway, summary, loading, error, onRetry, onApprove, onRejectClick }) {
  const pendingCount = pending.length
  const teamOnLeave = teamAway.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }} className="animate-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>Team Overview</h1>
          <p className="page-subtitle" style={{ marginTop: 'var(--space-2)', marginBottom: 0 }}>
            Direct reports · pending approvals
          </p>
        </div>
        <Button onClick={() => setPage('approvals')} style={{ gap: 8 }}>
          <CheckSquare size={15} /> Review Approvals
        </Button>
      </div>

      {loading && <LoadingBlock />}
      {error && !loading && <ErrorBlock message={error} onRetry={onRetry} />}

      {!loading && !error && (
        <>
          {/* North-star: Pending Approvals (hero) — size hierarchy, same metrics */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <StatCard
              size="hero"
              icon={<Clock size={26} />}
              label="Pending Approvals"
              value={pendingCount}
              color="var(--warning)"
              sub="Awaiting your review"
            />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-4)' }}>
              <StatCard icon={<Users size={18} />} label="Team On Leave" value={teamOnLeave} color="var(--text-muted)" sub="This week" />
              <StatCard icon={<TrendingUp size={18} />} label="High risk queue" value={summary?.high_risk_pending || 0} color="var(--danger)" sub="Needs attention" />
              <StatCard icon={<Activity size={18} />} label="Unread alerts" value={summary?.unread_notifications || 0} color="var(--text-muted)" sub="Notifications" />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 'var(--space-4)' }}>
            <Card>
              <SectionHeader
                title="Pending Approval Requests"
                subtitle="From your direct reports — requires your action"
                action={<Button variant="ghost" size="sm" onClick={() => setPage('approvals')}>View all →</Button>}
              />
              {pending.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--text-dim)', padding: 8 }}>All clear — nothing pending.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {pending.slice(0, 5).map((r, i, arr) => (
                    <ListRow key={r.id} accent={leaveTypeColor(r.type)} last={i === arr.length - 1}>
                      <Avatar initials={r.avatar} color={r.avatarColor} size={36} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{r.employee}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                          {r.typeLabel} · {r.start} → {r.end} · {r.days}d
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                        <Button variant="success" size="xs" onClick={() => onApprove(r.id)}>✓ Approve</Button>
                        <Button variant="danger" size="xs" onClick={() => onRejectClick(r)}>✕ Reject</Button>
                      </div>
                    </ListRow>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <SectionHeader title="Away this week" subtitle="Who's out" />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {teamAway.length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No one on leave this week.</div>
                )}
                {teamAway.map((m, i) => {
                  const pill = awayStatusPill(m.status)
                  return (
                    <ListRow
                      key={i}
                      accent={leaveTypeColor(m.type)}
                      last={i === teamAway.length - 1}
                      style={{ gap: 10, padding: '10px 10px 10px 12px' }}
                    >
                      <Avatar initials={m.avatar} color={m.avatarColor} size={30} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 12, fontWeight: 600, color: 'var(--text)',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>{m.employee}</div>
                        <div style={{
                          fontSize: 10, color: 'var(--text-muted)',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>{m.typeLabel} · {m.start}</div>
                      </div>
                      <StatusPill tone={pill.tone}>{pill.label}</StatusPill>
                    </ListRow>
                  )
                })}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

function ManagerDashboard({ setPage, pending, summary, loading, error, onRetry, onApprove, onRejectClick }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }} className="animate-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>Department Overview</h1>
          <p className="page-subtitle" style={{ marginTop: 'var(--space-2)', marginBottom: 0 }}>Final approvals · cross-team view</p>
        </div>
        <Button onClick={() => setPage('approvals')} style={{ gap: 8 }}>
          <ShieldCheck size={15} /> Final Approvals
        </Button>
      </div>

      {loading && <LoadingBlock />}
      {error && !loading && <ErrorBlock message={error} onRetry={onRetry} />}

      {!loading && !error && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <StatCard
              size="hero"
              icon={<CheckSquare size={26} />}
              label="Final Approvals Needed"
              value={pending.length}
              color="var(--warning)"
              sub="In your queue"
            />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-4)' }}>
              <StatCard icon={<Users size={18} />} label="High risk" value={summary?.high_risk_pending || 0} color="var(--danger)" sub="Flagged" />
              <StatCard icon={<TrendingUp size={18} />} label="Away this week" value={summary?.whos_away_this_week?.people?.length || 0} color="var(--text-muted)" sub="Staff" />
              <StatCard icon={<Globe size={18} />} label="Unread" value={summary?.unread_notifications || 0} color="var(--text-muted)" sub="Notifications" />
            </div>
          </div>

          <Card>
            <SectionHeader
              title="Awaiting Final Approval"
              subtitle="Needs your sign-off"
              action={<Button variant="ghost" size="sm" onClick={() => setPage('approvals')}>View all →</Button>}
            />
            {pending.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-dim)', padding: 8 }}>No final approvals waiting.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {pending.map((r, i, arr) => (
                  <ListRow key={r.id} accent={leaveTypeColor(r.type)} last={i === arr.length - 1}>
                    <Avatar initials={r.avatar} color={r.avatarColor} size={34} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{r.employee}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.typeLabel} · {r.days}d · {r.department}</div>
                      {r.overlap && <div style={{ fontSize: 10, color: 'var(--warning)', marginTop: 2 }}>⚠ Overlap flag</div>}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <Button variant="success" size="xs" onClick={() => onApprove(r.id)}>✓ Approve</Button>
                      <Button variant="danger" size="xs" onClick={() => onRejectClick(r)}>✕ Reject</Button>
                    </div>
                  </ListRow>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  )
}

function HRAdminDashboard({ setPage, org, summary, loading, error, onRetry }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }} className="animate-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>Organisation Overview</h1>
          <p className="page-subtitle" style={{ marginTop: 'var(--space-2)', marginBottom: 0 }}>
            {org?.companyName || 'Company'} · All regions
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="secondary" style={{ gap: 8 }} onClick={() => dashboardService.exportSummaryCsv().then(() => toast.success('Exported')).catch((e) => toast.error(e.message))}>
            <Building2 size={14} /> Export
          </Button>
          <Button onClick={() => setPage('admin')} style={{ gap: 8 }}>
            <Zap size={14} /> Admin Panel
          </Button>
        </div>
      </div>

      {loading && <LoadingBlock />}
      {error && !loading && <ErrorBlock message={error} onRetry={onRetry} />}

      {!loading && !error && org && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <StatCard
              size="hero"
              icon={<Clock size={26} />}
              label="Pending Approvals"
              value={org.pendingApprovals}
              color="var(--warning)"
              sub="Across all tiers"
            />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-4)' }}>
              <StatCard icon={<Users size={18} />} label="Total Employees" value={org.totalEmployees} color="var(--text-muted)" sub="Across offices" />
              <StatCard icon={<CalendarDays size={18} />} label="On Leave (week)" value={org.onLeaveToday} color="var(--text-muted)" sub="Who's away" />
              <StatCard icon={<TrendingUp size={18} />} label="Your approved" value={org.approvedThisMonth} color="var(--success)" sub="In your history counts" />
            </div>
          </div>

          <Card>
            <SectionHeader title="Country / Office Breakdown" subtitle="Staff by region" />
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Country', 'Employees'].map((h) => (
                    <th key={h} style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 0 10px', textAlign: 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(org.countries || []).filter((c) => c.employees > 0 || c.code).map((c) => (
                  <tr key={c.code} style={{ borderTop: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '10px 0', fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
                      <span style={{ marginRight: 6, fontSize: 11, color: 'var(--text-muted)' }} className="mono">{c.code}</span>
                      {c.country}
                    </td>
                    <td style={{ padding: '10px 0', fontSize: 13, color: 'var(--text-muted)' }}>{c.employees || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {summary?.high_risk_pending > 0 && (
            <Card style={{ border: '1px solid color-mix(in srgb, var(--warning) 30%, transparent)', background: 'var(--warning-muted)' }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <AlertTriangle size={20} color="var(--warning)" style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--warning)', marginBottom: 4 }}>
                    {summary.high_risk_pending} high-risk pending approval(s)
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                    Review the approval queue carefully for overlap and coverage flags.
                  </p>
                </div>
                <Button variant="warning" size="sm" style={{ flexShrink: 0 }} onClick={() => setPage('approvals')}>Review</Button>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const role = user?.role || 'employee'
  const setPage = (id) => navigate(PAGE_ROUTES[id] || '/')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState(null)
  const [balance, setBalance] = useState(null)
  const [requests, setRequests] = useState([])
  const [pending, setPending] = useState([])
  const [org, setOrg] = useState(null)
  const [aiText, setAiText] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState(false)
  const [tick, setTick] = useState(0)
  const [rejectTarget, setRejectTarget] = useState(null)
  const [rejectLoading, setRejectLoading] = useState(false)
  const [confirmState, setConfirmState] = useState(null)
  const [confirmLoading, setConfirmLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const sum = await dashboardService.getDashboardSummary()
      setSummary(sum)

      let balRaw = sum?.balance
      try {
        balRaw = await leaveService.getLeaveBalance()
      } catch {
        /* use summary.balance */
      }

      // AI is on-demand only — never call /api/ai on page load
      setBalance(toBalance(balRaw))

      if (role === 'employee' || !canAccessApprovals(role)) {
        const leaves = await leaveService.getMyLeaves()
        setRequests(toLeaveRows(leaves, user))
      }

      if (canAccessApprovals(role)) {
        try {
          const queue = await approvalService.getPendingApprovals()
          setPending(toLeaveRows(queue, user))
        } catch {
          setPending([])
        }
      }

      if (role === 'hr_admin') {
        try {
          const company = await dashboardService.getCompany()
          setOrg(toOrgStats(company, sum))
        } catch {
          setOrg(toOrgStats(sum?.company, sum))
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, role, tick])

  const onGetAiInsight = async () => {
    if (aiLoading) return
    setAiLoading(true)
    setAiError(false)
    try {
      const ai = await aiService.getBalanceSummary()
      const text = typeof ai === 'string' ? ai : (ai?.summary || ai?.text || ai?.message || null)
      if (text) {
        setAiText(text)
        setAiError(false)
      } else {
        setAiText('')
        setAiError(true)
      }
    } catch {
      setAiText('')
      setAiError(true)
    } finally {
      setAiLoading(false)
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
      toast.error(err.response?.data?.message || err.message || 'Action failed')
    } finally {
      setConfirmLoading(false)
    }
  }

  const onCancel = (id) => {
    setConfirmState({
      title: 'Cancel this leave request?',
      message: 'Pending leave will be cancelled immediately. This cannot be easily undone.',
      confirmLabel: 'Cancel leave',
      variant: 'danger',
      run: async () => {
        await leaveService.cancelLeave(id, 'Cancelled from dashboard')
        toast.success('Leave cancelled')
        setTick((t) => t + 1)
      },
    })
  }

  const onApprove = (id) => {
    setConfirmState({
      title: 'Approve this request?',
      message:
        "This will deduct the employee's leave balance and notify them.",
      confirmLabel: 'Approve',
      variant: 'success',
      run: async () => {
        await approvalService.approveRequest(id, '')
        toast.success('Approved')
        setTick((t) => t + 1)
      },
    })
  }

  const onRejectClick = (request) => setRejectTarget(request)

  const confirmReject = async (note) => {
    if (!rejectTarget?.id || !note?.trim()) return
    setRejectLoading(true)
    try {
      await approvalService.rejectRequest(rejectTarget.id, note.trim())
      toast.success('Rejected')
      setRejectTarget(null)
      setTick((t) => t + 1)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Reject failed')
    } finally {
      setRejectLoading(false)
    }
  }

  const awayRows = toAwayPeople(summary?.whos_away_this_week?.people || [])

  const shared = { setPage, loading, error, onRetry: () => setTick((t) => t + 1) }

  const dialogs = (
    <>
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
    </>
  )

  if (role === 'supervisor') {
    return (
      <>
        <SupervisorDashboard
          {...shared}
          pending={pending}
          teamAway={awayRows}
          summary={summary}
          onApprove={onApprove}
          onRejectClick={onRejectClick}
        />
        {dialogs}
      </>
    )
  }
  if (role === 'manager') {
    return (
      <>
        <ManagerDashboard
          {...shared}
          pending={pending}
          summary={summary}
          onApprove={onApprove}
          onRejectClick={onRejectClick}
        />
        {dialogs}
      </>
    )
  }
  if (role === 'hr_admin') {
    return (
      <>
        <HRAdminDashboard {...shared} org={org} summary={summary} />
        {dialogs}
      </>
    )
  }

  return (
    <>
      <EmployeeDashboard
        {...shared}
        user={user}
        balance={balance}
        requests={requests}
        aiText={aiText}
        aiLoading={aiLoading}
        aiError={aiError}
        onGetAiInsight={onGetAiInsight}
        onCancel={onCancel}
      />
      {dialogs}
    </>
  )
}
