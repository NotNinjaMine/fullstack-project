import api from "./api";

export const getMyLeave = () => api.get("/leave/mine").then((res) => res.data);

export const applyLeave = (payload) =>
  api.post("/leave/apply", payload).then((res) => res.data);

export const cancelLeave = (id) => api.put(`/leave/${id}/cancel`).then((res) => res.data);

// AI-2 coverage/overlap check for a proposed date range (UC-01, UC-07)
export const checkOverlap = (startDate, endDate) =>
  api.post("/leave/coverage-check", { startDate, endDate }).then((res) => res.data);
