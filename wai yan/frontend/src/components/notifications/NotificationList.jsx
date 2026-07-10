import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { Link } from 'react-router-dom';
import { useNotifications } from '../../hooks/useNotifications';

dayjs.extend(relativeTime);

export default function NotificationList({ limit }) {
  const { notifications, markRead, loading } = useNotifications();
  const items = limit ? notifications.slice(0, limit) : notifications;

  if (loading && items.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
        Loading notifications...
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
          No notifications yet
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          You will see leave and approval updates here.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-700 dark:bg-slate-900">
      {items.map((n) => (
        <li
          key={n.id}
          className={`flex items-start gap-3 px-4 py-3 transition ${
            n.read_flag
              ? 'bg-white dark:bg-slate-900'
              : 'bg-indigo-50/50 dark:bg-indigo-950/40'
          }`}
        >
          <div
            className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
              n.read_flag ? 'bg-slate-300 dark:bg-slate-600' : 'bg-indigo-500'
            }`}
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-slate-800 dark:text-slate-100">{n.message}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium uppercase tracking-wide dark:bg-slate-800 dark:text-slate-300">
                {n.type}
              </span>
              <span>{dayjs(n.created_at).fromNow()}</span>
              {n.leave_request_id && (
                <Link
                  to={`/leave/${n.leave_request_id}`}
                  className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                  onClick={() => {
                    if (!n.read_flag) markRead(n.id);
                  }}
                >
                  View request
                </Link>
              )}
            </div>
          </div>
          {!n.read_flag && (
            <button
              type="button"
              onClick={() => markRead(n.id)}
              className="shrink-0 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            >
              Mark read
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
