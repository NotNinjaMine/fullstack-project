import { useEffect, useState } from 'react'
import { Shield, Download, Globe, FileText, AlertCircle, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { Card, Button, Input, Select, SectionHeader, ConfirmDialog } from '../components/ui'
import * as dashboardService from '../services/dashboardService'
import * as adminService from '../services/adminService'
import { toOrgStats } from '../lib/adapters'

const TABS = [
  { id: 'overview', label: 'Company Overview', icon: FileText },
  { id: 'holidays', label: 'Holiday Loader', icon: Globe },
  { id: 'export', label: 'Data Export', icon: Download },
]

function OverviewTab({ org, loading }) {
  if (loading) return <div style={{ color: 'var(--text-muted)' }}>Loading company…</div>
  if (!org) return <Card>No company data.</Card>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <SectionHeader title={org.companyName || 'Company'} subtitle="Organisation snapshot from /api/dashboard/company" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase' }}>Staff</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)' }}>{org.totalEmployees}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase' }}>Pending approvals</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--warning)' }}>{org.pendingApprovals}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase' }}>Away this week</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--info)' }}>{org.onLeaveToday}</div>
          </div>
        </div>
      </Card>

      <Card>
        <SectionHeader title="Offices / countries" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
          {(org.countries || []).map((c) => (
            <div key={c.code} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '12px 14px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-dim)' }} className="mono">{c.code}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{c.country}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{c.employees || 0} staff</div>
            </div>
          ))}
        </div>
      </Card>

      <Card style={{ border: '1px solid color-mix(in srgb, var(--info) 20%, transparent)', background: 'var(--info-muted)' }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <AlertCircle size={16} color="var(--info)" style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--info)' }}>Audit log:</strong> The backend writes audit rows internally
            but does not expose a list endpoint. Use CSV exports below for leave/approvals history.
          </div>
        </div>
      </Card>
    </div>
  )
}

function HolidayLoaderTab() {
  const [country, setCountry] = useState('SG')
  const [yearFrom, setYearFrom] = useState(String(new Date().getFullYear()))
  const [yearTo, setYearTo] = useState(String(new Date().getFullYear() + 1))
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const handleLoad = async () => {
    setLoading(true)
    setResult(null)
    try {
      const data = await adminService.loadHolidays({
        country_code: country,
        year_from: yearFrom,
        year_to: yearTo,
      })
      setResult(data)
      toast.success('Holiday load complete')
      setConfirmOpen(false)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Holiday load failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Card>
        <SectionHeader
          title="Bulk Holiday Loader"
          subtitle="POST /api/admin/holidays/load — caches public holidays for a country/year range"
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 14, alignItems: 'end' }}>
          <Select label="Country" value={country} onChange={(e) => setCountry(e.target.value)}>
            {['SG', 'TH', 'MY', 'JP', 'ID', 'VN', 'MM', 'PH', 'NZ', 'CN'].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
          <Input label="Year From" type="number" value={yearFrom} onChange={(e) => setYearFrom(e.target.value)} />
          <Input label="Year To" type="number" value={yearTo} onChange={(e) => setYearTo(e.target.value)} />
          <Button onClick={() => setConfirmOpen(true)} disabled={loading} size="md">
            {loading ? 'Loading...' : <><Globe size={14} /> Load</>}
          </Button>
        </div>

        {result && (
          <div style={{ marginTop: 14, padding: '12px 14px', background: 'var(--success-muted)', border: '1px solid color-mix(in srgb, var(--success) 30%, transparent)', borderRadius: 'var(--radius-sm)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <CheckCircle size={16} color="var(--success)" style={{ marginTop: 2 }} />
            <pre style={{ margin: 0, fontSize: 11, color: 'var(--success)', fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'pre-wrap' }}>
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        title="Load public holidays?"
        message={`This will bulk-load holidays for ${country} from ${yearFrom} to ${yearTo}. Existing cache for that range may be updated.`}
        confirmLabel="Load holidays"
        variant="danger"
        loading={loading}
        onCancel={() => { if (!loading) setConfirmOpen(false) }}
        onConfirm={handleLoad}
      />

      <Card>
        <SectionHeader title="Supported countries" subtitle="Seeded office codes" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
          {['SG', 'TH', 'MY', 'JP', 'ID', 'VN', 'MM', 'PH', 'NZ', 'CN'].map((c) => (
            <div key={c} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)' }}>{c}</div>
              <div style={{ fontSize: 9, color: 'var(--success)', marginTop: 2 }}>Supported</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

function ExportTab({ org }) {
  const run = async (fn, label) => {
    try {
      await fn()
      toast.success(`${label} downloaded`)
    } catch (e) {
      toast.error(e.message || 'Export failed')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <SectionHeader title="Data Export" subtitle="CSV downloads (auth token required)" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { label: 'My leave history', fn: () => dashboardService.exportMyLeaveCsv() },
            { label: 'Approvals export', fn: () => dashboardService.exportApprovalsCsv() },
            { label: 'Dashboard summary', fn: () => dashboardService.exportSummaryCsv() },
            { label: "Who's away", fn: () => dashboardService.exportWhosAwayCsv() },
          ].map((q) => (
            <div key={q.label} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
              <div style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{q.label}</div>
              <Button variant="ghost" size="sm" style={{ gap: 6 }} onClick={() => run(q.fn, q.label)}>
                <Download size={12} /> Download
              </Button>
            </div>
          ))}
        </div>
        {org && (
          <div style={{ marginTop: 14, fontSize: 12, color: 'var(--text-dim)' }}>
            Company staff count (overview): <strong style={{ color: 'var(--text)' }}>{org.totalEmployees}</strong>
          </div>
        )}
      </Card>
    </div>
  )
}

export default function AdminPanel() {
  const [tab, setTab] = useState('overview')
  const [org, setOrg] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const [company, summary] = await Promise.all([
          dashboardService.getCompany(),
          dashboardService.getDashboardSummary().catch(() => null),
        ])
        if (!cancelled) setOrg(toOrgStats(company, summary))
      } catch {
        if (!cancelled) setOrg(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--pink-muted)', border: '1px solid color-mix(in srgb, var(--pink) 30%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Shield size={18} color="var(--pink)" />
        </div>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Admin Panel</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>HR Admin · company overview, holidays, exports</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 4, width: 'fit-content' }}>
        {TABS.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px',
                borderRadius: 'calc(var(--radius-sm) - 2px)', border: 'none', cursor: 'pointer',
                background: tab === t.id ? 'var(--accent)' : 'transparent',
                color: tab === t.id ? 'var(--on-accent)' : 'var(--text-muted)',
                fontSize: 13, fontWeight: tab === t.id ? 600 : 400,
              }}
            >
              <Icon size={13} />
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'overview' && <OverviewTab org={org} loading={loading} />}
      {tab === 'holidays' && <HolidayLoaderTab />}
      {tab === 'export' && <ExportTab org={org} />}
    </div>
  )
}
