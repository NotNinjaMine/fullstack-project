import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { getMe } from "../services/authService";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore session from stored JWT
  useEffect(() => {
    if (localStorage.getItem("accessToken")) {
      getMe()
        .then(setUser)
        .catch(() => localStorage.clear())
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const loginUser = useCallback((accessToken, userObj) => {
    localStorage.setItem("accessToken", accessToken);
    setUser(userObj);
  }, []);

  const logout = useCallback(() => {
    // Only drop the session token — localStorage.clear() would also wipe the
    // mock API's persisted fixtures (invitations, sessions, announcements,
    // users, requests), breaking any multi-user demo flow across a logout.
    localStorage.removeItem("accessToken");
    setUser(null);
  }, []);

  // Merges a partial user update (e.g. after PUT /user/profile) into the
  // session without a round-trip refetch — used by the Profile page (UC-23)
  // and the Navbar's locale switcher.
  const updateUser = useCallback((patch) => {
    setUser((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, loginUser, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthContext must be used within AuthProvider");
  return ctx;
}
