import { useEffect, useState } from 'react'
import { Mail, Phone, MapPin, Briefcase, Calendar, Shield, Edit3, Key, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import { Card, Button, Input, ProgressBar, SectionHeader } from '../components/ui'
import { useAuth } from '../hooks/useAuth'
import * as authService from '../services/authService'
import * as leaveService from '../services/leaveService'
import { toBalance, toProfile } from '../lib/adapters'

export default function Profile() {
  const { user, refreshUser } = useAuth()
  const [config, setConfig] = useState(() => toProfile(user))
  const [balance, setBalance] = useState(null)
  const [editing, setEditing] = useState(false)
  const [phone, setPhone] = useState(config?.phone || '')
  const [address, setAddress] = useState(config?.address || '')
  const [pwTab, setPwTab] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const me = await authService.getCurrentUser()
        const p = toProfile(me)
        if (!cancelled) {
          setConfig(p)
          setPhone(p.phone || '')
          setAddress(p.address || '')
        }
        try {
          const bal = await leaveService.getLeaveBalance()
          if (!cancelled) setBalance(toBalance(bal))
        } catch {
          if (!cancelled) setBalance(null)
        }
      } catch {
        if (!cancelled) setConfig(toProfile(user))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [user])

  const save = async () => {
    setSaving(true)
    try {
      await authService.updateProfile({ phone, personal_address: address, address })
      await refreshUser?.()
      toast.success('Profile saved')
      setEditing(false)
      const me = await authService.getCurrentUser()
      setConfig(toProfile(me))
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading || !config) {
    return <div style={{ color: 'var(--text-muted)', padding: 24 }}>Loading profile…</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: 0 }}>My Profile</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>Manage your personal information and preferences.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card style={{ textAlign: 'center', padding: '32px 20px' }}>
            <div style={{
              width: 80, height: 80, borderRadius: '50%', margin: '0 auto 16px',
              background: `${config.avatarColor}22`, border: `3px solid ${config.avatarColor}55`,
              color: config.avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 28, fontWeight: 800,
            }}>
              {config.avatar}
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', margin: '0 0 4px' }}>{config.user}</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 12px' }}>{config.jobTitle}</p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{
                background: `${config.avatarColor}18`, color: config.avatarColor,
                border: `1px solid ${config.avatarColor}33`, padding: '3px 10px',
                borderRadius: 100, fontSize: 11, fontWeight: 700,
              }}>
                {config.label}
              </span>
              <span style={{ background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border)', padding: '3px 10px', borderRadius: 100, fontSize: 11 }}>
                {config.country}
              </span>
            </div>
          </Card>

          <Card>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { icon: <Mail size={13} />, label: config.email },
                { icon: <Phone size={13} />, label: phone || '—' },
                { icon: <Briefcase size={13} />, label: config.department },
                { icon: <MapPin size={13} />, label: config.branch },
                { icon: <Calendar size={13} />, label: config.joinDate ? `Joined ${config.joinDate}` : 'Join date N/A' },
                { icon: <Shield size={13} />, label: config.employeeId },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, color: 'var(--text-muted)' }}>
                  <div style={{ flexShrink: 0, marginTop: 1, color: 'var(--text-dim)' }}>{item.icon}</div>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', wordBreak: 'break-all' }}>{item.label}</span>
                </div>
              ))}
            </div>
          </Card>

          {(config.supervisorId || config.managerId) && (
            <Card>
              <SectionHeader title="Reporting Line" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {config.supervisorId && (
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Direct Supervisor</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                      {config.supervisor || `User #${config.supervisorId}`}
                    </div>
                  </div>
                )}
                {config.managerId && (
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Manager</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                      {config.manager || `User #${config.managerId}`}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {balance && (
            <Card>
              <SectionHeader title={`Leave Balance ${balance.year || ''}`} subtitle="Current entitlements and usage" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                {[
                  { label: 'Annual Leave', used: balance.annual.used, total: balance.annual.total, remaining: balance.annual.remaining, color: 'var(--accent)' },
                  { label: 'Sick Leave', used: balance.sick.used, total: balance.sick.total, remaining: balance.sick.remaining, color: 'var(--info)' },
                  { label: 'Unpaid Leave', used: balance.unpaid.used, total: balance.unpaid.total, remaining: balance.unpaid.remaining, color: 'var(--text-dim)' },
                ].map((b) => (
                  <div key={b.label} style={{ background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', padding: '14px 16px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>{b.label}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: b.color, marginBottom: 4 }}>{b.remaining}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 10 }}>of {b.total} days remaining</div>
                    <ProgressBar value={b.used} max={b.total || 1} color={b.color} height={4} />
                    <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 6 }}>{b.used} used</div>
                  </div>
                ))}
              </div>
              {balance.carriedForward > 0 && (
                <div style={{ marginTop: 14, padding: '10px 14px', background: 'var(--success-muted)', border: '1px solid color-mix(in srgb, var(--success) 20%, transparent)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--success)' }}>
                  +{balance.carriedForward} annual leave days carried forward
                </div>
              )}
            </Card>
          )}

          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Personal Information</h2>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Editable fields: phone and address</p>
              </div>
              <Button
                variant={editing ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => (editing ? save() : setEditing(true))}
                disabled={saving}
                style={{ gap: 6 }}
              >
                {editing ? <><Save size={13} /> {saving ? 'Saving…' : 'Save Changes'}</> : <><Edit3 size={13} /> Edit Profile</>}
              </Button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Input label="Full Name" value={config.user} disabled />
              <Input label="Employee ID" value={config.employeeId} disabled />
              <Input label="Job Title" value={config.jobTitle} disabled />
              <Input label="Department" value={config.department} disabled />
              <Input label="Email Address" type="email" value={config.email} disabled />
              <Input
                label="Phone Number"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={!editing}
                note={editing ? 'You can update your phone number' : ''}
              />
              <Input label="Date of Birth" type="date" value={config.dob || ''} disabled />
              <Input label="Join Date" type="date" value={config.joinDate || ''} disabled />
            </div>

            <div style={{ marginTop: 16 }}>
              <Input
                label="Home Address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                disabled={!editing}
                note={editing ? 'You can update your address' : ''}
              />
            </div>
          </Card>

          <Card>
            <div
              onClick={() => setPwTab(!pwTab)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--warning-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Key size={15} color="var(--warning)" />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Change Password</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Not exposed by API in this build</div>
                </div>
              </div>
              <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>{pwTab ? '▲' : '▼'}</span>
            </div>

            {pwTab && (
              <div style={{ marginTop: 16, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Password change is not available through a public endpoint in the current Grok backend.
                Demo accounts use <span className="mono">Password123!</span>. Contact HR/admin to reset production passwords.
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
