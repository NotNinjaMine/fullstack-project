import api from './api';

export const login = async (email, password) => {
  const res = await api.post('/api/auth/login', { email, password });
  const { token, user } = res.data.data;
  localStorage.setItem('accessToken', token);
  localStorage.setItem('user', JSON.stringify(user));
  return user;
};

export const getCurrentUser = async () => {
  const res = await api.get('/api/auth/me');
  return res.data.data;
};

/**
 * Update own editable profile fields.
 * Prefers ENH-1 endpoint PUT /api/users/profile; falls back to PUT /api/auth/me.
 */
export const updateProfile = async (fields) => {
  try {
    const res = await api.put('/api/users/profile', fields);
    const user = res.data.data;
    localStorage.setItem('user', JSON.stringify(user));
    return user;
  } catch (err) {
    if (err.response?.status === 404) {
      const res = await api.put('/api/auth/me', fields);
      const user = res.data.data;
      localStorage.setItem('user', JSON.stringify(user));
      return user;
    }
    throw err;
  }
};

/**
 * Staff directory suggestions for apply-leave autocomplete.
 * @param {string} q
 * @param {number} [limit]
 */
export const searchStaff = async (q, limit = 12) => {
  if (!q || !String(q).trim()) return [];
  const res = await api.get('/api/auth/staff', {
    params: { q: String(q).trim(), limit },
  });
  return res.data.data || [];
};

export const logout = () => {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('user');
};
