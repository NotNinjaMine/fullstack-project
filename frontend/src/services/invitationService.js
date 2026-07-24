// UC-24: new-employee invitation & onboarding flow.
import api from "./api";

// HR Admin only
export const listInvitations = () => api.get("/invitation").then((res) => res.data);

export const sendInvitation = (payload) =>
  api.post("/invitation", payload).then((res) => res.data);

// Public — used before the invitee has an account/session
export const verifyInvitation = (token) =>
  api.get(`/invitation/verify?token=${encodeURIComponent(token)}`).then((res) => res.data);

export const acceptInvitation = (payload) =>
  api.post("/invitation/accept", payload).then((res) => res.data);
