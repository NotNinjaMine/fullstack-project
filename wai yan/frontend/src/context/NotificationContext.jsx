import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import * as notificationService from '../services/notificationService';
import { AuthContext } from './AuthContextValue';
import { NotificationContext } from './NotificationContextValue';


export function NotificationProvider({ children }) {
  const auth = useContext(AuthContext);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!auth?.isAuthenticated) {
      setNotifications([]);
      return;
    }
    setLoading(true);
    try {
      const data = await notificationService.getNotifications(false);
      setNotifications(Array.isArray(data) ? data : []);
    } catch {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, [auth?.isAuthenticated]);

  useEffect(() => {
    fetchNotifications();
    if (!auth?.isAuthenticated) return undefined;
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [auth?.isAuthenticated, fetchNotifications]);

  const markRead = useCallback(async (id) => {
    await notificationService.markNotificationRead(id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read_flag: true } : n))
    );
  }, []);

  const markAllRead = useCallback(async () => {
    await notificationService.markAllNotificationsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, read_flag: true })));
  }, []);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read_flag).length,
    [notifications]
  );

  const value = useMemo(
    () => ({
      notifications,
      unreadCount,
      loading,
      fetchNotifications,
      markRead,
      markAllRead,
    }),
    [notifications, unreadCount, loading, fetchNotifications, markRead, markAllRead]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}
