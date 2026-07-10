import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Card, Badge, Avatar, SectionHeader } from '../components/ui'
import { useAuth } from '../hooks/useAuth'
import * as dashboardService from '../services/dashboardService'
import * as approvalService from '../services/approvalService'
import { canAccessApprovals } from '../utils/constants'
import { toCalendarFromWhosAway } from '../lib/adapters'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function buildMonthGrid(year, month) {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = Array(firstDay).fill(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

function pad(n) { return n < 10 ? `0${n}` : `${n}` }

function CalendarCell({ day, year, month, eventsByDate, onClick, selected }) {
  if (!day) return <div style={{ minHeight: 90, background: 'var(--surface-3)', borderRadius: 'var(--radius-sm)' }} />

  const dateStr = `${year}-${pad(month + 1)}-${pad(day)}`
  const events = eventsByDate[dateStr] || []
  const today = new Date()
  const isToday = dateStr === `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
  const dow = new Date(year, month, day).getDay()
  const isWeekend = dow === 0 || dow === 6

  return (
    <div
      onClick={() => onClick(dateStr, events)}
      style={{
        minHeight: 90,
        background: isToday ? 'var(--accent-muted)' : isWeekend ? 'var(--surface-3)' : 'var(--surface-2)',
        border: isToday ? '1.5px solid var(--accent)' : selected === dateStr ? '1.5px solid color-mix(in srgb, var(--accent) 50%, transparent)' : '1px solid var(--border-light)',
        borderRadius: 'var(--radius-sm)',
        padding: '8px 6px',
        cursor: events.length > 0 ? 'pointer' : 'default',
      }}
    >
      <div style={{
        fontSize: 12, fontWeight: isToday ? 700 : 400,
        color: isToday ? 'var(--accent)' : isWeekend ? 'var(--text-dim)' : 'var(--text)',
        marginBottom: 6,
      }}>
        <span style={{
          width: isToday ? 24 : undefined, height: isToday ? 24 : undefined,
          borderRadius: isToday ? '50%' : undefined,
          background: isToday ? 'var(--accent)' : undefined,
          color: isToday ? 'var(--on-accent)' : undefined,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {day}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {events.slice(0, 2).map((ev, i) => (
          <div key={i} style={{
            fontSize: 10, fontWeight: 600, padding: '2px 5px', borderRadius: 4,
            background: `${ev.color}22`, color: ev.color, border: `1px solid ${ev.color}33`,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            opacity: ev.status === 'rejected' ? 0.5 : 1,
          }}>
            {(ev.name || '').split(' ')[0]}
          </div>
        ))}
        {events.length > 2 && (
          <div style={{ fontSize: 10, color: 'var(--text-dim)', paddingLeft: 2 }}>+{events.length - 2} more</div>
        )}
      </div>
    </div>
  )
}

export default function TeamCalendar() {
  const { user } = useAuth()
  const role = user?.role || 'employee'
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [selected, setSelected] = useState(null)
  const [selectedEvents, setSelectedEvents] = useState([])
  const [eventsByDate, setEventsByDate] = useState({})
  const [teamMembers, setTeamMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const cells = useMemo(() => buildMonthGrid(year, month), [year, month])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const start = `${year}-${pad(month + 1)}-01`
      const endDay = new Date(year, month + 1, 0).getDate()
      const end = `${year}-${pad(month + 1)}-${pad(endDay)}`

      let peoplePayload = null
      try {
        peoplePayload = await dashboardService.getWhosAway({ start_date: start, end_date: end })
      } catch {
        peoplePayload = { people: [] }
      }

      // Approvers can enrich from calendar endpoint
      if (canAccessApprovals(role)) {
        try {
          const cal = await approvalService.getApproverCalendar(start, end)
          const extra = Array.isArray(cal) ? cal : (cal?.events || cal?.days || [])
          // Merge into people-like list if structured
          if (Array.isArray(extra) && extra.length && !peoplePayload?.people?.length) {
            peoplePayload = { people: extra.flatMap((d) => {
              if (d.people) {
                return d.people.map((p) => ({
                  ...p,
                  start_date: d.date || p.start_date,
                  end_date: d.date || p.end_date,
                }))
              }
              return [d]
            }) }
          }
        } catch { /* optional */ }
      }

      let holidays = []
      try {
        holidays = await dashboardService.getHolidays({ year, country_code: user?.country_code })
      } catch {
        holidays = []
      }

      const { calendarEvents, teamMembers: members } = toCalendarFromWhosAway(peoplePayload, holidays)
      setEventsByDate(calendarEvents)
      setTeamMembers(members)
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load calendar')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, user?.id, role])

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear((y) => y - 1) } else setMonth((m) => m - 1) }
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear((y) => y + 1) } else setMonth((m) => m + 1) }

  const titleByRole = {
    employee: 'Team Calendar',
    supervisor: 'Direct Reports Calendar',
    manager: 'Multi-Team Calendar',
    hr_admin: 'Organisation Calendar',
  }
  const subtitleByRole = {
    employee: "Your team's leave schedule and public holidays",
    supervisor: 'Leave for your direct reports',
    manager: 'All teams under your management',
    hr_admin: 'Organisation-wide leave across regions',
  }

  const onLeaveMembers = teamMembers.filter((m) => m.status !== 'active')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: 0 }}>
          {titleByRole[role] || titleByRole.employee}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
          {subtitleByRole[role] || subtitleByRole.employee}
        </p>
      </div>

      {loading && <div style={{ color: 'var(--text-muted)' }}>Loading calendar…</div>}
      {error && !loading && <Card style={{ color: 'var(--danger)' }}>{error}</Card>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 20, alignItems: 'start' }}>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <button type="button" onClick={prevMonth} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '6px 10px', color: 'var(--text-muted)', cursor: 'pointer' }}>
              <ChevronLeft size={14} />
            </button>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
              {MONTHS[month]} {year}
            </h2>
            <button type="button" onClick={nextMonth} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '6px 10px', color: 'var(--text-muted)', cursor: 'pointer' }}>
              <ChevronRight size={14} />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
            {DAYS.map((d) => (
              <div key={d} style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center', padding: '4px 0' }}>
                {d}
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {cells.map((day, i) => (
              <CalendarCell
                key={i}
                day={day}
                year={year}
                month={month}
                eventsByDate={eventsByDate}
                selected={selected}
                onClick={(date, evs) => { setSelected(date); setSelectedEvents(evs) }}
              />
            ))}
          </div>

          <div style={{ display: 'flex', gap: 16, marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-light)', flexWrap: 'wrap' }}>
            {[
              { color: 'var(--success)', label: 'Annual Leave' },
              { color: 'var(--info)', label: 'Sick Leave' },
              { color: 'var(--text-muted)', label: 'Unpaid Leave' },
              { color: 'var(--warning)', label: 'Public Holiday' },
            ].map((l) => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: `${l.color}33`, border: `1.5px solid ${l.color}66` }} />
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{l.label}</span>
              </div>
            ))}
          </div>
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {selected && (
            <Card>
              <SectionHeader title={selected} subtitle={`${selectedEvents.length} event${selectedEvents.length !== 1 ? 's' : ''}`} />
              {selectedEvents.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-dim)', textAlign: 'center', padding: '16px 0' }}>No leave on this day</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {selectedEvents.map((ev, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: ev.color, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{ev.name}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{ev.type} leave</div>
                      </div>
                      {ev.status !== 'approved' || ev.type !== 'holiday' ? <Badge status={ev.status === 'approved' && ev.type === 'holiday' ? 'annual' : ev.status} /> : null}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          <Card>
            <SectionHeader title="Team on Leave" subtitle={`${MONTHS[month]} ${year}`} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {onLeaveMembers.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No team leave in this month view yet.</div>
              )}
              {onLeaveMembers.map((m, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Avatar initials={m.avatar} color={m.color} size={30} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{m.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{m.role}</div>
                  </div>
                  <div style={{
                    fontSize: 10, fontWeight: 600, borderRadius: 100, padding: '2px 7px',
                    color: m.status === 'on_leave' ? 'var(--danger)' : 'var(--warning)',
                    background: m.status === 'on_leave' ? 'var(--danger-muted)' : 'var(--warning-muted)',
                  }}>
                    {m.status === 'on_leave' ? 'On Leave' : 'Pending'}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
