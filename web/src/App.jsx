import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { DepartmentProvider } from './context/DepartmentContext';
import { EventSourceProvider } from './context/EventSourceContext';
import ProtectedRoute from './components/ProtectedRoute';
import RequireRulesAgreement from './components/RequireRulesAgreement';
import RequireDepartment from './components/RequireDepartment';
import RequireFiveMOnline from './components/RequireFiveMOnline';
import MainLayout from './layouts/MainLayout';
import Login from './pages/Login';
import AuthCallback from './pages/AuthCallback';
import Home from './pages/Home';
import Departments from './pages/Departments';
import Rules from './pages/Rules';
import Settings from './pages/Settings';
import Dispatch from './pages/police/Dispatch';
import Units from './pages/police/Units';
import DepartmentHome from './pages/police/DepartmentHome';
import Search from './pages/police/Search';
import Incidents from './pages/police/Incidents';
import BOLOs from './pages/police/BOLOs';
import Warrants from './pages/police/Warrants';
import CallDetails from './pages/police/CallDetails';
import Records from './pages/police/Records';
import Infringements from './pages/police/Infringements';
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
import AdminAlarmZones from './pages/admin/AlarmZones';
import AdminAnnouncements from './pages/admin/Announcements';
import DepartmentApplicationsManager from './pages/admin/DepartmentApplicationsManager';

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
            <Route path="/departments" element={<RequireRulesAgreement><Departments /></RequireRulesAgreement>} />
            <Route path="/rules" element={<Rules />} />
            <Route path="/settings" element={<Settings />} />

            {/* Police MDT */}
            <Route path="/department" element={<RequireRulesAgreement><RequireDepartment><DepartmentHome /></RequireDepartment></RequireRulesAgreement>} />
            <Route path="/dispatch" element={<RequireRulesAgreement><RequireDepartment><Dispatch /></RequireDepartment></RequireRulesAgreement>} />
            <Route path="/map" element={<Navigate to="/department" replace />} />
            <Route path="/units" element={<RequireRulesAgreement><RequireDepartment><Units /></RequireDepartment></RequireRulesAgreement>} />
            <Route path="/search" element={<RequireRulesAgreement><RequireDepartment><Search /></RequireDepartment></RequireRulesAgreement>} />
            <Route path="/incidents" element={<RequireRulesAgreement><RequireDepartment><RequireFiveMOnline featureLabel="incidents"><Incidents /></RequireFiveMOnline></RequireDepartment></RequireRulesAgreement>} />
            <Route path="/records" element={<RequireRulesAgreement><RequireDepartment><RequireFiveMOnline featureLabel="records"><Records /></RequireFiveMOnline></RequireDepartment></RequireRulesAgreement>} />
            <Route path="/arrest-reports" element={<RequireRulesAgreement><RequireDepartment><RequireFiveMOnline featureLabel="arrest reports"><Records /></RequireFiveMOnline></RequireDepartment></RequireRulesAgreement>} />
            <Route path="/infringements" element={<RequireRulesAgreement><RequireDepartment><RequireFiveMOnline featureLabel="infringement notices"><Infringements /></RequireFiveMOnline></RequireDepartment></RequireRulesAgreement>} />
            <Route path="/bolos" element={<RequireRulesAgreement><RequireDepartment><BOLOs /></RequireDepartment></RequireRulesAgreement>} />
            <Route path="/warrants" element={<RequireRulesAgreement><RequireDepartment><RequireFiveMOnline featureLabel="warrants"><Warrants /></RequireFiveMOnline></RequireDepartment></RequireRulesAgreement>} />
            <Route path="/evidence" element={<RequireRulesAgreement><RequireDepartment><RequireFiveMOnline featureLabel="evidence management"><EvidenceManagement /></RequireFiveMOnline></RequireDepartment></RequireRulesAgreement>} />
            <Route path="/ems-treatment" element={<RequireRulesAgreement><RequireDepartment><EmsTreatmentLog /></RequireDepartment></RequireRulesAgreement>} />
            <Route path="/ems-transport" element={<RequireRulesAgreement><RequireDepartment><EmsTransportTracker /></RequireDepartment></RequireRulesAgreement>} />
            <Route path="/fire-apparatus" element={<RequireRulesAgreement><RequireDepartment><FireApparatus /></RequireDepartment></RequireRulesAgreement>} />
            <Route path="/fire-preplans" element={<RequireRulesAgreement><RequireDepartment><FirePrePlans /></RequireDepartment></RequireRulesAgreement>} />
            <Route path="/call-details" element={<RequireRulesAgreement><RequireDepartment><CallDetails /></RequireDepartment></RequireRulesAgreement>} />

            {/* Admin */}
            <Route path="/admin" element={<ProtectedRoute requireAdmin><AdminHome /></ProtectedRoute>} />
            <Route path="/admin/users" element={<ProtectedRoute requireAdmin><AdminUsers /></ProtectedRoute>} />
            <Route path="/admin/departments" element={<ProtectedRoute requireAdmin><AdminDepartments /></ProtectedRoute>} />
            <Route path="/admin/offences" element={<ProtectedRoute requireAdmin><AdminOffenceCatalog /></ProtectedRoute>} />
            <Route path="/admin/role-mappings" element={<ProtectedRoute requireAdmin><AdminRoleMappings /></ProtectedRoute>} />
            <Route path="/admin/job-bindings" element={<ProtectedRoute requireAdmin><AdminJobBindings /></ProtectedRoute>} />
            <Route path="/admin/job-sync" element={<ProtectedRoute requireAdmin><AdminJobBindings /></ProtectedRoute>} />
            <Route path="/admin/job-role-sync" element={<ProtectedRoute requireAdmin><AdminJobBindings /></ProtectedRoute>} />
            <Route path="/admin/audit-log" element={<ProtectedRoute requireAdmin><AdminAuditLog /></ProtectedRoute>} />
            <Route path="/admin/settings" element={<ProtectedRoute requireAdmin><AdminSystemSettings /></ProtectedRoute>} />
            <Route path="/admin/qbox-settings" element={<ProtectedRoute requireAdmin><AdminQboxSettings /></ProtectedRoute>} />
            <Route path="/admin/alarm-zones" element={<ProtectedRoute requireAdmin><AdminAlarmZones /></ProtectedRoute>} />
            <Route path="/admin/announcements" element={<ProtectedRoute requireAnnouncementManager><AdminAnnouncements /></ProtectedRoute>} />
            <Route path="/admin/department-applications" element={<ProtectedRoute requireDepartmentApplicationManager><DepartmentApplicationsManager /></ProtectedRoute>} />
          </Route>

          {/* Default redirect */}
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
        </DepartmentProvider>
      </EventSourceProvider>
    </AuthProvider>
  );
}
