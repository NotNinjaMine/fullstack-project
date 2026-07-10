import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, AlertTriangle, Info, Calendar } from 'lucide-react'
import toast from 'react-hot-toast'
import { Card, Button, Input, Select, Textarea, Toggle, SectionHeader, ProgressBar, AiButton, AiReveal } from '../components/ui'
import { useAuth } from '../hooks/useAuth'
import * as leaveService from '../services/leaveService'
import * as aiService from '../services/aiService'
import * as authService from '../services/authService'
import { toBalance, toProfile, TYPE_LABELS } from '../lib/adapters'

export default function ApplyLeave() {
  const { user, refreshUser } = useAuth()
  const navigate = useNavigate()
  const [profile, setProfile] = useState(() => toProfile(user))
  const [balance, setBalance] = useState(null)
  const [leaveType, setLeaveType] = useState('annual')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [halfDay, setHalfDay] = useState(false)
  const [halfDayPeriod, setHalfDayPeriod] = useState('AM')
  const [remarks, setRemarks] = useState('')
  const [applicantName, setApplicantName] = useState('')
  const [applicantJob, setApplicantJob] = useState('')
  const [applicantDept, setApplicantDept] = useState('')
  const [overlapInfo, setOverlapInfo] = useState(null)
  const [tips, setTips] = useState(null)
  const [tipsLoading, setTipsLoading] = useState(false)
  const [tipsError, setTipsError] = useState(false)
  const [remarkSuggestions, setRemarkSuggestions] = useState(null)
  const [improveLoading, setImproveLoading] = useState(false)
  const [improveError, setImproveError] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [daysHint, setDaysHint] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        let me = user
        try {
          me = await authService.getCurrentUser()
          if (!cancelled) setProfile(toProfile(me))
        } catch {
          if (!cancelled) setProfile(toProfile(user))
        }
        const p = toProfile(me || user)
        if (!cancelled && p) {
          setApplicantName(p.user)
          setApplicantJob(p.jobTitle)
          setApplicantDept(p.department)
        }
        try {
          const bal = await leaveService.getLeaveBalance()
          if (!cancelled) setBalance(toBalance(bal))
        } catch {
          if (!cancelled) setBalance(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [user])

  // Clear prior AI tips when form context changes (still on-demand only)
  useEffect(() => {
    setTips(null)
    setTipsError(false)
  }, [leaveType, startDate, endDate])

  useEffect(() => {
    if (!startDate || !endDate) {
      setOverlapInfo(null)
      setDaysHint(null)
      return
    }
    const t = setTimeout(async () => {
      try {
        const data = await leaveService.checkOverlap(startDate, halfDay ? startDate : endDate)
        // Map raw overlap payload → UI-only fields (not rendered as snake_case)
        setOverlapInfo({
          hasOverlap: Boolean(data?.overlap || data?.has_overlap || (data?.conflicts || []).length),
          message: data?.message || data?.detail || null,
          conflicts: data?.conflicts || data?.overlapping_members || [],
        })
        const days = data?.days_count ?? data?.working_days ?? data?.days
        if (days != null) setDaysHint(Number(days))
      } catch {
        setOverlapInfo(null)
      }
    }, 400)
    return () => clearTimeout(t)
  }, [startDate, endDate, halfDay])

  const leaveTypes = [
    { value: 'annual', label: 'Annual Leave', balance: balance?.annual?.remaining ?? null, color: 'var(--accent)' },
    { value: 'sick', label: 'Sick Leave', balance: balance?.sick?.remaining ?? null, color: 'var(--info)' },
    { value: 'unpaid', label: 'Unpaid Leave', balance: balance?.unpaid?.remaining ?? null, color: 'var(--text-muted)' },
    { value: 'other', label: 'Other', balance: null, color: 'var(--purple)' },
  ]
  const selectedType = leaveTypes.find((t) => t.value === leaveType) || leaveTypes[0]

  const clientDayCount = (() => {
    if (daysHint != null) return daysHint
    if (!startDate) return halfDay ? 0.5 : 0
    if (halfDay) return 0.5
    if (!endDate) return 1
    const start = new Date(startDate)
    const end = new Date(endDate)
    return Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1)
  })()

  const suggestTips = async () => {
    if (tipsLoading) return
    setTipsLoading(true)
    setTipsError(false)
    try {
      const res = await aiService.getLeaveTips({
        leave_type: leaveType,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      })
      const raw = res?.tips || res?.items || (Array.isArray(res) ? res : null)
      let list = null
      if (Array.isArray(raw)) {
        list = raw.map((t) => (typeof t === 'string' ? t : t?.text || t?.tip)).filter(Boolean)
      } else if (typeof raw === 'string' && raw.trim()) {
        list = raw.split(/\n+/).map((s) => s.replace(/^[-*•\d.)\s]+/, '').trim()).filter(Boolean)
      } else if (typeof res === 'string' && res.trim()) {
        list = [res.trim()]
      }
      if (list?.length) {
        setTips(list)
        setTipsError(false)
      } else {
        setTips(null)
        setTipsError(true)
      }
    } catch {
      setTips(null)
      setTipsError(true)
    } finally {
      setTipsLoading(false)
    }
  }

  const improveRemarks = async () => {
    if (!remarks.trim() || improveLoading) return
    setImproveLoading(true)
    setImproveError(false)
    setRemarkSuggestions(null)
    try {
      const res = await aiService.improveRemarks(remarks, {
        leaveType,
        startDate: startDate || undefined,
        endDate: halfDay ? startDate : (endDate || undefined),
        workingDays: clientDayCount || undefined,
        halfDay,
      })
      const raw = res?.suggestions ?? res?.remarks ?? null
      let list = []
      if (Array.isArray(raw)) {
        list = raw.map((s) => String(s || '').trim()).filter(Boolean)
      } else if (typeof raw === 'string' && raw.trim()) {
        list = [raw.trim()]
      } else if (typeof res === 'string' && res.trim()) {
        list = [res.trim()]
      }
      // Soft-fail when AI is off often echoes the original — treat as unavailable
      const original = remarks.trim()
      list = list.filter((s) => s && s !== original).slice(0, 3)
      if (list.length) {
        setRemarkSuggestions(list)
        setImproveError(false)
      } else {
        setImproveError(true)
      }
    } catch {
      setRemarkSuggestions(null)
      setImproveError(true)
    } finally {
      setImproveLoading(false)
    }
  }

  const acceptSuggestion = (text) => {
    if (text) setRemarks(text)
    setRemarkSuggestions(null)
    setImproveError(false)
  }

  const dismissImprovedRemarks = () => {
    setRemarkSuggestions(null)
    setImproveError(false)
  }

  const handleSubmit = async () => {
    if (!startDate || (!halfDay && !endDate)) {
      toast.error('Start and end dates are required')
      return
    }
    setSubmitting(true)
    try {
      await leaveService.applyLeave({
        leave_type: leaveType,
        start_date: startDate,
        end_date: halfDay ? startDate : endDate,
        half_day_flag: halfDay,
        half_day_period: halfDay ? halfDayPeriod : null,
        remarks,
        applicant_name_override: applicantName || undefined,
        applicant_department_override: applicantDept || undefined,
        applicant_job_title_override: applicantJob || undefined,
      })
      toast.success('Leave request submitted')
      try { await refreshUser?.() } catch { /* ignore */ }
      navigate('/leave')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Submit failed')
    } finally {
      setSubmitting(false)
    }
  }

  const balSlice = balance?.[leaveType]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Apply for Leave</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
          Submit a leave request. Two-tier approval required (Supervisor → Manager).
        </p>
      </div>

      {loading && <div style={{ color: 'var(--text-muted)' }}>Loading profile & balance…</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card>
            <SectionHeader title="Applicant Details" subtitle="Pre-filled from your profile — editable" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Input label="Full Name" value={applicantName} onChange={(e) => setApplicantName(e.target.value)} note="Editable" />
              <Input label="Employee ID" value={profile?.employeeId || ''} disabled />
              <Input label="Job Title" value={applicantJob} onChange={(e) => setApplicantJob(e.target.value)} note="Editable" />
              <Input label="Department" value={applicantDept} onChange={(e) => setApplicantDept(e.target.value)} note="Editable" />
              <Input label="Office Branch" value={profile?.branch || ''} disabled />
              <Input label="Country" value={profile?.country || ''} disabled />
            </div>
          </Card>

          <Card>
            <SectionHeader title="Leave Details" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Select label="Leave Type" value={leaveType} onChange={(e) => setLeaveType(e.target.value)} required>
                {leaveTypes.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </Select>

              {selectedType.balance !== null && balSlice && (
                <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '12px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{selectedType.label} Balance</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: selectedType.color }}>{selectedType.balance} days remaining</span>
                  </div>
                  <ProgressBar value={balSlice.used || 0} max={balSlice.total || 1} color={selectedType.color} height={4} />
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <Input
                  label="Start Date"
                  type="date"
                  value={startDate}
                  onChange={(e) => { setStartDate(e.target.value); if (halfDay) setEndDate(e.target.value) }}
                  required
                />
                <Input
                  label="End Date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  disabled={halfDay}
                  required
                  note={halfDay ? 'Same as start date for half-day' : ''}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', padding: '12px 14px', border: '1px solid var(--border)' }}>
                <Toggle
                  checked={halfDay}
                  onChange={(v) => { setHalfDay(v); if (v) setEndDate(startDate) }}
                  label="Half-day request"
                />
                {halfDay && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    {['AM', 'PM'].map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setHalfDayPeriod(p)}
                        style={{
                          padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none',
                          background: halfDayPeriod === p ? 'var(--accent)' : 'var(--surface-3)',
                          color: halfDayPeriod === p ? 'var(--on-accent)' : 'var(--text-muted)',
                        }}
                      >{p}</button>
                    ))}
                  </div>
                )}
              </div>

              <div style={{
                background: 'var(--accent-muted)', border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
                borderRadius: 'var(--radius-sm)', padding: '12px 14px',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <Calendar size={16} color="var(--accent)" />
                <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>
                  {clientDayCount} working {clientDayCount === 1 ? 'day' : 'days'}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  ({startDate || '—'} → {halfDay ? startDate : (endDate || '—')}), weekends & holidays excluded by server
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                    Remarks
                  </label>
                  <AiButton
                    size="xs"
                    loading={improveLoading}
                    disabled={improveLoading || !remarks.trim()}
                    onClick={improveRemarks}
                  >
                    {improveLoading ? 'Improving…' : 'Improve'}
                  </AiButton>
                </div>
                <Textarea
                  value={remarks}
                  onChange={(e) => {
                    setRemarks(e.target.value)
                    if (remarkSuggestions) setRemarkSuggestions(null)
                    if (improveError) setImproveError(false)
                  }}
                  placeholder="Add context for your supervisor (optional but recommended)..."
                  rows={3}
                />
                {improveError && !remarkSuggestions && (
                  <AiReveal>
                    <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: 0 }}>AI insight unavailable</p>
                  </AiReveal>
                )}
                {remarkSuggestions?.length > 0 && (
                  <AiReveal>
                    <div style={{
                      background: 'var(--accent-muted)',
                      border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '12px 14px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          Suggested remarks
                        </div>
                        <Button size="xs" variant="secondary" onClick={dismissImprovedRemarks}>Dismiss</Button>
                      </div>
                      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {remarkSuggestions.map((s, i) => (
                          <li key={i}>
                            <button
                              type="button"
                              onClick={() => acceptSuggestion(s)}
                              style={{
                                width: '100%',
                                textAlign: 'left',
                                fontSize: 13,
                                color: 'var(--text)',
                                lineHeight: 1.55,
                                margin: 0,
                                padding: '8px 10px',
                                whiteSpace: 'pre-wrap',
                                background: 'var(--surface, rgba(255,255,255,0.04))',
                                border: '1px solid color-mix(in srgb, var(--accent) 22%, transparent)',
                                borderRadius: 'var(--radius-sm)',
                                cursor: 'pointer',
                              }}
                            >
                              {s}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </AiReveal>
                )}
              </div>
            </div>
          </Card>

          {overlapInfo?.hasOverlap && (
            <div style={{ background: 'var(--warning-muted)', border: '1px solid color-mix(in srgb, var(--warning) 30%, transparent)', borderRadius: 'var(--radius)', padding: '16px 20px', display: 'flex', gap: 12 }}>
              <AlertTriangle size={18} color="var(--warning)" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--warning)', marginBottom: 4 }}>Overlap Detected</div>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                  {overlapInfo.message || 'Team members are already on leave during your requested period. Your request may be flagged for special approval.'}
                </p>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 12 }}>
            <Button size="lg" style={{ flex: 1 }} onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit Leave Request'}
            </Button>
            <Button variant="secondary" size="lg" onClick={() => navigate('/')}>Cancel</Button>
          </div>

          <p style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'center' }}>
            By submitting, you confirm the details are accurate. Leave type cannot be changed after submission.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card style={{
            background: 'var(--accent-muted)',
            border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 9, flexShrink: 0,
                background: 'var(--accent-gradient)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: 'var(--shadow-accent)',
              }}>
                <Sparkles size={16} color="var(--on-accent)" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>AI Leave Assistant</div>
                <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                  Tips for your {TYPE_LABELS[leaveType] || selectedType.label}
                </div>
              </div>
            </div>
            <AiButton loading={tipsLoading} disabled={tipsLoading} onClick={suggestTips}>
              {tipsLoading ? 'Suggesting…' : 'Suggest tips'}
            </AiButton>
            {tipsError && !tips && (
              <AiReveal style={{ marginTop: 12 }}>
                <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: 0 }}>AI insight unavailable</p>
              </AiReveal>
            )}
            {tips?.length > 0 && (
              <AiReveal style={{ marginTop: 14 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {tips.map((tip, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0, marginTop: 6 }} />
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.55 }}>{tip}</p>
                    </div>
                  ))}
                </div>
              </AiReveal>
            )}
          </Card>

          <Card>
            <SectionHeader title="Approval Workflow" subtitle="Two-tier approval required" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {[
                { step: 1, label: 'You Submit', desc: 'Request enters pending state', active: true },
                { step: 2, label: 'Supervisor Review', desc: profile?.supervisor || 'Direct supervisor', active: false },
                { step: 3, label: 'Manager Approval', desc: profile?.manager || 'Final approval', active: false },
                { step: 4, label: 'Balance Updated', desc: 'Leave balance deducted on final approval', active: false },
              ].map((s, i) => (
                <div key={s.step} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', position: 'relative' }}>
                  {i < 3 && (
                    <div style={{ position: 'absolute', left: 14, top: 28, width: 1, height: 26, background: 'var(--border)' }} />
                  )}
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    background: s.active ? 'var(--accent)' : 'var(--surface-2)',
                    border: `2px solid ${s.active ? 'var(--accent)' : 'var(--border)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 700,
                    color: s.active ? 'var(--on-accent)' : 'var(--text-dim)',
                  }}>
                    {s.step}
                  </div>
                  <div style={{ paddingBottom: 20 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: s.active ? 'var(--accent)' : 'var(--text)' }}>{s.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{s.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card style={{ background: 'var(--surface-2)', border: '1px solid var(--border-light)' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <Info size={14} color="var(--info)" style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                <strong style={{ color: 'var(--text)' }}>Policy reminders:</strong> Half-day = single calendar day only.
                Leave type is immutable after submission. Day counts come from the server (weekends/holidays excluded).
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
