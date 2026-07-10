import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { ThemeProvider } from './context/ThemeContext';
import Layout from './components/common/Layout';
import ProtectedRoute from './components/common/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import LeaveApplyPage from './pages/LeaveApplyPage';
import LeaveHistoryPage from './pages/LeaveHistoryPage';
import LeaveDetailPage from './pages/LeaveDetailPage';
import ApprovalQueuePage from './pages/ApprovalQueuePage';
import ApproverCalendarPage from './pages/ApproverCalendarPage';
import DelegationPage from './pages/DelegationPage';
import NotificationsPage from './pages/NotificationsPage';
import CompanyPage from './pages/CompanyPage';
import ProfilePage from './pages/ProfilePage';
import { ROLES } from './utils/constants';

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <NotificationProvider>
            <Toaster
              position="top-right"
              toastOptions={{
                className:
                  'dark:bg-slate-800 dark:text-slate-100 dark:border dark:border-slate-700',
              }}
            />
            <Routes>
              <Route path="/login" element={<LoginPage />} />

              <Route element={<ProtectedRoute />}>
                <Route element={<Layout />}>
                  <Route index element={<DashboardPage />} />
                  <Route path="leave" element={<LeaveHistoryPage />} />
                  <Route path="leave/apply" element={<LeaveApplyPage />} />
                  <Route path="leave/:id" element={<LeaveDetailPage />} />
                  <Route path="profile" element={<ProfilePage />} />
                  <Route path="notifications" element={<NotificationsPage />} />
                  <Route path="company" element={<CompanyPage />} />
                  <Route
                    path="approvals"
                    element={
                      <ProtectedRoute
                        roles={[
                          ROLES.SUPERVISOR,
                          ROLES.MANAGER,
                          ROLES.HR_ADMIN,
                          ROLES.EMPLOYEE,
                        ]}
                      >
                        <ApprovalQueuePage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="approvals/calendar"
                    element={
                      <ProtectedRoute
                        roles={[
                          ROLES.SUPERVISOR,
                          ROLES.MANAGER,
                          ROLES.HR_ADMIN,
                          ROLES.EMPLOYEE,
                        ]}
                      >
                        <ApproverCalendarPage />
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
                </Route>
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </NotificationProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
