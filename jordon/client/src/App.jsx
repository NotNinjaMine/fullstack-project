import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "./context/AuthContext";
import useAuth from "./hooks/useAuth";
import ProtectedRoute from "./components/common/ProtectedRoute";
import Navbar from "./components/common/Navbar";
import Sidebar from "./components/common/Sidebar";
import AnnouncementBanner from "./components/common/AnnouncementBanner";
import OwnedByNotice from "./components/common/OwnedByNotice";
import { ROLE_HOME } from "./lib/nav";

import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import DashboardPage from "./pages/DashboardPage";
import LeaveApplyPage from "./pages/LeaveApplyPage";
import LeaveHistoryPage from "./pages/LeaveHistoryPage";
import CalendarPage from "./pages/CalendarPage";
import ProfilePage from "./pages/ProfilePage";
import SecurityPage from "./pages/SecurityPage";
import AnnouncementsAdminPage from "./pages/AnnouncementsAdminPage";
import InvitationsPage from "./pages/InvitationsPage";
import EntitlementsPage from "./pages/EntitlementsPage";
import HRAdminHomePage from "./pages/HRAdminHomePage";

function AppShell({ children }) {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      <Navbar />
      <AnnouncementBanner />
      <div className="max-w-6xl mx-auto flex gap-6 px-4 py-6">
        <Sidebar />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}

// Sends an authenticated user to their role's default landing page — used
// for "/" and any unmatched path so every role always has somewhere to go.
function RoleHomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={ROLE_HOME[user.role] ?? "/profile"} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="bottom-center" />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <AppShell>
                  <Routes>
                    {/* Member 1 — available to every role */}
                    <Route path="/profile" element={<ProfilePage />} />
                    <Route path="/security" element={<SecurityPage />} />

                    {/* Employee Experience vertical */}
                    <Route
                      path="/dashboard"
                      element={
                        <ProtectedRoute roles={["EMPLOYEE"]}>
                          <DashboardPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/apply"
                      element={
                        <ProtectedRoute roles={["EMPLOYEE"]}>
                          <LeaveApplyPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/history"
                      element={
                        <ProtectedRoute roles={["EMPLOYEE"]}>
                          <LeaveHistoryPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/calendar"
                      element={
                        <ProtectedRoute roles={["EMPLOYEE"]}>
                          <CalendarPage />
                        </ProtectedRoute>
                      }
                    />

                    {/* Approval, Delegation & Notification vertical */}
                    <Route
                      path="/approvals"
                      element={
                        <ProtectedRoute roles={["SUPERVISOR", "MANAGER"]}>
                          <OwnedByNotice
                            title="Approval queue"
                            description="The Supervisor/Manager approval queue and AI-3 summary cards live in the Approval, Delegation & Notification vertical."
                          />
                        </ProtectedRoute>
                      }
                    />

                    {/* HR Admin, Analytics & Automation vertical + Member 1's HR-facing screens */}
                    <Route
                      path="/admin"
                      element={
                        <ProtectedRoute roles={["HR_ADMIN"]}>
                          <HRAdminHomePage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/invitations"
                      element={
                        <ProtectedRoute roles={["HR_ADMIN"]}>
                          <InvitationsPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/announcements"
                      element={
                        <ProtectedRoute roles={["HR_ADMIN"]}>
                          <AnnouncementsAdminPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/entitlements"
                      element={
                        <ProtectedRoute roles={["HR_ADMIN"]}>
                          <EntitlementsPage />
                        </ProtectedRoute>
                      }
                    />

                    <Route path="/" element={<RoleHomeRedirect />} />
                    <Route path="*" element={<RoleHomeRedirect />} />
                  </Routes>
                </AppShell>
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
