import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './context/AuthContext'
import { NotificationProvider } from './context/NotificationContext'
import { ThemeProvider } from './context/ThemeContext'
import Layout from './components/Layout'
import ProtectedRoute from './components/common/ProtectedRoute'
import LoginPage from './pages/LoginPage'
import Dashboard from './pages/Dashboard'
import ApplyLeave from './pages/ApplyLeave'
import LeaveHistory from './pages/LeaveHistory'
import ApprovalQueue from './pages/ApprovalQueue'
import TeamCalendar from './pages/TeamCalendar'
import Notifications from './pages/Notifications'
import Profile from './pages/Profile'
import AdminPanel from './pages/AdminPanel'
import DelegationPage from './pages/DelegationPage'
import LeaveDetailPage from './pages/LeaveDetailPage'
import { ROLES } from './utils/constants'

/**
 * Grok router + providers; routes point to FIGMA pages (MERGE_PLAN §6).
 * Pages load live API data via services + src/lib/adapters.js.
 */
export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <NotificationProvider>
            <Toaster
              position="top-right"
              toastOptions={{
                style: {
                  background: 'var(--surface)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                },
              }}
            />
            <Routes>
              <Route path="/login" element={<LoginPage />} />

              <Route element={<ProtectedRoute />}>
                <Route element={<Layout />}>
                  <Route index element={<Dashboard />} />
                  <Route path="leave" element={<LeaveHistory />} />
                  <Route path="leave/apply" element={<ApplyLeave />} />
                  <Route path="leave/:id" element={<LeaveDetailPage />} />
                  <Route path="profile" element={<Profile />} />
                  <Route path="notifications" element={<Notifications />} />
                  <Route path="calendar" element={<TeamCalendar />} />

                  <Route
                    path="approvals"
                    element={
                      <ProtectedRoute
                        roles={[
                          ROLES.SUPERVISOR,
                          ROLES.MANAGER,
                          ROLES.HR_ADMIN,
                        ]}
                      >
                        <ApprovalQueue />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="approvals/delegations"
                    element={
                      <ProtectedRoute
                        roles={[
                          ROLES.SUPERVISOR,
                          ROLES.MANAGER,
                          ROLES.HR_ADMIN,
                          ROLES.EMPLOYEE,
                        ]}
                      >
                        <DelegationPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="admin"
                    element={
                      <ProtectedRoute roles={[ROLES.HR_ADMIN]}>
                        <AdminPanel />
                      </ProtectedRoute>
                    }
                  />
                </Route>
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </NotificationProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
