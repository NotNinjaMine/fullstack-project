import api from "./api";

export const login = (email, password) =>
  api.post("/user/login", { email, password }).then((res) => res.data);

export const verifyOtp = (otpToken, code) =>
  api.post("/user/verify-otp", { otpToken, code }).then((res) => res.data);

export const resendOtp = (otpToken) =>
  api.post("/user/resend-otp", { otpToken }).then((res) => res.data);

export const getMe = () => api.get("/user/auth").then((res) => res.data.user);
