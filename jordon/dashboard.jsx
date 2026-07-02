import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  Box, Stack, Typography, Card, CardContent, Divider, Chip, Avatar, Button,
  IconButton, Badge, Menu, MenuItem, Tooltip, Drawer, List, ListItemButton,
  ListItemIcon, ListItemText, useMediaQuery, useTheme, LinearProgress,
  Snackbar, Alert, GlobalStyles,
} from '@mui/material';
import http from '../http';

/* ------------------------------------------------------------------ *
 * Design tokens
 * ------------------------------------------------------------------ */
const C = {
  ink: '#12263A',
  muted: '#5B6B7B',
  faint: '#8A97A6',
  page: '#F5F6F8',
  card: '#FFFFFF',
  border: '#E6E9EE',
  teal: '#1F6F6B',
  tealSoft: '#E6F1F0',
  holiday: '#C0413B',
};

const STATUS = {
  approved: { label: 'Approved', fg: '#2E7D5B', bg: '#E7F3EC' },
  pending: { label: 'Pending', fg: '#B4791A', bg: '#FBF1DF' },
  rejected: { label: 'Rejected', fg: '#C0413B', bg: '#FBE9E8' },
  cancelled: { label: 'Cancelled', fg: '#6B7280', bg: '#EEF0F2' },
};

const TYPE_COLOR = {
  Annual: '#1F6F6B', Medical: '#2F6DB0', Unpaid: '#64748B', Other: '#8A6FB0',
};

const ROLE_LABEL = {
  employee: 'Employee', supervisor: 'Supervisor', manager: 'Manager',
  hod: 'Head of Dept', hr_admin: 'HR Admin',
};

const DRAWER_W = 250;

/* ------------------------------------------------------------------ *
 * Inline icons (line set — no icon dependency)
 * ------------------------------------------------------------------ */
const Svg = ({ children, size = 20 }) => (
  <Box component="svg" width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
    sx={{ display: 'block' }}>{children}</Box>
);
const IcGrid = () => <Svg><rect x="3" y="3" width="7" height="7" rx="1.2" /><rect x="14" y="3" width="7" height="7" rx="1.2" /><rect x="14" y="14" width="7" height="7" rx="1.2" /><rect x="3" y="14" width="7" height="7" rx="1.2" /></Svg>;
const IcPlus = () => <Svg><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></Svg>;
const IcList = () => <Svg><path d="M8 6h13M8 12h13M8 18h13" /><circle cx="3.6" cy="6" r="1.2" /><circle cx="3.6" cy="12" r="1.2" /><circle cx="3.6" cy="18" r="1.2" /></Svg>;
const IcCal = () => <Svg><rect x="3" y="4.5" width="18" height="16" rx="2" /><path d="M3 9h18M8 2.5v4M16 2.5v4" /></Svg>;
const IcCheck = () => <Svg><path d="M4 12.5l5 5L20 6.5" /></Svg>;
const IcUsers = () => <Svg><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" /><path d="M16 5.2a3.2 3.2 0 0 1 0 6M17.6 20a5.5 5.5 0 0 0-3-4.9" /></Svg>;
const IcId = () => <Svg><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8.5" cy="11" r="2.2" /><path d="M13 9.5h5M13 13h4M5 16.5c.6-1.6 2-2.4 3.5-2.4s2.9.8 3.5 2.4" /></Svg>;
const IcReport = () => <Svg><path d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M14 3v5h5M9 17v-3M12 17v-6M15 17v-2" /></Svg>;
const IcBell = () => <Svg><path d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7" /><path d="M10.5 20a1.8 1.8 0 0 0 3 0" /></Svg>;
const IcLogout = () => <Svg><path d="M15 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3M10 8l-4 4 4 4M6 12h9" /></Svg>;
const IcLeft = () => <Svg size={18}><path d="M14 6l-6 6 6 6" /></Svg>;
const IcRight = () => <Svg size={18}><path d="M10 6l6 6-6 6" /></Svg>;
const IcMenu = () => <Svg><path d="M4 7h16M4 12h16M4 17h16" /></Svg>;

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */
const dnum = (n) => (Number.isInteger(Number(n)) ? String(Number(n)) : Number(n).toFixed(1));
const initials = (name = '') => name.trim().split(/\s+/).slice(0, 2).map((w) => (w[0] || '').toUpperCase()).join('');
const eachDate = (start, end) => {
  const out = []; let d = dayjs(start); const e = dayjs(end);
  while (d.isBefore(e) || d.isSame(e, 'day')) { out.push(d.format('YYYY-MM-DD')); d = d.add(1, 'day'); }
  return out;
};
const fmtRange = (s, e) => {
  const a = dayjs(s), b = dayjs(e);
  if (a.isSame(b, 'day')) return a.format('D MMM YYYY');
  if (a.isSame(b, 'month')) return `${a.format('D')}–${b.format('D MMM YYYY')}`;
  if (a.isSame(b, 'year')) return `${a.format('D MMM')} – ${b.format('D MMM YYYY')}`;
  return `${a.format('D MMM YYYY')} – ${b.format('D MMM YYYY')}`;
};
const unwrap = (d) => (d && typeof d === 'object' && !Array.isArray(d) && 'data' in d ? d.data : d);
const asArray = (d) => (Array.isArray(d) ? d : (d && (d.items || d.requests || d.results)) || []);

/* ------------------------------------------------------------------ *
 * Sample fallback data (Singapore supervisor).
 * Shown only when the API is unreachable, so the UI runs standalone.
 * ------------------------------------------------------------------ */
const DEMO = {
  me: { name: 'Alex Tan', role: 'supervisor', country_code: 'SG', country: 'Singapore' },
  balance: {
    annual: { entitlement: 18, carried: 5, used: 6.5, remaining: 16.5 },
    sick: { entitlement: 14, used: 2, remaining: 12 },
    unpaid: { taken: 0 },
  },
  requests: [
    { id: 'LR-1051', type: 'Annual', start_date: '2026-07-22', end_date: '2026-07-22', days: 0.5, half_day: true, status: 'pending', reason: 'Medical appointment (afternoon)' },
    { id: 'LR-1042', type: 'Annual', start_date: '2026-07-14', end_date: '2026-07-16', days: 3, half_day: false, status: 'approved', reason: 'Family trip' },
    { id: 'LR-1039', type: 'Medical', start_date: '2026-06-03', end_date: '2026-06-04', days: 2, half_day: false, status: 'approved', reason: 'MC — flu' },
    { id: 'LR-1030', type: 'Unpaid', start_date: '2026-05-19', end_date: '2026-05-19', days: 1, half_day: false, status: 'rejected', reason: 'Personal errand' },
    { id: 'LR-1025', type: 'Annual', start_date: '2026-04-10', end_date: '2026-04-11', days: 2, half_day: false, status: 'cancelled', reason: 'Plans changed' },
  ],
  approvals: [
    { id: 'AP-2201', employee: 'Jamie Lee', type: 'Annual', start_date: '2026-07-15', end_date: '2026-07-17', days: 3, note: 'Overlaps 1 teammate on 15 Jul' },
    { id: 'AP-2202', employee: 'Priya Nair', type: 'Medical', start_date: '2026-07-09', end_date: '2026-07-09', days: 1, note: 'MC submitted' },
  ],
  holidays: [
    { date: '2026-01-01', name: "New Year's Day" },
    { date: '2026-02-17', name: 'Chinese New Year' },
    { date: '2026-02-18', name: 'Chinese New Year' },
    { date: '2026-03-21', name: 'Hari Raya Puasa' },
    { date: '2026-04-03', name: 'Good Friday' },
    { date: '2026-05-01', name: 'Labour Day' },
    { date: '2026-05-27', name: 'Hari Raya Haji' },
    { date: '2026-05-31', name: 'Vesak Day' },
    { date: '2026-06-01', name: 'Vesak Day' },
    { date: '2026-08-09', name: 'National Day' },
    { date: '2026-08-10', name: 'National Day (observed)' },
    { date: '2026-11-08', name: 'Deepavali' },
    { date: '2026-11-09', name: 'Deepavali (observed)' },
    { date: '2026-12-25', name: 'Christmas Day' },
  ],
  notifications: [
    { id: 'N-1', text: 'Your annual leave (14–16 Jul) was approved by Wei Ming.', at: '2026-07-01T09:12:00', read: false },
    { id: 'N-2', text: 'Jamie Lee submitted a leave request awaiting your approval.', at: '2026-06-30T16:40:00', read: false },
    { id: 'N-3', text: 'Reminder: 2 requests are waiting for your review.', at: '2026-06-29T08:00:00', read: true },
  ],
};

/* ------------------------------------------------------------------ *
 * Small presentational pieces
 * ------------------------------------------------------------------ */
const Panel = ({ children, sx }) => (
  <Card elevation={0} sx={{ border: `1px solid ${C.border}`, borderRadius: 3, bgcolor: C.card, ...sx }}>
    <CardContent sx={{ p: { xs: 2, md: 2.5 }, '&:last-child': { pb: { xs: 2, md: 2.5 } } }}>{children}</CardContent>
  </Card>
);

const PanelHead = ({ title, action }) => (
  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
    <Typography sx={{ fontWeight: 700, fontSize: 15.5 }}>{title}</Typography>
    {action}
  </Stack>
);

const StatusChip = ({ status }) => {
  const s = STATUS[status] || STATUS.pending;
  return <Chip label={s.label} size="small" sx={{ height: 22, fontSize: 11.5, fontWeight: 600, color: s.fg, bgcolor: s.bg, borderRadius: 1 }} />;
};

const Legend = ({ swatch, label }) => (
  <Stack direction="row" alignItems="center" spacing={0.75}>
    {swatch}<Typography sx={{ fontSize: 12, color: C.muted }}>{label}</Typography>
  </Stack>
);

const LeaveRow = ({ r, last }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.5, borderBottom: last ? 'none' : `1px solid ${C.border}`, flexWrap: 'wrap' }}>
    <Box sx={{ width: 3, alignSelf: 'stretch', minHeight: 34, borderRadius: 2, bgcolor: TYPE_COLOR[r.type] || C.faint }} />
    <Box sx={{ flex: 1, minWidth: 170 }}>
      <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{r.type} leave{r.half_day ? ' · half day' : ''}</Typography>
      <Typography sx={{ fontSize: 12.5, color: C.muted }}>{fmtRange(r.start_date, r.end_date)} · {r.reason}</Typography>
    </Box>
    <Chip label={`${dnum(r.days)} ${Number(r.days) === 1 ? 'day' : 'days'}`} size="small" variant="outlined" sx={{ height: 22, fontSize: 11.5, borderColor: C.border, color: C.muted, borderRadius: 1 }} />
    <StatusChip status={r.status} />
  </Box>
);

const BalanceCard = ({ eyebrow, accent, big, unit, caption, track, pill }) => (
  <Panel>
    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.25 }}>
      <Box sx={{ width: 9, height: 9, borderRadius: 0.5, bgcolor: accent }} />
      <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.9, textTransform: 'uppercase', color: C.muted }}>{eyebrow}</Typography>
    </Stack>
    <Stack direction="row" alignItems="baseline" spacing={0.75}>
      <Typography sx={{ fontSize: 42, fontWeight: 300, lineHeight: 1, letterSpacing: -1, fontVariantNumeric: 'tabular-nums', color: C.ink }}>{big}</Typography>
      <Typography sx={{ fontSize: 13, color: C.muted }}>{unit}</Typography>
      {pill && <Chip label={pill} size="small" sx={{ ml: 'auto', height: 22, fontSize: 11, fontWeight: 600, color: accent, bgcolor: `${accent}14`, borderRadius: 1 }} />}
    </Stack>
    {track && (
      <Box sx={{ mt: 1.75, height: 6, borderRadius: 3, bgcolor: `${accent}1f`, overflow: 'hidden' }}>
        <Box sx={{ height: '100%', width: `${Math.min(100, Math.max(0, track.pct * 100))}%`, bgcolor: accent, borderRadius: 3, transition: 'width .5s ease' }} />
      </Box>
    )}
    <Typography sx={{ mt: 1.25, fontSize: 12.5, color: C.muted }}>{caption}</Typography>
  </Panel>
);

/* ------------------------------------------------------------------ *
 * Month calendar (hand-built — depends only on dayjs + MUI)
 * ------------------------------------------------------------------ */
function MiniCalendar({ approvedSet, pendingSet, holidayMap }) {
  const [month, setMonth] = useState(dayjs().startOf('month'));
  const today = dayjs();
  const start = month.startOf('month');
  const offset = (start.day() + 6) % 7; // Monday-first
  const dim = month.daysInMonth();
  const cells = [];
  for (let i = 0; i < offset; i += 1) cells.push(null);
  for (let d = 1; d <= dim; d += 1) cells.push(month.date(d));
  while (cells.length % 7 !== 0) cells.push(null);
  const WEEK = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
        <Typography sx={{ fontWeight: 700, fontSize: 15 }}>{month.format('MMMM YYYY')}</Typography>
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <IconButton size="small" onClick={() => setMonth(month.subtract(1, 'month'))} aria-label="Previous month" sx={{ color: C.muted }}><IcLeft /></IconButton>
          <Button size="small" onClick={() => setMonth(dayjs().startOf('month'))} sx={{ minWidth: 0, px: 1, textTransform: 'none', color: C.muted, fontSize: 11.5, fontWeight: 600 }}>Today</Button>
          <IconButton size="small" onClick={() => setMonth(month.add(1, 'month'))} aria-label="Next month" sx={{ color: C.muted }}><IcRight /></IconButton>
        </Stack>
      </Stack>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.5 }}>
        {WEEK.map((w) => (
          <Typography key={w} align="center" sx={{ fontSize: 10.5, fontWeight: 600, color: C.faint, letterSpacing: 0.5, py: 0.5 }}>{w}</Typography>
        ))}
        {cells.map((day, i) => {
          if (!day) return <Box key={`e-${i}`} />;
          const iso = day.format('YYYY-MM-DD');
          const isToday = day.isSame(today, 'day');
          const weekend = day.day() === 0 || day.day() === 6;
          const holiday = holidayMap[iso];
          const approved = approvedSet.has(iso);
          const pending = pendingSet.has(iso);
          return (
            <Box key={iso} title={holiday || undefined} sx={{
              position: 'relative', aspectRatio: '1 / 1', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12.5, borderRadius: 1.5,
              fontWeight: holiday || isToday ? 600 : 400,
              color: approved ? '#fff' : holiday ? C.holiday : weekend ? C.faint : C.ink,
              bgcolor: approved ? C.teal : 'transparent',
              border: pending && !approved ? `1.5px solid ${C.teal}` : '1.5px solid transparent',
              boxShadow: isToday && !approved ? `inset 0 0 0 1.5px ${C.teal}` : 'none',
            }}>
              {day.date()}
              {holiday && <Box sx={{ position: 'absolute', bottom: 3.5, width: 4, height: 4, borderRadius: '50%', bgcolor: approved ? '#fff' : C.holiday }} />}
            </Box>
          );
        })}
      </Box>

      <Stack direction="row" spacing={2} sx={{ mt: 1.75, flexWrap: 'wrap', rowGap: 0.75 }}>
        <Legend swatch={<Box sx={{ width: 12, height: 12, borderRadius: 0.75, bgcolor: C.teal }} />} label="On leave" />
        <Legend swatch={<Box sx={{ width: 12, height: 12, borderRadius: 0.75, border: `1.5px solid ${C.teal}` }} />} label="Pending" />
        <Legend swatch={<Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: C.holiday }} />} label="Public holiday" />
      </Stack>
    </Box>
  );
}

/* ------------------------------------------------------------------ *
 * Dashboard (default export)
 * ------------------------------------------------------------------ */
export default function Dashboard() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const navigate = useNavigate();
  const location = useLocation();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [demoMode, setDemoMode] = useState(false);
  const [me, setMe] = useState(DEMO.me);
  const [balance, setBalance] = useState(DEMO.balance);
  const [requests, setRequests] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [notifs, setNotifs] = useState([]);
  const [anchor, setAnchor] = useState(null);
  const [snack, setSnack] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      let fell = false;
      const get = async (url, fallback) => {
        try { const res = await http.get(url); return unwrap(res.data); }
        catch { fell = true; return fallback; }
      };
      const meD = await get('/api/auth/me', DEMO.me);
      const country = meD.country_code || 'SG';
      const year = dayjs().year();
      const [balD, reqD, holD, notD] = await Promise.all([
        get('/api/balance', DEMO.balance),
        get('/api/leave', DEMO.requests),
        get(`/api/holidays?country=${country}&year=${year}`, DEMO.holidays),
        get('/api/notifications', DEMO.notifications),
      ]);
      const role = meD.role || 'employee';
      const isApprover = ['supervisor', 'manager', 'hod', 'hr_admin'].includes(role);
      const appD = isApprover ? await get('/api/approvals', DEMO.approvals) : [];
      if (!alive) return;
      setMe(meD);
      setBalance(balD || DEMO.balance);
      setRequests(asArray(reqD));
      setHolidays(asArray(holD));
      setNotifs(asArray(notD));
      setApprovals(asArray(appD));
      setDemoMode(fell);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const role = me.role || 'employee';
  const isApprover = ['supervisor', 'manager', 'hod', 'hr_admin'].includes(role);
  const isHR = role === 'hr_admin';
  const firstName = (me.name || 'there').split(' ')[0];
  const hour = dayjs().hour();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const unread = notifs.filter((n) => !n.read).length;

  const { approvedSet, pendingSet, holidayMap, upcoming } = useMemo(() => {
    const ap = new Set();
    const pe = new Set();
    const hm = {};
    requests.forEach((r) => {
      if (r.status === 'approved') eachDate(r.start_date, r.end_date).forEach((d) => ap.add(d));
      else if (r.status === 'pending') eachDate(r.start_date, r.end_date).forEach((d) => pe.add(d));
    });
    holidays.forEach((h) => { hm[h.date] = h.name; });
    const today = dayjs().startOf('day');
    const up = [...holidays]
      .filter((h) => !dayjs(h.date).isBefore(today))
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .slice(0, 5);
    return { approvedSet: ap, pendingSet: pe, holidayMap: hm, upcoming: up };
  }, [requests, holidays]);

  const annualTotal = (balance.annual?.entitlement || 0) + (balance.annual?.carried || 0);
  const annualUsed = balance.annual?.used || 0;
  const annualRem = balance.annual?.remaining ?? (annualTotal - annualUsed);
  const sickTotal = balance.sick?.entitlement || 0;
  const sickUsed = balance.sick?.used || 0;
  const sickRem = balance.sick?.remaining ?? (sickTotal - sickUsed);
  const unpaidTaken = balance.unpaid?.taken || 0;

  const nav = [
    { label: 'Dashboard', path: '/', icon: <IcGrid /> },
    { label: 'Apply for leave', path: '/apply', icon: <IcPlus /> },
    { label: 'My leaves', path: '/my-leaves', icon: <IcList /> },
    { label: 'Calendar', path: '/calendar', icon: <IcCal /> },
    ...(isApprover ? [
      { label: 'Approvals', path: '/approvals', icon: <IcCheck />, badge: approvals.length },
      { label: 'Team calendar', path: '/team', icon: <IcUsers /> },
    ] : []),
    ...(isHR ? [
      { label: 'Employees', path: '/admin/employees', icon: <IcId /> },
      { label: 'Reports', path: '/admin/reports', icon: <IcReport /> },
    ] : []),
  ];

  const go = (path) => { navigate(path); setMobileOpen(false); };

  const decide = async (item, action) => {
    setApprovals((prev) => prev.filter((a) => a.id !== item.id));
    setSnack({ sev: action === 'approve' ? 'success' : 'info', msg: `${action === 'approve' ? 'Approved' : 'Rejected'} — ${item.employee}'s ${item.type.toLowerCase()} leave` });
    try { await http.put(`/api/approvals/${item.id}/${action}`); } catch { /* offline/demo: UI already updated */ }
  };

  const markAllRead = async () => {
    setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
    setAnchor(null);
    try { await http.put('/api/notifications/read-all'); } catch { /* offline/demo */ }
  };

  const drawer = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Stack direction="row" alignItems="center" spacing={1.25} sx={{ px: 2.5, height: 64, flexShrink: 0 }}>
        <Box sx={{ width: 30, height: 30, borderRadius: 1.5, bgcolor: C.teal, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 15 }}>T</Box>
        <Box>
          <Typography sx={{ fontWeight: 800, fontSize: 15.5, letterSpacing: -0.2, lineHeight: 1.1 }}>TimeOff</Typography>
          <Typography sx={{ fontSize: 10.5, color: C.faint, letterSpacing: 0.3 }}>Leave management</Typography>
        </Box>
      </Stack>
      <Divider sx={{ borderColor: C.border }} />
      <List sx={{ px: 1.25, py: 1.5, flex: 1 }}>
        {nav.map((item) => {
          const active = location.pathname === item.path;
          return (
            <ListItemButton key={item.path} selected={active} onClick={() => go(item.path)} sx={{
              borderRadius: 2, mb: 0.5, py: 1, color: active ? C.teal : C.muted,
              '&.Mui-selected': { bgcolor: C.tealSoft, color: C.teal, '&:hover': { bgcolor: C.tealSoft } },
              '&:hover': { bgcolor: '#F1F3F6' },
            }}>
              <ListItemIcon sx={{ minWidth: 34, color: 'inherit' }}>{item.icon}</ListItemIcon>
              <ListItemText primaryTypographyProps={{ fontSize: 14, fontWeight: active ? 700 : 500 }} primary={item.label} />
              {item.badge ? <Chip label={item.badge} size="small" sx={{ height: 20, fontSize: 11, fontWeight: 700, bgcolor: C.teal, color: '#fff' }} /> : null}
            </ListItemButton>
          );
        })}
      </List>
      <Divider sx={{ borderColor: C.border }} />
      <Stack direction="row" alignItems="center" spacing={1.25} sx={{ p: 2, flexShrink: 0 }}>
        <Avatar sx={{ width: 36, height: 36, bgcolor: C.tealSoft, color: C.teal, fontSize: 13, fontWeight: 700 }}>{initials(me.name)}</Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography noWrap sx={{ fontSize: 13.5, fontWeight: 700 }}>{me.name}</Typography>
          <Typography noWrap sx={{ fontSize: 11.5, color: C.muted }}>{ROLE_LABEL[role] || role} · {me.country || me.country_code}</Typography>
        </Box>
        <Tooltip title="Log out">
          <IconButton size="small" onClick={() => go('/login')} sx={{ color: C.faint }}><IcLogout /></IconButton>
        </Tooltip>
      </Stack>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: C.page, color: C.ink }}>
      <GlobalStyles styles={{ '@media (prefers-reduced-motion: reduce)': { '*': { transition: 'none !important', animation: 'none !important', scrollBehavior: 'auto !important' } } }} />

      <Box component="nav" sx={{ width: { md: DRAWER_W }, flexShrink: { md: 0 } }}>
        <Drawer
          variant={isMobile ? 'temporary' : 'permanent'}
          open={isMobile ? mobileOpen : true}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{ '& .MuiDrawer-paper': { width: DRAWER_W, boxSizing: 'border-box', border: 'none', borderRight: `1px solid ${C.border}`, bgcolor: C.card } }}
        >
          {drawer}
        </Drawer>
      </Box>

      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Box sx={{
          position: 'sticky', top: 0, zIndex: 5, height: 64, px: { xs: 2, md: 3 },
          display: 'flex', alignItems: 'center', gap: 1.5,
          bgcolor: 'rgba(255,255,255,0.86)', backdropFilter: 'blur(8px)', borderBottom: `1px solid ${C.border}`,
        }}>
          {isMobile && <IconButton edge="start" onClick={() => setMobileOpen(true)} aria-label="Open menu" sx={{ color: C.ink }}><IcMenu /></IconButton>}
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 800, fontSize: 17, lineHeight: 1.1 }}>Dashboard</Typography>
            <Typography sx={{ fontSize: 12, color: C.muted }}>{dayjs().format('dddd, D MMMM YYYY')}</Typography>
          </Box>
          <Box sx={{ flex: 1 }} />
          <Tooltip title="Notifications">
            <IconButton onClick={(e) => setAnchor(e.currentTarget)} aria-label="Notifications" sx={{ color: C.ink }}>
              <Badge badgeContent={unread} color="error" overlap="circular"><IcBell /></Badge>
            </IconButton>
          </Tooltip>
          <Avatar sx={{ width: 34, height: 34, bgcolor: C.teal, color: '#fff', fontSize: 13, fontWeight: 700 }}>{initials(me.name)}</Avatar>
        </Box>

        {loading && <LinearProgress sx={{ height: 2, bgcolor: C.tealSoft, '& .MuiLinearProgress-bar': { bgcolor: C.teal } }} />}

        <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          PaperProps={{ sx: { width: 340, maxWidth: '92vw', borderRadius: 2, border: `1px solid ${C.border}`, boxShadow: '0 12px 34px rgba(18,38,58,0.12)' } }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2, pt: 1.5, pb: 1 }}>
            <Typography sx={{ fontWeight: 700, fontSize: 14 }}>Notifications</Typography>
            <Button size="small" onClick={markAllRead} sx={{ textTransform: 'none', color: C.teal, fontWeight: 600 }}>Mark all read</Button>
          </Stack>
          <Divider sx={{ borderColor: C.border }} />
          {notifs.length === 0 && (
            <Box sx={{ px: 2, py: 3, textAlign: 'center' }}><Typography sx={{ fontSize: 13, color: C.muted }}>You&apos;re all caught up.</Typography></Box>
          )}
          {notifs.map((n) => (
            <MenuItem key={n.id} onClick={() => setAnchor(null)} sx={{ alignItems: 'flex-start', gap: 1.25, py: 1.25, whiteSpace: 'normal' }}>
              <Box sx={{ mt: 0.75, width: 8, height: 8, borderRadius: '50%', flexShrink: 0, bgcolor: n.read ? 'transparent' : C.teal, border: n.read ? `1.5px solid ${C.border}` : 'none' }} />
              <Box>
                <Typography sx={{ fontSize: 13, lineHeight: 1.35, color: C.ink }}>{n.text}</Typography>
                <Typography sx={{ fontSize: 11, color: C.faint, mt: 0.25 }}>{dayjs(n.at).format('D MMM, h:mm A')}</Typography>
              </Box>
            </MenuItem>
          ))}
        </Menu>

        <Box component="main" sx={{ p: { xs: 2, md: 3 }, width: '100%', maxWidth: 1200, mx: 'auto' }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} justifyContent="space-between" spacing={2} sx={{ mb: 3 }}>
            <Box>
              <Stack direction="row" alignItems="center" spacing={1.25} sx={{ flexWrap: 'wrap', rowGap: 0.75 }}>
                <Typography sx={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.4 }}>{greeting}, {firstName}</Typography>
                <Chip label={me.country || me.country_code} size="small" sx={{ height: 24, fontSize: 12, fontWeight: 600, bgcolor: C.tealSoft, color: C.teal, borderRadius: 1 }} />
                {demoMode && <Chip label="Sample data" size="small" variant="outlined" sx={{ height: 24, fontSize: 11.5, borderColor: C.border, color: C.faint, borderRadius: 1 }} />}
              </Stack>
              <Typography sx={{ fontSize: 13.5, color: C.muted, mt: 0.5 }}>Here&apos;s where your leave stands today.</Typography>
            </Box>
            <Button variant="contained" disableElevation onClick={() => go('/apply')} startIcon={<IcPlus />}
              sx={{ bgcolor: C.teal, textTransform: 'none', fontWeight: 700, borderRadius: 2, px: 2.25, py: 1, alignSelf: { xs: 'stretch', sm: 'auto' }, '&:hover': { bgcolor: '#185a56' } }}>
              Apply for leave
            </Button>
          </Stack>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)' }, gap: 2, mb: 3 }}>
            <BalanceCard
              eyebrow="Annual leave" accent="#1F6F6B"
              big={dnum(annualRem)} unit="days left"
              pill={balance.annual?.carried ? `+${dnum(balance.annual.carried)} carried` : null}
              track={{ pct: annualTotal ? annualUsed / annualTotal : 0 }}
              caption={`${dnum(annualUsed)} of ${dnum(annualTotal)} days used this year`}
            />
            <BalanceCard
              eyebrow="Medical leave" accent="#2F6DB0"
              big={dnum(sickRem)} unit="days left"
              track={{ pct: sickTotal ? sickUsed / sickTotal : 0 }}
              caption={`${dnum(sickUsed)} of ${dnum(sickTotal)} days used`}
            />
            <BalanceCard
              eyebrow="Unpaid leave" accent="#64748B"
              big={dnum(unpaidTaken)} unit="days taken"
              caption="Requires manager approval"
            />
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.55fr 1fr' }, gap: 2.5, alignItems: 'start' }}>
            <Stack spacing={2.5}>
              {isApprover && (
                <Panel>
                  <PanelHead title="Awaiting your approval"
                    action={<Chip label={`${approvals.length} pending`} size="small" sx={{ height: 22, fontSize: 11.5, fontWeight: 600, color: STATUS.pending.fg, bgcolor: STATUS.pending.bg, borderRadius: 1 }} />} />
                  {approvals.length === 0 ? (
                    <Box sx={{ py: 3, textAlign: 'center' }}>
                      <Typography sx={{ fontSize: 14, fontWeight: 600 }}>Nothing to review</Typography>
                      <Typography sx={{ fontSize: 13, color: C.muted, mt: 0.5 }}>New requests from your team will appear here.</Typography>
                    </Box>
                  ) : (
                    approvals.map((a, i) => (
                      <Box key={a.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.75, borderBottom: i === approvals.length - 1 ? 'none' : `1px solid ${C.border}`, flexWrap: 'wrap' }}>
                        <Avatar sx={{ width: 36, height: 36, bgcolor: '#EEF1F5', color: C.muted, fontSize: 12.5, fontWeight: 700 }}>{initials(a.employee)}</Avatar>
                        <Box sx={{ flex: 1, minWidth: 150 }}>
                          <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{a.employee}</Typography>
                          <Typography sx={{ fontSize: 12.5, color: C.muted }}>{a.type} · {fmtRange(a.start_date, a.end_date)} · {dnum(a.days)} {Number(a.days) === 1 ? 'day' : 'days'}</Typography>
                          {a.note && <Typography sx={{ fontSize: 12, color: STATUS.pending.fg, mt: 0.25 }}>{a.note}</Typography>}
                        </Box>
                        <Stack direction="row" spacing={1}>
                          <Button size="small" variant="outlined" onClick={() => decide(a, 'reject')} sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 1.5, color: STATUS.rejected.fg, borderColor: '#EAD4D2', '&:hover': { borderColor: STATUS.rejected.fg, bgcolor: STATUS.rejected.bg } }}>Reject</Button>
                          <Button size="small" variant="contained" disableElevation onClick={() => decide(a, 'approve')} sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 1.5, bgcolor: STATUS.approved.fg, '&:hover': { bgcolor: '#276a4d' } }}>Approve</Button>
                        </Stack>
                      </Box>
                    ))
                  )}
                </Panel>
              )}

              <Panel>
                <PanelHead title="My requests"
                  action={<Button size="small" onClick={() => go('/my-leaves')} sx={{ textTransform: 'none', color: C.teal, fontWeight: 600 }}>View all</Button>} />
                {requests.length === 0 ? (
                  <Box sx={{ py: 3, textAlign: 'center' }}>
                    <Typography sx={{ fontSize: 14, fontWeight: 600 }}>No requests yet</Typography>
                    <Typography sx={{ fontSize: 13, color: C.muted, mt: 0.5 }}>Apply for leave to see it tracked here.</Typography>
                  </Box>
                ) : (
                  requests.slice(0, 5).map((r, i) => <LeaveRow key={r.id} r={r} last={i === Math.min(requests.length, 5) - 1} />)
                )}
              </Panel>
            </Stack>

            <Stack spacing={2.5}>
              <Panel>
                <MiniCalendar approvedSet={approvedSet} pendingSet={pendingSet} holidayMap={holidayMap} />
              </Panel>

              <Panel>
                <PanelHead title="Public holidays"
                  action={<Typography sx={{ fontSize: 12, color: C.faint }}>{me.country || me.country_code}</Typography>} />
                {upcoming.length === 0 ? (
                  <Typography sx={{ fontSize: 13, color: C.muted, py: 1 }}>No upcoming holidays on the calendar.</Typography>
                ) : (
                  upcoming.map((h, i) => (
                    <Stack key={`${h.date}-${i}`} direction="row" alignItems="center" spacing={1.5} sx={{ py: 1.25, borderBottom: i === upcoming.length - 1 ? 'none' : `1px solid ${C.border}` }}>
                      <Box sx={{ width: 44, textAlign: 'center', flexShrink: 0 }}>
                        <Typography sx={{ fontSize: 18, fontWeight: 800, lineHeight: 1, color: C.ink }}>{dayjs(h.date).format('D')}</Typography>
                        <Typography sx={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: C.faint }}>{dayjs(h.date).format('MMM')}</Typography>
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontSize: 13.5, fontWeight: 600 }} noWrap>{h.name}</Typography>
                        <Typography sx={{ fontSize: 12, color: C.muted }}>{dayjs(h.date).format('dddd')}</Typography>
                      </Box>
                    </Stack>
                  ))
                )}
              </Panel>
            </Stack>
          </Box>
        </Box>
      </Box>

      <Snackbar open={Boolean(snack)} autoHideDuration={3500} onClose={() => setSnack(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack?.sev || 'info'} variant="filled" onClose={() => setSnack(null)} sx={{ borderRadius: 2, fontWeight: 500 }}>{snack?.msg}</Alert>
      </Snackbar>
    </Box>
  );
}
