import toast from 'react-hot-toast';
import NotificationList from '../components/notifications/NotificationList';
import { useNotifications } from '../hooks/useNotifications';

export default function NotificationsPage() {
  const { unreadCount, markAllRead, fetchNotifications, loading } = useNotifications();

  const handleMarkAll = async () => {
    try {
      await markAllRead();
      toast.success('All notifications marked as read');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="page-title">Notifications</h1>
          <p className="page-subtitle mt-1">
            {unreadCount} unread · {loading ? 'Refreshing...' : 'Up to date'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={fetchNotifications}
            className="touch-target rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Refresh
          </button>
          <button
            type="button"
            disabled={unreadCount === 0}
            onClick={handleMarkAll}
            className="touch-target rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            Mark all read
          </button>
        </div>
      </div>
      <NotificationList />
    </div>
  );
}
