import api from './api';

/** Update the contact fields an employee may manage directly. */
export const updateProfile = async (fields) => {
  const res = await api.put('/api/users/profile', fields);
  const user = res.data.data;
  localStorage.setItem('user', JSON.stringify(user));
  return user;
};
