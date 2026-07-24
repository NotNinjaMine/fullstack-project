import axios from "axios";
import { installMockApi } from "../mocks/server";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
});

// Mock the API by default so the client runs standalone. Member 1's real
// backend (../backend) implements the M1 endpoints; set VITE_USE_MOCK_API=false
// to use it. Other verticals' endpoints (/leave, /holiday, /ai) still need the
// mock until their backends are assembled — see .env.example.
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

// Auto-logout on 401 (expired/invalid token) — but not for the login request
// itself, since bad credentials also respond 401 and should surface as an
// inline form error instead.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isLoginRequest = error.config?.url?.includes("/user/login");
    if (error.response && error.response.status === 401 && !isLoginRequest) {
      // Only drop the session token — see AuthContext's logout for why
      // localStorage.clear() would be wrong here too.
      localStorage.removeItem("accessToken");
      window.location = "/login";
    }
    return Promise.reject(error);
  }
);

export default api;
