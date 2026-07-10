import api from './api';

/**
 * ENH-4: Leave balance + optional AI summary.
 * GET /api/leave/balance → { annual_balance, carried_forward, annual_entitlement,
 *   sick_balance, annual_used, ai_summary, year, ... }
 */
export const getLeaveBalance = async (year) => {
  const res = await api.get('/api/leave/balance', {
    params: year ? { year } : {},
  });
  return res.data.data;
};

export const applyLeave = async (leaveData) => {
  const res = await api.post('/api/leave', leaveData);
  return res.data.data;
};

export const getMyLeaves = async (params = {}) => {
  const res = await api.get('/api/leave', { params });
  return res.data.data;
};

export const getLeaveById = async (id) => {
  const res = await api.get(`/api/leave/${id}`);
  return res.data.data;
};

export const cancelLeave = async (id, reason) => {
  const res = await api.post(`/api/leave/${id}/cancel`, { reason });
  return res.data.data;
};

export const checkOverlap = async (start_date, end_date) => {
  const res = await api.get('/api/leave/overlap', {
    params: { start_date, end_date },
  });
  return res.data.data;
};
