import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { DepartmentProvider } from './context/DepartmentContext';
import { EventSourceProvider } from './context/EventSourceContext';
import ProtectedRoute from './components/ProtectedRoute';
import RequireDepartment from './components/RequireDepartment';
import MainLayout from './layouts/MainLayout';
import Login from './pages/Login';
import AuthCallback from './pages/AuthCallback';
import Home from './pages/Home';
import Settings from './pages/Settings';
import Dispatch from './pages/police/Dispatch';
import Units from './pages/police/Units';
import DepartmentHome from './pages/police/DepartmentHome';
import Search from './pages/police/Search';
import BOLOs from './pages/police/BOLOs';
import Warrants from './pages/police/Warrants';
import CallDetails from './pages/police/CallDetails';
import Records from './pages/police/Records';
import EvidenceManagement from './pages/police/EvidenceManagement';
import EmsTreatmentLog from './pages/police/EmsTreatmentLog';
import EmsTransportTracker from './pages/police/EmsTransportTracker';
import FireApparatus from './pages/police/FireApparatus';
import FirePrePlans from './pages/police/FirePrePlans';
import AdminUsers from './pages/admin/Users';
import AdminDepartments from './pages/admin/Departments';
import AdminRoleMappings from './pages/admin/RoleMappings';
import AdminAuditLog from './pages/admin/AuditLog';
import AdminSystemSettings from './pages/admin/SystemSettings';
import AdminHome from './pages/admin/Home';
import AdminOffenceCatalog from './pages/admin/OffenceCatalog';
import AdminQboxSettings from './pages/admin/QboxSettings';
import AdminJobBindings from './pages/admin/JobBindings';

export default function App() {
  return (
    <AuthProvider>
      <EventSourceProvider>
        <DepartmentProvider>
          <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/auth/callback" element={<AuthCallback />} />

          <Route
            element={
              <ProtectedRoute>
                <MainLayout />
              </ProtectedRoute>
            }
          >
            {/* General */}
            <Route path="/home" element={<Home />} />
            <Route path="/settings" element={<Settings />} />

            {/* Police MDT */}
            <Route path="/department" element={<RequireDepartment><DepartmentHome /></RequireDepartment>} />
            <Route path="/dispatch" element={<RequireDepartment><Dispatch /></RequireDepartment>} />
            <Route path="/units" element={<RequireDepartment><Units /></RequireDepartment>} />
            <Route path="/search" element={<RequireDepartment><Search /></RequireDepartment>} />
            <Route path="/records" element={<RequireDepartment><Records /></RequireDepartment>} />
            <Route path="/bolos" element={<RequireDepartment><BOLOs /></RequireDepartment>} />
            <Route path="/warrants" element={<RequireDepartment><Warrants /></RequireDepartment>} />
            <Route path="/evidence" element={<RequireDepartment><EvidenceManagement /></RequireDepartment>} />
            <Route path="/ems-treatment" element={<RequireDepartment><EmsTreatmentLog /></RequireDepartment>} />
            <Route path="/ems-transport" element={<RequireDepartment><EmsTransportTracker /></RequireDepartment>} />
            <Route path="/fire-apparatus" element={<RequireDepartment><FireApparatus /></RequireDepartment>} />
            <Route path="/fire-preplans" element={<RequireDepartment><FirePrePlans /></RequireDepartment>} />
            <Route path="/call-details" element={<RequireDepartment><CallDetails /></RequireDepartment>} />

            {/* Admin */}
            <Route path="/admin" element={<ProtectedRoute requireAdmin><AdminHome /></ProtectedRoute>} />
            <Route path="/admin/users" element={<ProtectedRoute requireAdmin><AdminUsers /></ProtectedRoute>} />
            <Route path="/admin/departments" element={<ProtectedRoute requireAdmin><AdminDepartments /></ProtectedRoute>} />
            <Route path="/admin/offences" element={<ProtectedRoute requireAdmin><AdminOffenceCatalog /></ProtectedRoute>} />
            <Route path="/admin/role-mappings" element={<ProtectedRoute requireAdmin><AdminRoleMappings /></ProtectedRoute>} />
            <Route path="/admin/job-bindings" element={<ProtectedRoute requireAdmin><AdminJobBindings /></ProtectedRoute>} />
            <Route path="/admin/audit-log" element={<ProtectedRoute requireAdmin><AdminAuditLog /></ProtectedRoute>} />
            <Route path="/admin/settings" element={<ProtectedRoute requireAdmin><AdminSystemSettings /></ProtectedRoute>} />
            <Route path="/admin/qbox-settings" element={<ProtectedRoute requireAdmin><AdminQboxSettings /></ProtectedRoute>} />
          </Route>

          {/* Default redirect */}
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
        </DepartmentProvider>
      </EventSourceProvider>
    </AuthProvider>
  );
}
