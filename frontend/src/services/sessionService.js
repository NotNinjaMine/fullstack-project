// UC-25: session management & security log.
import api from "./api";

export const listSessions = () => api.get("/user/sessions").then((res) => res.data);

export const revokeSession = (id) =>
  api.put(`/user/sessions/${id}/revoke`).then((res) => res.data);

export const getSecurityLog = () => api.get("/user/security-log").then((res) => res.data);

// HR-only — offboarding support
export const unlockUser = (id) => api.put(`/user/${id}/unlock`).then((res) => res.data);
export const forceLogoutUser = (id) => api.put(`/user/${id}/force-logout`).then((res) => res.data);
