import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Building2, Lock, Mail } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../hooks/useAuth'
import { Card, Button, Input } from '../components/ui'

/** Seeded demo accounts (password: Password123!) — from backend seed.js */
const DEMO_USERS = [
  { email: 'alice.tan@company.com', label: 'Employee', name: 'Alice Tan', color: 'var(--success)' },
  { email: 'bob.supervisor@company.com', label: 'Supervisor', name: 'Bob', color: 'var(--accent)' },
  { email: 'carol.manager@company.com', label: 'Manager', name: 'Carol', color: 'var(--warning)' },
  { email: 'hr.admin@company.com', label: 'HR Admin', name: 'HR', color: 'var(--secondary)' },
]

export default function LoginPage() {
  const { login, isAuthenticated, loading } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('alice.tan@company.com')
  const [password, setPassword] = useState('Password123!')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  if (!loading && isAuthenticated) {
    return <Navigate to="/" replace />
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      // AuthContext.login → authService.login → stores accessToken + user
      await login(email, password)
      toast.success('Welcome back')
      navigate('/')
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.response?.data?.code ||
        'Login failed'
      setError(msg)
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{
      minHeight: '100%',
      height: '100%',
      background: 'var(--bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
      position: 'relative',
      overflow: 'auto',
    }}>
      {/* Soft accent glow behind card */}
      <div style={{
        position: 'absolute',
        width: 480,
        height: 480,
        borderRadius: '50%',
        background: 'radial-gradient(circle, var(--accent-glow) 0%, transparent 70%)',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -55%)',
        pointerEvents: 'none',
      }} />

      <div style={{
        width: '100%',
        maxWidth: 920,
        position: 'relative',
        zIndex: 1,
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 24,
          alignItems: 'stretch',
        }}>
          {/* Left brand */}
          <Card style={{
            padding: 32,
            background: 'var(--accent-muted)',
            border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
            boxShadow: 'var(--shadow-accent)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: 360,
          }}>
            <div>
              <div style={{
                width: 48, height: 48, borderRadius: 12, marginBottom: 20,
                background: 'var(--accent-gradient)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: 'var(--shadow-accent)',
              }}>
                <Building2 size={22} color="var(--on-accent)" />
              </div>
              <div style={{
                fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 10,
              }}>
                Apex Global Solutions
              </div>
              <h1 style={{
                fontSize: 28, fontWeight: 800, color: 'var(--text)', margin: 0, lineHeight: 1.2,
              }}>
                <span className="gradient-text">LeaveFlow</span>
              </h1>
              <p style={{
                fontSize: 14, color: 'var(--text-muted)', marginTop: 12, lineHeight: 1.6, maxWidth: 320,
              }}>
                Multi-office leave management for ~60 staff across 10 APAC countries.
                Two-tier approvals, country holidays, and team coverage in one place.
              </p>
            </div>
            <ul style={{
              listStyle: 'none', padding: 0, margin: '28px 0 0',
              display: 'flex', flexDirection: 'column', gap: 10,
              fontSize: 13, color: 'var(--text-muted)',
            }}>
              {[
                'Supervisor → Manager approval workflow',
                'Public holidays by country (on-demand load)',
                'AI assistant optional · env-gated',
              ].map((t) => (
                <li key={t} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)',
                    marginTop: 6, flexShrink: 0,
                  }} />
                  {t}
                </li>
              ))}
            </ul>
          </Card>

          {/* Sign-in form */}
          <Card style={{ padding: 32, boxShadow: 'var(--shadow)' }}>
            <div style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', margin: 0 }}>
                Sign in
              </h2>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>
                Use your company email to access LeaveFlow.
              </p>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ position: 'relative' }}>
                <Input
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  autoComplete="username"
                />
                <Mail
                  size={14}
                  color="var(--text-dim)"
                  style={{ position: 'absolute', right: 12, bottom: 12, pointerEvents: 'none' }}
                />
              </div>

              <div style={{ position: 'relative' }}>
                <Input
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
                <Lock
                  size={14}
                  color="var(--text-dim)"
                  style={{ position: 'absolute', right: 12, bottom: 12, pointerEvents: 'none' }}
                />
              </div>

              {error && (
                <div style={{
                  background: 'var(--danger-muted)',
                  border: '1px solid color-mix(in srgb, var(--danger) 35%, transparent)',
                  color: 'var(--danger)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '10px 12px',
                  fontSize: 12,
                  fontWeight: 600,
                }}>
                  {error}
                </div>
              )}

              <Button
                type="submit"
                size="lg"
                disabled={submitting || loading}
                style={{ width: '100%', marginTop: 4 }}
              >
                {submitting ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>

            <div style={{
              marginTop: 28,
              paddingTop: 20,
              borderTop: '1px solid var(--border-light)',
            }}>
              <div style={{
                fontSize: 10, fontWeight: 700, color: 'var(--text-dim)',
                textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12,
              }}>
                Demo accounts · password Password123!
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {DEMO_USERS.map((u) => (
                  <button
                    key={u.email}
                    type="button"
                    onClick={() => {
                      setEmail(u.email)
                      setPassword('Password123!')
                      setError('')
                    }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '7px 12px',
                      borderRadius: 100,
                      border: '1px solid var(--border)',
                      background: email === u.email ? 'var(--accent-muted)' : 'var(--surface-2)',
                      color: 'var(--text)',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 600,
                      transition: 'all var(--transition)',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = u.color }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
                  >
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%', background: u.color, flexShrink: 0,
                    }} />
                    {u.label}
                  </button>
                ))}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
