import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "./context/AuthContext";
import useAuth from "./hooks/useAuth";
import ProtectedRoute from "./components/common/ProtectedRoute";
import Navbar from "./components/common/Navbar";
import Sidebar from "./components/common/Sidebar";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import LeaveApplyPage from "./pages/LeaveApplyPage";
import LeaveHistoryPage from "./pages/LeaveHistoryPage";
import CalendarPage from "./pages/CalendarPage";

function AppShell({ children }) {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      <Navbar />
      <div className="max-w-6xl mx-auto flex gap-6 px-4 py-6">
        <Sidebar />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}

// Approval Queue and Admin UI (UC-02, UC-10) are owned by Member 2's build.
// This module only covers the Employee Experience (UC-01, UC-03, UC-08, UC-09).
function NonEmployeeNotice() {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-sm p-8 max-w-md text-center">
        <p className="text-sm text-slate-500 mb-2">Signed in as</p>
        <p className="font-semibold text-lg">
          {user.name} · {user.role}
        </p>
        <p className="text-sm text-slate-500 mt-4">
          The Approval Queue and HR Admin panel for this role live in Member 2's build. This
          module covers the Employee Experience only.
        </p>
        <button
          onClick={logout}
          className="mt-5 text-sm bg-teal-800 hover:bg-teal-700 text-white rounded-lg px-4 py-2"
        >
          Log out
        </button>
      </div>
    </div>
  );
}

function EmployeeArea() {
  const { user } = useAuth();

  if (user.role !== "EMPLOYEE") return <NonEmployeeNotice />;

  return (
    <AppShell>
      <Routes>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/apply" element={<LeaveApplyPage />} />
        <Route path="/history" element={<LeaveHistoryPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AppShell>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="bottom-center" />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <EmployeeArea />
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
