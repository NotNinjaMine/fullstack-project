import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../hooks/useAuth';

const DEMO_USERS = [
  { email: 'alice.tan@company.com', label: 'Employee (Alice)' },
  { email: 'bob.supervisor@company.com', label: 'Supervisor (Bob)' },
  { email: 'carol.manager@company.com', label: 'Manager (Carol)' },
  { email: 'hr.admin@company.com', label: 'HR Admin' },
];

export default function LoginPage() {
  const { login, isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('alice.tan@company.com');
  const [password, setPassword] = useState('Password123!');
  const [submitting, setSubmitting] = useState(false);

  if (!loading && isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login(email, password);
      toast.success('Welcome back');
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen min-h-dvh items-center justify-center bg-gradient-to-br from-slate-100 via-indigo-50 to-slate-100 p-3 safe-px safe-pt safe-pb dark:from-slate-950 dark:via-indigo-950 dark:to-slate-950 sm:p-6 lg:p-8">
      <div className="grid w-full max-w-md gap-6 lg:max-w-4xl lg:grid-cols-2 lg:items-stretch xl:max-w-5xl">
        {/* Brand panel — tablet+ / large screens */}
        <div className="hidden rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-700 p-8 text-white shadow-lg lg:flex lg:flex-col lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-white/80">
              Apex Global Solutions
            </p>
            <h1 className="mt-3 text-3xl font-bold leading-tight xl:text-4xl">
              Leave Manager
            </h1>
            <p className="mt-3 text-sm text-white/90 xl:text-base">
              Multi-office HR leave for ~60 staff across 10 APAC countries. Works on phone,
              tablet, laptop, and large desktop monitors.
            </p>
          </div>
          <ul className="mt-8 space-y-2 text-sm text-white/85">
            <li>· Two-tier supervisor + manager approval</li>
            <li>· Public holidays by country (on-demand)</li>
            <li>· Responsive for every screen size + dark mode</li>
          </ul>
        </div>

        <div className="w-full rounded-2xl border border-slate-200 bg-white p-5 shadow-lg dark:border-slate-700 dark:bg-slate-900 sm:p-8">
          <div className="mb-6 text-center lg:text-left">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-lg font-bold text-white lg:mx-0">
              HR
            </div>
            <h1 className="page-title">Leave Manager</h1>
            <p className="page-subtitle mt-1">Sign in to manage leave & approvals</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="min-h-[2.75rem] w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 outline-none ring-indigo-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
            <div>
              <label
                htmlFor="password"
                className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="min-h-[2.75rem] w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 outline-none ring-indigo-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="touch-target w-full rounded-lg bg-indigo-600 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {submitting ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <div className="mt-6 border-t border-slate-100 pt-4 dark:border-slate-700">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
              Demo accounts (password: Password123!)
            </p>
            <div className="flex flex-wrap gap-2">
              {DEMO_USERS.map((u) => (
                <button
                  key={u.email}
                  type="button"
                  onClick={() => {
                    setEmail(u.email);
                    setPassword('Password123!');
                  }}
                  className="min-h-[2.25rem] rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  {u.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
