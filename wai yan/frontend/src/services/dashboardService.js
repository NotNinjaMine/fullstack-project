import api from './api';

export const getDashboardSummary = async () => {
  const res = await api.get('/api/dashboard/summary');
  return res.data.data;
};

export const getMyBalance = async (year) => {
  const res = await api.get('/api/dashboard/balance', {
    params: year ? { year } : {},
  });
  return res.data.data;
};

export const getWhosAway = async (params = {}) => {
  const res = await api.get('/api/dashboard/whos-away', { params });
  return res.data.data;
};

/**
 * Public holidays for a year (DB cache; online fetch only if missing).
 * Returns holiday array. Pass withMeta:true for { holidays, meta }.
 */
export const getHolidays = async (params = {}, { withMeta = false } = {}) => {
  const res = await api.get('/api/dashboard/holidays', { params });
  const data = res.data.data;
  // New shape: { holidays, meta } · legacy: bare array
  if (Array.isArray(data)) {
    return withMeta ? { holidays: data, meta: null } : data;
  }
  const holidays = data?.holidays || [];
  return withMeta ? { holidays, meta: data?.meta || null } : holidays;
};

export const getCompany = async (params = {}) => {
  const res = await api.get('/api/dashboard/company', { params });
  return res.data.data;
};

/** HR only: update company-level fields */
export const updateCompany = async (fields) => {
  const res = await api.put('/api/dashboard/company', fields);
  return res.data.data;
};

/** HR only: save one office (create or update by country code) */
export const upsertOffice = async (code, office) => {
  const res = await api.put(`/api/dashboard/company/offices/${code}`, office);
  return res.data.data;
};

/** HR only: delete office */
export const deleteOffice = async (code) => {
  const res = await api.delete(`/api/dashboard/company/offices/${code}`);
  return res.data.data;
};

/** HR only: replace full offices list */
export const replaceOffices = async (offices) => {
  const res = await api.put('/api/dashboard/company/offices', { offices });
  return res.data.data;
};

/** Download helper for CSV endpoints (uses token). */
export async function downloadCsv(path, filename) {
  const base = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  const token = localStorage.getItem('accessToken');
  const res = await fetch(`${base}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Export failed');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const exportMyLeaveCsv = () =>
  downloadCsv('/api/dashboard/export/my-leave.csv', 'my-leave-history.csv');

export const exportApprovalsCsv = () =>
  downloadCsv('/api/dashboard/export/approvals.csv', 'approvals-export.csv');

export const exportSummaryCsv = () =>
  downloadCsv('/api/dashboard/export/summary.csv', 'dashboard-summary.csv');

export const exportWhosAwayCsv = (params = {}) => {
  const q = new URLSearchParams(params).toString();
  const path = q
    ? `/api/dashboard/export/whos-away.csv?${q}`
    : '/api/dashboard/export/whos-away.csv';
  return downloadCsv(path, 'whos-away.csv');
};
