import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { RoleRoute } from './routes/RoleRoute';

// Login is the entry point, so it stays in the main bundle.
import Login from './pages/auth/Login';

// Everything else is loaded on demand, so the sign-in screen does not download the
// dashboard shell, the chat assistant, or pages the visitor may never open.
const DashboardLayout = lazy(() => import('./layouts/DashboardLayout'));
const ChatWidget = lazy(() => import('./components/ChatWidget'));
const Register = lazy(() => import('./pages/auth/Register'));
const Dashboard = lazy(() => import('./pages/dashboard/Dashboard'));
const MembersList = lazy(() => import('./pages/members/MembersList'));
const MemberProfile = lazy(() => import('./pages/members/MemberProfile'));
const TrainersList = lazy(() => import('./pages/trainers/TrainersList'));
const TrainerProfile = lazy(() => import('./pages/trainers/TrainerProfile'));
const MembershipPlans = lazy(() => import('./pages/memberships/MembershipPlans'));
const Subscriptions = lazy(() => import('./pages/memberships/Subscriptions'));
const PaymentsList = lazy(() => import('./pages/payments/PaymentsList'));
const AttendancePage = lazy(() => import('./pages/attendance/AttendancePage'));
const WorkoutsPage = lazy(() => import('./pages/workouts/WorkoutsPage'));
const ClassSchedule = lazy(() => import('./pages/classes/ClassSchedule'));
const RevenueReport = lazy(() => import('./pages/reports/RevenueReport'));
const PendingApprovals = lazy(() => import('./pages/admin/PendingApprovals'));
const ExercisesPage = lazy(() => import('./pages/exercises/ExercisesPage'));
const ClassManagement = lazy(() => import('./pages/classes/ClassManagement'));
const TrainerAssignments = lazy(() => import('./pages/assignments/TrainerAssignments'));
const AccountSettings = lazy(() => import('./pages/account/AccountSettings'));

// Reached from emailed links or the sign-in screen, so they stay outside ProtectedRoute.
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/auth/ResetPassword'));
const VerifyEmail = lazy(() => import('./pages/auth/VerifyEmail'));

const PageFallback = () => (
  <div className="p-6 text-gray-500 animate-pulse">Loading...</div>
);

// The assistant is only for signed-in users, so its code is not fetched before sign-in.
function ChatLauncher() {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return null;
  return (
    <Suspense fallback={null}>
      <ChatWidget />
    </Suspense>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ChatLauncher />
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<DashboardLayout />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/account" element={<AccountSettings />} />

                <Route element={<RoleRoute allowedRoles={['admin', 'receptionist']} />}>
                  <Route path="/members" element={<MembersList />} />
                  <Route path="/members/:id" element={<MemberProfile />} />
                  <Route path="/attendance" element={<AttendancePage />} />
                  <Route path="/payments" element={<PaymentsList />} />
                  <Route path="/subscriptions" element={<Subscriptions />} />
                </Route>

                {/* Members may browse the plan catalogue; only staff can assign them. */}
                <Route path="/plans" element={<MembershipPlans />} />

                <Route path="/trainers" element={<TrainersList />} />
                <Route path="/trainers/:id" element={<TrainerProfile />} />

                <Route path="/workouts" element={<WorkoutsPage />} />
                <Route path="/exercises" element={<ExercisesPage />} />
                <Route path="/classes" element={<ClassSchedule />} />

                <Route element={<RoleRoute allowedRoles={['admin', 'receptionist']} />}>
                  <Route path="/trainer-assignments" element={<TrainerAssignments />} />
                </Route>

                <Route element={<RoleRoute allowedRoles={['admin']} />}>
                  <Route path="/class-management" element={<ClassManagement />} />
                  <Route path="/reports" element={<RevenueReport />} />
                  <Route path="/admin/approvals" element={<PendingApprovals />} />
                </Route>
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
