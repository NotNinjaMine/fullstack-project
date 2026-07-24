import api from "./api";

export const login = (email, password) =>
  api.post("/user/login", { email, password }).then((res) => res.data);

export const getMe = () => api.get("/user/auth").then((res) => res.data.user);

// UC-23: forgot / reset password (public, no auth header required)
export const forgotPassword = (email) =>
  api.post("/user/forgot-password", { email }).then((res) => res.data);

export const resetPassword = (token, password) =>
  api.post("/user/reset-password", { token, password }).then((res) => res.data);
