import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import toast from 'react-hot-toast';
import * as approvalService from '../services/approvalService';
import * as dashboardService from '../services/dashboardService';
import StatusBadge from '../components/common/StatusBadge';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { OFFICE_COUNTRIES, FLAG, COMPANY } from '../utils/company';

dayjs.extend(isSameOrBefore);

const COUNTRIES = OFFICE_COUNTRIES;

/**
 * UC-08: Team calendar + multi-country public holidays with detail panel
 */
export default function ApproverCalendarPage() {
  const [month, setMonth] = useState(dayjs().startOf('month'));
  const [events, setEvents] = useState([]);
  const [history, setHistory] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [holidayMeta, setHolidayMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('calendar');
  /** ALL = every country PH list */
  const [countryFilter, setCountryFilter] = useState('ALL');
  const [selectedDay, setSelectedDay] = useState(null);

  const range = useMemo(() => {
    const start = month.startOf('month').format('YYYY-MM-DD');
    const end = month.endOf('month').format('YYYY-MM-DD');
    return { start, end };
  }, [month]);

  const load = async () => {
    setLoading(true);
    try {
      const [cal, hist, hol] = await Promise.all([
        approvalService.getApproverCalendar(range.start, range.end).catch(() =>
          dashboardService
            .getWhosAway({ start_date: range.start, end_date: range.end })
            .then((d) =>
              (d.people || []).map((p) => ({
                id: p.leave_id,
                leave_type: p.leave_type,
                start_date: p.start_date,
                end_date: p.end_date,
                status: p.status,
                applicant: { name: p.name, department: p.department },
              }))
            )
        ),
        approvalService.getApproverHistory({ year: month.year() }).catch(() => []),
        // Loads from DB; if year not cached, server fetches online then stores it
        dashboardService.getHolidays(
          {
            year: month.year(),
            country_code: 'ALL',
          },
          { withMeta: true }
        ),
      ]);
      setEvents(Array.isArray(cal) ? cal : []);
      setHistory(Array.isArray(hist) ? hist : []);
      if (hol && !Array.isArray(hol) && hol.holidays) {
        setHolidays(hol.holidays);
        setHolidayMeta(hol.meta || null);
      } else {
        setHolidays(Array.isArray(hol) ? hol : []);
        setHolidayMeta(null);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load calendar');
      setEvents([]);
      setHistory([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.start, range.end]);

  const filteredHolidays = useMemo(() => {
    if (countryFilter === 'ALL') return holidays;
    return holidays.filter((h) => h.country_code === countryFilter);
  }, [holidays, countryFilter]);

  const holidaysThisMonth = useMemo(
    () =>
      filteredHolidays
        .filter((h) => dayjs(h.date).isSame(month, 'month'))
        .sort((a, b) =>
          a.date === b.date
            ? a.country_code.localeCompare(b.country_code)
            : a.date.localeCompare(b.date)
        ),
    [filteredHolidays, month]
  );

  /** date -> holiday[] (multi-country same day) */
  const holidaysByDate = useMemo(() => {
    const m = {};
    filteredHolidays.forEach((h) => {
      if (!m[h.date]) m[h.date] = [];
      m[h.date].push(h);
    });
    return m;
  }, [filteredHolidays]);

  const eventsByDay = useMemo(() => {
    const map = {};
    for (const ev of events) {
      let cur = dayjs(ev.start_date);
      const last = dayjs(ev.end_date);
      while (cur.isSameOrBefore(last, 'day')) {
        if (cur.isSame(month, 'month')) {
          const key = cur.format('YYYY-MM-DD');
          if (!map[key]) map[key] = [];
          map[key].push(ev);
        }
        cur = cur.add(1, 'day');
      }
    }
    return map;
  }, [events, month]);

  const selectedHolidays = selectedDay ? holidaysByDate[selectedDay] || [] : [];
  const selectedEvents = selectedDay ? eventsByDay[selectedDay] || [] : [];

  const holidaysByCountry = useMemo(() => {
    const g = {};
    OFFICE_COUNTRIES.filter((c) => c.code !== 'ALL').forEach((c) => {
      g[c.code] = [];
    });
    holidays.forEach((h) => {
      if (!g[h.country_code]) g[h.country_code] = [];
      g[h.country_code].push(h);
    });
    Object.keys(g).forEach((k) => g[k].sort((a, b) => a.date.localeCompare(b.date)));
    return g;
  }, [holidays]);

  const countryMeta =
    COUNTRIES.find((c) => c.code === countryFilter) || COUNTRIES[0];

  const jumpToHoliday = (date) => {
    setMonth(dayjs(date).startOf('month'));
    setSelectedDay(date);
    setTab('calendar');
  };

  const exportHistory = async () => {
    try {
      await dashboardService.exportApprovalsCsv();
      toast.success('CSV downloaded');
    } catch (e) {
      toast.error(e.message || 'Export failed');
    }
  };

  const daysInMonth = month.daysInMonth();
  const startPad = month.startOf('month').day();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="page-title">Team calendar</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {COMPANY.name} · ~{COMPANY.staffCount} staff · {COMPANY.totalCountries}{' '}
            countries · public holidays for every office
          </p>
          <p className="mt-1 text-xs text-slate-400">
            PH years 2025–2035+ load on demand (database first; online only if missing).
            {holidayMeta?.source_note ? ` ${holidayMeta.source_note}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 px-3 py-2 text-sm shadow-sm">
            <span className="text-slate-500 dark:text-slate-400">Show PH</span>
            <select
              value={countryFilter}
              onChange={(e) => setCountryFilter(e.target.value)}
              className="border-0 bg-transparent font-medium text-slate-900 dark:text-slate-50 outline-none"
            >
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.flag} {c.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={exportHistory}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Export CSV
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-slate-100/80 dark:border-slate-700 dark:bg-slate-800/80 p-1">
        {[
          { id: 'calendar', label: 'Month grid' },
          {
            id: 'holidays',
            label: `All public holidays (${
              countryFilter === 'ALL' ? holidays.length : filteredHolidays.length
            })`,
          },
          { id: 'history', label: 'Leave history' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              tab === t.id
                ? 'bg-white text-indigo-700 shadow-sm dark:bg-slate-900 dark:text-indigo-300'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingSpinner label="Loading calendar..." />
      ) : tab === 'calendar' ? (
        <div className="grid gap-4 lg:grid-cols-3 xl:gap-6 2xl:grid-cols-5">
          <div className="min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-3 shadow-sm sm:p-4 lg:col-span-2 2xl:col-span-3">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                onClick={() => {
                  setMonth((m) => m.subtract(1, 'month'));
                  setSelectedDay(null);
                }}
              >
                ← Prev
              </button>
              <div className="text-center">
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">
                  {month.format('MMMM YYYY')}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {countryMeta.flag} {countryMeta.label} · {holidaysThisMonth.length} PH
                  entry{holidaysThisMonth.length === 1 ? '' : 'ies'} this month
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-1">
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                  onClick={() => {
                    setMonth(dayjs().startOf('month'));
                    setSelectedDay(dayjs().format('YYYY-MM-DD'));
                  }}
                >
                  Today
                </button>
                <select
                  value={month.year()}
                  onChange={(e) => {
                    const y = Number(e.target.value);
                    setMonth((m) => m.year(y));
                    setSelectedDay(null);
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-medium text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  title="Jump to year — missing years fetch online once, then stay in DB"
                >
                  {Array.from({ length: 21 }, (_, i) => 2025 + i).map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                  onClick={() => {
                    setMonth((m) => m.add(1, 'month'));
                    setSelectedDay(null);
                  }}
                >
                  Next →
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 border-b border-slate-100 dark:border-slate-700 pb-3 text-xs text-slate-600 dark:text-slate-300">
              <LegendDot className="bg-emerald-500" label="Approved leave" />
              <LegendDot className="bg-amber-400" label="Pending leave" />
              <LegendDot
                className="bg-gradient-to-br from-rose-400 to-fuchsia-500"
                label="Public holiday"
              />
              <LegendDot className="ring-2 ring-indigo-500" label="Today" />
            </div>

            <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div key={d} className="py-1">
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-0.5 sm:gap-1 md:gap-1.5">
              {Array.from({ length: startPad }).map((_, i) => (
                <div
                  key={`pad-${i}`}
                  className="min-h-[3.25rem] rounded-lg bg-slate-50/60 dark:bg-slate-800/60 sm:min-h-[4.5rem] sm:rounded-xl md:min-h-[5.75rem]"
                />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = month.date(i + 1);
                const key = day.format('YYYY-MM-DD');
                const dayEvents = eventsByDay[key] || [];
                const dayPh = holidaysByDate[key] || [];
                const isHoliday = dayPh.length > 0;
                const isToday = day.isSame(dayjs(), 'day');
                const isWeekend = day.day() === 0 || day.day() === 6;
                const isSelected = selectedDay === key;

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedDay(key)}
                    className={[
                      'min-h-[3.25rem] rounded-lg border p-1 text-left transition sm:min-h-[4.5rem] sm:rounded-xl sm:p-1.5 md:min-h-[5.75rem]',
                      isSelected
                        ? 'border-indigo-400 bg-indigo-50 shadow-md ring-2 ring-indigo-300 dark:border-indigo-500 dark:bg-indigo-950 dark:ring-indigo-700'
                        : isHoliday
                          ? 'border-rose-200 bg-gradient-to-b from-rose-50 to-fuchsia-50 hover:border-rose-300 dark:border-rose-800 dark:from-rose-950/50 dark:to-fuchsia-950/40'
                          : isWeekend
                            ? 'border-slate-100 bg-slate-50 hover:border-slate-200 dark:border-slate-700 dark:bg-slate-800/80'
                            : 'border-slate-200 bg-white hover:border-indigo-200 hover:shadow-sm dark:border-slate-700 dark:bg-slate-900',
                      isToday && !isSelected
                        ? 'ring-2 ring-indigo-400 ring-offset-1 dark:ring-offset-slate-900'
                        : '',
                    ].join(' ')}
                  >
                    <div className="flex items-start justify-between gap-0.5">
                      <span
                        className={[
                          'flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold',
                          isToday
                            ? 'bg-indigo-600 text-white'
                            : isHoliday
                              ? 'text-rose-700 dark:text-rose-300'
                              : 'text-slate-700 dark:text-slate-200',
                        ].join(' ')}
                      >
                        {i + 1}
                      </span>
                      {isHoliday && (
                        <span className="flex flex-col items-end gap-0.5">
                          <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[9px] font-bold text-white dark:bg-rose-600">
                            PH
                          </span>
                          <span className="text-[9px] leading-none">
                            {dayPh.map((h) => FLAG[h.country_code] || h.country_code).join('')}
                          </span>
                        </span>
                      )}
                    </div>
                    {isHoliday && (
                      <p className="mt-0.5 hidden line-clamp-2 text-[10px] font-semibold leading-tight text-rose-800 dark:text-rose-200 sm:mt-1 sm:block">
                        {dayPh.map((h) => h.name).join(' · ')}
                      </p>
                    )}
                    <div className="mt-0.5 hidden space-y-0.5 sm:mt-1 sm:block">
                      {dayEvents.slice(0, isHoliday ? 1 : 2).map((ev) => (
                        <div
                          key={`${ev.id}-${key}`}
                          className={`truncate rounded-md px-1 py-0.5 text-[10px] font-medium ${statusClass(
                            ev.status
                          )}`}
                        >
                          {ev.applicant?.name?.split(' ')[0]}
                        </div>
                      ))}
                      {dayEvents.length > (isHoliday ? 1 : 2) && (
                        <p className="text-[9px] text-slate-400">
                          +{dayEvents.length - (isHoliday ? 1 : 2)} leave
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Detail box — full write-up */}
          <div className="space-y-4 lg:col-span-1 2xl:col-span-2">
            <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-3 shadow-sm sm:p-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Day details</h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {selectedDay
                  ? dayjs(selectedDay).format('dddd, D MMMM YYYY')
                  : 'Click a day on the calendar'}
              </p>

              {selectedDay && selectedHolidays.length === 0 && selectedEvents.length === 0 && (
                <p className="mt-4 rounded-lg bg-slate-50 dark:bg-slate-800 px-3 py-3 text-sm text-slate-600 dark:text-slate-300">
                  No public holiday and no team leave on this date for the current filters.
                </p>
              )}

              {selectedHolidays.length > 0 && (
                <div className="mt-3 space-y-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-rose-600 dark:text-rose-400">
                    Public holiday{selectedHolidays.length > 1 ? 's' : ''} (
                    {selectedHolidays.length} countr
                    {selectedHolidays.length > 1 ? 'ies' : 'y'})
                  </p>
                  {selectedHolidays.map((h) => (
                    <HolidayDetailCard key={`${h.date}-${h.country_code}`} holiday={h} />
                  ))}
                </div>
              )}

              {selectedEvents.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Team leave ({selectedEvents.length})
                  </p>
                  <ul className="space-y-2">
                    {selectedEvents.map((ev) => (
                      <li
                        key={ev.id}
                        className="rounded-lg border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm"
                      >
                        <p className="font-medium text-slate-900 dark:text-slate-50">{ev.applicant?.name}</p>
                        <p className="text-xs capitalize text-slate-500 dark:text-slate-400">
                          {ev.leave_type} · {ev.start_date} → {ev.end_date}
                        </p>
                        <div className="mt-1">
                          <StatusBadge status={ev.status} />
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* This month PH list — all countries (filtered) */}
            <div className="rounded-2xl border border-rose-100 bg-gradient-to-b from-rose-50 to-white dark:border-rose-900 dark:from-rose-950/50 dark:to-slate-900 p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-rose-900 dark:text-rose-100">
                  PH in {month.format('MMM YYYY')}
                </h3>
                <button
                  type="button"
                  onClick={() => setTab('holidays')}
                  className="text-xs font-medium text-rose-700 dark:text-rose-300 hover:underline"
                >
                  All countries list →
                </button>
              </div>
              {holidaysThisMonth.length === 0 ? (
                <p className="text-xs text-rose-800 dark:text-rose-200/70">
                  No public holidays this month for the selected filter.
                </p>
              ) : (
                <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
                  {holidaysThisMonth.map((h) => (
                    <li key={`${h.date}-${h.country_code}`}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDay(h.date);
                        }}
                        className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2 text-left shadow-sm transition ${
                          selectedDay === h.date
                            ? 'border-rose-400 bg-rose-50 ring-1 ring-rose-300 dark:border-rose-500 dark:bg-rose-950/50 dark:ring-rose-700'
                            : 'border-rose-100 bg-white hover:border-rose-300 dark:border-rose-900 dark:bg-slate-900 dark:hover:border-rose-700'
                        }`}
                      >
                        <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg bg-rose-500 text-white dark:bg-rose-600">
                          <span className="text-[9px] font-bold uppercase leading-none">
                            {dayjs(h.date).format('MMM')}
                          </span>
                          <span className="text-sm font-bold leading-tight">
                            {dayjs(h.date).format('D')}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">{h.name}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {FLAG[h.country_code]} {h.country_name || h.country_code} ·{' '}
                            {dayjs(h.date).format('dddd')}
                          </p>
                          {h.description && (
                            <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-slate-600 dark:text-slate-300">
                              {h.description}
                            </p>
                          )}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : tab === 'holidays' ? (
        <AllCountriesHolidayList
          year={month.year()}
          holidays={holidays}
          holidaysByCountry={holidaysByCountry}
          filter={countryFilter}
          onFilter={setCountryFilter}
          onYearChange={(y) => setMonth(dayjs(`${y}-01-01`))}
          onSelect={jumpToHoliday}
        />
      ) : (
        <HistoryTable history={history} />
      )}
    </div>
  );
}

function HolidayDetailCard({ holiday: h }) {
  return (
    <div className="overflow-hidden rounded-xl border border-rose-200 dark:border-rose-800 bg-white dark:bg-slate-900 shadow-sm">
      <div className="bg-gradient-to-r from-rose-500 to-fuchsia-600 px-3 py-2 text-white">
        <p className="text-[10px] font-bold uppercase tracking-wider opacity-90">
          Public holiday · {FLAG[h.country_code]} {h.country_name || h.country_code} (
          {h.country_code})
        </p>
        <p className="text-base font-bold leading-snug">{h.name}</p>
        <p className="text-xs opacity-90">{dayjs(h.date).format('dddd, D MMMM YYYY')}</p>
      </div>
      <div className="space-y-2 px-3 py-3 text-sm text-slate-700 dark:text-slate-200">
        <p className="leading-relaxed">
          {h.description ||
            `${h.name} is a public holiday in ${h.country_name || h.country_code}.`}
        </p>
        <div className="rounded-lg bg-slate-50 dark:bg-slate-800 px-2.5 py-2 text-xs text-slate-600 dark:text-slate-300">
          <p>
            <span className="font-semibold text-slate-800 dark:text-slate-100">Country: </span>
            {FLAG[h.country_code]} {h.country_name || h.country_code} ({h.country_code})
          </p>
          <p className="mt-1">
            <span className="font-semibold text-slate-800 dark:text-slate-100">Date: </span>
            {h.date}
          </p>
          <p className="mt-1">
            <span className="font-semibold text-slate-800 dark:text-slate-100">Leave impact: </span>
            Working-day leave counts exclude this date for employees whose country is{' '}
            {h.country_code}. It does not automatically block leave applications.
          </p>
        </div>
      </div>
    </div>
  );
}

function AllCountriesHolidayList({
  year,
  holidays,
  holidaysByCountry,
  filter,
  onFilter,
  onYearChange,
  onSelect,
}) {
  const codes =
    filter === 'ALL' ? Object.keys(holidaysByCountry) : [filter].filter(Boolean);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-100 dark:border-rose-900 bg-gradient-to-r from-rose-500 via-fuchsia-500 to-violet-600 px-5 py-5 text-white shadow-lg">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest opacity-90">
            Multi-country public holidays
          </p>
          <h2 className="mt-1 text-2xl font-bold">🌏 All 10 office countries · {year}</h2>
          <p className="mt-1 max-w-xl text-sm text-white/90">
            Complete public holiday list for China, Indonesia, Japan, Malaysia, Myanmar, New
            Zealand, Philippines, Singapore, Thailand, and Vietnam. Click any holiday to open
            it on the month grid with full details.
          </p>
          <p className="mt-2 text-xs font-medium text-white/80">
            Total: {holidays.length} holidays across{' '}
            {Object.keys(holidaysByCountry).filter((k) => (holidaysByCountry[k] || []).length)
              .length}{' '}
            countries
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onYearChange(year - 1)}
              className="rounded-lg bg-white/20 px-3 py-1.5 text-sm font-medium hover:bg-white/30"
            >
              ← {year - 1}
            </button>
            <button
              type="button"
              onClick={() => onYearChange(year + 1)}
              className="rounded-lg bg-white/20 px-3 py-1.5 text-sm font-medium hover:bg-white/30"
            >
              {year + 1} →
            </button>
          </div>
          <select
            value={filter}
            onChange={(e) => onFilter(e.target.value)}
            className="rounded-lg border-0 bg-white/20 px-3 py-1.5 text-sm font-medium text-white outline-none"
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code} className="text-slate-900 dark:text-slate-50">
                {c.flag} {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {codes.map((code) => {
          const list = holidaysByCountry[code] || [];
          const meta = COUNTRIES.find((c) => c.code === code) || {
            flag: FLAG[code],
            label: code,
          };
          return (
            <div
              key={code}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 shadow-sm"
            >
              <div className="border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-3">
                <h3 className="font-bold text-slate-900 dark:text-slate-50">
                  {meta.flag || FLAG[code]} {meta.label || code}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {list.length} public holiday{list.length === 1 ? '' : 's'} in {year}
                </p>
              </div>
              {list.length === 0 ? (
                <p className="p-4 text-sm text-slate-500 dark:text-slate-400">No holidays for this year.</p>
              ) : (
                <ul className="max-h-[32rem] divide-y divide-slate-50 dark:divide-slate-800 overflow-y-auto">
                  {list.map((h) => (
                    <li key={`${h.date}-${h.country_code}`}>
                      <button
                        type="button"
                        onClick={() => onSelect(h.date)}
                        className="w-full px-4 py-3 text-left transition hover:bg-rose-50 dark:bg-rose-950/40 dark:hover:bg-rose-950/40"
                      >
                        <div className="flex gap-3">
                          <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 to-fuchsia-600 text-white shadow">
                            <span className="text-[10px] font-bold uppercase leading-none">
                              {dayjs(h.date).format('MMM')}
                            </span>
                            <span className="text-lg font-bold leading-none">
                              {dayjs(h.date).format('D')}
                            </span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-slate-900 dark:text-slate-50">{h.name}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {dayjs(h.date).format('dddd, D MMMM YYYY')}
                            </p>
                            {h.description && (
                              <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                                {h.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HistoryTable({ history }) {
  if (!history.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-10 text-center text-sm text-slate-500 dark:text-slate-400">
        No leave history yet.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">Employee</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Dates</th>
              <th className="px-4 py-3">Days</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {history.map((h) => (
              <tr key={h.id} className="hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-800/80">
                <td className="px-4 py-3 font-medium">{h.applicant?.name}</td>
                <td className="px-4 py-3 capitalize text-slate-600 dark:text-slate-300">{h.leave_type}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                  {dayjs(h.start_date).format('DD MMM')} –{' '}
                  {dayjs(h.end_date).format('DD MMM YYYY')}
                </td>
                <td className="px-4 py-3">{h.days_count}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={h.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function statusClass(status) {
  if (status === 'approved') return 'bg-emerald-500 text-white';
  if (status === 'pending' || status === 'supervisor_approved')
    return 'bg-amber-400 text-amber-950';
  if (status === 'cancel_pending') return 'bg-orange-400 text-white';
  if (status === 'rejected') return 'bg-red-400 text-white';
  return 'bg-slate-300 text-slate-800 dark:text-slate-100';
}

function LegendDot({ className, label }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${className}`} />
      {label}
    </span>
  );
}
