import api from './api';

export const getNotifications = async (unreadOnly = false) => {
  const params = unreadOnly ? { unread: 'true' } : {};
  const res = await api.get('/api/notifications', { params });
  return res.data.data;
};

export const markNotificationRead = async (id) => {
  const res = await api.put(`/api/notifications/${id}/read`);
  return res.data.data;
};

export const markAllNotificationsRead = async () => {
  const res = await api.put('/api/notifications/read-all');
  return res.data.data;
};
