import { Navigate } from "react-router-dom";
import useAuth from "../../hooks/useAuth";
import LoadingSpinner from "./LoadingSpinner";

// Redirects unauthenticated users to /login (UC-01 precondition)
export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) return <LoadingSpinner full />;
  if (!user) return <Navigate to="/login" replace />;

  return children;
}
