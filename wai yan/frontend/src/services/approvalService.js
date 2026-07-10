import api from './api';

export const getPendingApprovals = async (params = {}) => {
  const res = await api.get('/api/approvals', { params });
  return res.data.data;
};

export const approveRequest = async (id, note = '') => {
  const res = await api.put(`/api/approvals/${id}/approve`, { note });
  return res.data.data;
};

export const rejectRequest = async (id, note) => {
  const res = await api.put(`/api/approvals/${id}/reject`, { note });
  return res.data.data;
};

/** UC-08 */
export const getApproverCalendar = async (start_date, end_date) => {
  const res = await api.get('/api/approvals/calendar', {
    params: { start_date, end_date },
  });
  return res.data.data;
};

/** UC-08 */
export const getApproverHistory = async (params = {}) => {
  const res = await api.get('/api/approvals/history', { params });
  return res.data.data;
};

/** UC-16 */
export const bulkAction = async ({ action, ids, note }) => {
  const res = await api.post('/api/approvals/bulk', { action, ids, note });
  return res.data.data;
};

/** UC-15 */
export const listDelegations = async () => {
  const res = await api.get('/api/approvals/delegations');
  return res.data.data;
};

export const createDelegation = async (payload) => {
  const res = await api.post('/api/approvals/delegations', payload);
  return res.data.data;
};

export const revokeDelegation = async (id) => {
  const res = await api.delete(`/api/approvals/delegations/${id}`);
  return res.data.data;
};
