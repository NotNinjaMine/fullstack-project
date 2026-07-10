import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { canAccessApprovals } from '../../utils/constants';

const baseLink =
  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition min-h-[2.75rem]';
const activeLink =
  'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200';
const idleLink =
  'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-50';

/** Short labels for bottom nav */
const SHORT = {
  '/': 'Home',
  '/leave/apply': 'Apply',
  '/leave': 'History',
  '/profile': 'Profile',
  '/company': 'Company',
  '/approvals': 'Queue',
  '/approvals/calendar': 'Calendar',
  '/approvals/delegations': 'Delegate',
  '/notifications': 'Alerts',
};

const ICONS = {
  '/': '⌂',
  '/leave/apply': '＋',
  '/leave': '☰',
  '/profile': '☺',
  '/company': '◎',
  '/approvals': '☑',
  '/approvals/calendar': '▦',
  '/approvals/delegations': '⇄',
  '/notifications': '🔔',
};

export default function Sidebar() {
  const { user } = useAuth();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  const showApprovals = canAccessApprovals(user?.role);
  const showApproverTools =
    showApprovals || user?.role === 'employee' || user?.role === 'hr_admin';

  const links = [
    { to: '/', label: 'Dashboard', end: true },
    { to: '/leave/apply', label: 'Apply Leave' },
    { to: '/leave', label: 'My Leave History' },
    { to: '/profile', label: 'My Profile' },
    { to: '/company', label: 'Company & Offices' },
    ...(showApproverTools
      ? [
          { to: '/approvals', label: 'Approval Queue' },
          { to: '/approvals/calendar', label: 'Team Calendar' },
          { to: '/approvals/delegations', label: 'Delegations' },
        ]
      : []),
    { to: '/notifications', label: 'Notifications' },
  ];

  // Primary bottom-nav slots (phone / narrow tablet) — rest in "More"
  const orderedPrimary = [];
  for (const p of ['/', '/leave/apply', '/leave', '/profile']) {
    const found = links.find((l) => l.to === p);
    if (found) orderedPrimary.push(found);
  }
  if (orderedPrimary.length < 4) {
    links.forEach((l) => {
      if (orderedPrimary.length < 4 && !orderedPrimary.find((x) => x.to === l.to)) {
        orderedPrimary.push(l);
      }
    });
  }

  const isActivePath = (to, end) => {
    if (end) return location.pathname === to;
    return location.pathname === to || location.pathname.startsWith(`${to}/`);
  };

  return (
    <>
      {/* Desktop / large tablet side rail — ENH-6: persistent on md/lg+ */}
      <aside
        className={[
          'hidden shrink-0 border-r border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900',
          'md:block md:w-52 lg:w-56 xl:w-60 2xl:w-64',
          'md:sticky md:top-16 md:self-start md:max-h-[calc(100dvh-4rem)] md:overflow-y-auto',
        ].join(' ')}
      >
        <nav className="flex flex-col gap-0.5 p-3 lg:p-4" aria-label="Main">
          <p className="mb-2 hidden px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 xl:block">
            Navigation
          </p>
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `${baseLink} ${isActive ? activeLink : idleLink}`
              }
            >
              <span className="w-5 text-center text-base opacity-70" aria-hidden>
                {ICONS[link.to] || '•'}
              </span>
              <span className="truncate">{link.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Phone / small tablet bottom bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden safe-pb dark:border-slate-700 dark:bg-slate-900/95"
        aria-label="Mobile"
      >
        <div className="flex items-stretch justify-around px-1 pt-1">
          {orderedPrimary.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              onClick={() => setMoreOpen(false)}
              className={({ isActive }) =>
                `flex min-h-[3.25rem] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-0.5 text-[10px] font-medium sm:text-[11px] ${
                  isActive
                    ? 'text-indigo-600 dark:text-indigo-300'
                    : 'text-slate-500 dark:text-slate-400'
                }`
              }
            >
              <span className="text-base leading-none" aria-hidden>
                {ICONS[link.to] || '•'}
              </span>
              <span className="max-w-full truncate">
                {SHORT[link.to] || link.label}
              </span>
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => setMoreOpen((o) => !o)}
            className={`flex min-h-[3.25rem] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-0.5 text-[10px] font-medium sm:text-[11px] ${
              moreOpen ||
              links.some(
                (l) =>
                  !orderedPrimary.find((p) => p.to === l.to) &&
                  isActivePath(l.to, l.end)
              )
                ? 'text-indigo-600 dark:text-indigo-300'
                : 'text-slate-500 dark:text-slate-400'
            }`}
            aria-expanded={moreOpen}
            aria-label="More navigation"
          >
            <span className="text-base leading-none" aria-hidden>
              ···
            </span>
            <span>More</span>
          </button>
        </div>
      </nav>

      {/* Mobile "More" sheet — full nav for small screens */}
      {moreOpen && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40"
            aria-label="Close menu"
            onClick={() => setMoreOpen(false)}
          />
          <div className="absolute bottom-0 left-0 right-0 max-h-[75dvh] overflow-y-auto rounded-t-2xl bg-white p-4 shadow-2xl safe-pb dark:bg-slate-900">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                All sections
              </p>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="touch-target rounded-lg px-3 text-sm text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Close
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {links.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.end}
                  onClick={() => setMoreOpen(false)}
                  className={({ isActive }) =>
                    `flex min-h-[3.5rem] flex-col items-center justify-center gap-1 rounded-xl border px-2 py-3 text-center text-xs font-medium ${
                      isActive
                        ? 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-200'
                        : 'border-slate-100 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                    }`
                  }
                >
                  <span className="text-lg" aria-hidden>
                    {ICONS[link.to] || '•'}
                  </span>
                  {link.label}
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
