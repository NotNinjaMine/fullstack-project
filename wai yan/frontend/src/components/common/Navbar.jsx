import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../hooks/useTheme';
import { formatRole } from '../../utils/constants';
import NotificationBell from '../notifications/NotificationBell';

export default function Navbar() {
  const { user, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur safe-pt supports-[backdrop-filter]:bg-white/90 dark:border-slate-700 dark:bg-slate-900/95 dark:supports-[backdrop-filter]:bg-slate-900/90">
      <div
        className={[
          'page-shell flex h-14 items-center justify-between gap-2 sm:h-16',
          'px-3 sm:px-5 md:px-6 xl:px-8 2xl:px-10 3xl:px-12',
          'safe-px',
        ].join(' ')}
      >
        <Link to="/" className="flex min-w-0 items-center gap-2 sm:gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white sm:h-10 sm:w-10">
            HR
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50 sm:text-base">
              Leave Manager
            </p>
            <p className="hidden truncate text-xs text-slate-500 dark:text-slate-400 sm:block">
              SCCCI · Apex Global Solutions
            </p>
          </div>
        </Link>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2 md:gap-3">
          {/* ENH-7e: Dark mode toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            className="touch-target inline-flex items-center justify-center rounded-lg border border-slate-200 px-2.5 text-sm text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            title={isDark ? 'Light mode' : 'Dark mode'}
          >
            <span className="text-base leading-none" aria-hidden>
              {isDark ? '☀️' : '🌙'}
            </span>
            <span className="ml-1.5 hidden text-xs font-medium lg:inline">
              {isDark ? 'Light' : 'Dark'}
            </span>
          </button>

          <NotificationBell />

          <Link
            to="/profile"
            className="hidden max-w-[10rem] text-right md:block lg:max-w-[14rem] xl:max-w-none"
            title="Edit profile"
          >
            <p className="truncate text-sm font-medium text-slate-900 hover:text-indigo-600 dark:text-slate-100 dark:hover:text-indigo-300">
              {user?.name}
            </p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              {[formatRole(user?.role), user?.office_branch || user?.country_code]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </Link>

          {/* Avatar initial on phone / small tablet → profile */}
          <Link
            to="/profile"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 md:hidden dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-indigo-950"
            title={user?.name || 'Profile'}
            aria-label="Open profile"
          >
            {(user?.name || '?')
              .split(' ')
              .map((p) => p[0])
              .slice(0, 2)
              .join('')
              .toUpperCase()}
          </Link>

          <button
            type="button"
            onClick={logout}
            className="touch-target rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800 sm:px-3 sm:text-sm"
          >
            <span className="sm:hidden">Out</span>
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </div>
    </header>
  );
}
