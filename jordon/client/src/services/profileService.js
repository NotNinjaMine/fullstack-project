// UC-23: employee self-service profile, password change, and notification
// preferences / locale.
import api from "./api";

export const getProfile = () => api.get("/user/profile").then((res) => res.data);

export const updateProfile = (patch) =>
  api.put("/user/profile", patch).then((res) => res.data);

export const changePassword = (currentPassword, newPassword) =>
  api.put("/user/password", { currentPassword, newPassword }).then((res) => res.data);
