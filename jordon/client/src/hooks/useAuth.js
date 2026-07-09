import { useAuthContext } from "../context/AuthContext";

export default function useAuth() {
  const { user, loading, loginUser, logout } = useAuthContext();
  return { user, loading, isAuthenticated: !!user, loginUser, logout };
}
