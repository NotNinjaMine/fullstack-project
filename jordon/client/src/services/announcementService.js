// UC-26: system announcements & maintenance broadcasts.
import api from "./api";

// All roles
export const getActiveAnnouncements = () =>
  api.get("/announcement/active").then((res) => res.data);

export const ackAnnouncement = (id) =>
  api.post(`/announcement/${id}/ack`).then((res) => res.data);

// HR Admin only
export const listAnnouncements = () => api.get("/announcement").then((res) => res.data);

export const createAnnouncement = (payload) =>
  api.post("/announcement", payload).then((res) => res.data);

export const deactivateAnnouncement = (id) =>
  api.put(`/announcement/${id}/deactivate`).then((res) => res.data);
