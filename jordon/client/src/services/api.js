import axios from "axios";
import { installMockApi } from "../mocks/server";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
});

// No backend yet — mock the API so the Employee Experience is testable end to end.
// Set VITE_USE_MOCK_API=false once Members 3/4's Express server is available.
if (import.meta.env.VITE_USE_MOCK_API !== "false") {
  installMockApi(api);
}

// Attach the JWT on every request
api.interceptors.request.use(
  (config) => {
    const accessToken = localStorage.getItem("accessToken");
    if (accessToken) {
      config.headers["Authorization"] = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Auto-logout on 401 (expired/invalid token) — but not for the pre-session
// auth flow (login + OTP verify/resend), since bad credentials or a wrong
// code also respond 401 and should surface as an inline form error instead.
const AUTH_FLOW_PATHS = ["/user/login", "/user/verify-otp", "/user/resend-otp"];

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isAuthFlowRequest = AUTH_FLOW_PATHS.some((p) => error.config?.url?.includes(p));
    if (error.response && error.response.status === 401 && !isAuthFlowRequest) {
      localStorage.clear();
      window.location = "/login";
    }
    return Promise.reject(error);
  }
);

export default api;
