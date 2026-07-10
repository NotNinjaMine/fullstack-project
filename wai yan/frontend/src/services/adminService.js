import api from './api';

export const loadHolidays = async ({ country_code, year_from, year_to }) => {
  const res = await api.post('/api/admin/holidays/load', {
    country_code,
    year_from: Number(year_from),
    year_to: Number(year_to),
  });
  return res.data.data;
};
