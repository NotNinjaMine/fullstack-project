import { Navigate } from "react-router-dom";
import useAuth from "../../hooks/useAuth";
import LoadingSpinner from "./LoadingSpinner";

// Redirects unauthenticated users to /login (UC-01 precondition).
// Pass `roles` to additionally enforce RBAC on a specific route (UC-08/UC-09
// shared shell + role-based routing) — server-side RBAC is still the real
// gate once a backend exists; this only hides/blocks in the UI.
export default function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();

  if (loading) return <LoadingSpinner full />;
  if (!user) return <Navigate to="/login" replace />;

  if (roles && !roles.includes(user.role)) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-8 max-w-md text-center mx-auto">
        <p className="text-3xl mb-2">🔒</p>
        <p className="font-semibold text-slate-700">Not authorised</p>
        <p className="text-sm text-slate-500 mt-2">
          Your role ({user.role}) does not have access to this page.
        </p>
      </div>
    );
  }

  return children;
}
