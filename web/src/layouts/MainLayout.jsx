import { Outlet, useLocation } from 'react-router-dom';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';
import { useDepartment } from '../context/DepartmentContext';

function hexToRgbCsv(hex) {
  const raw = String(hex || '').trim();
  const normalized = raw.startsWith('#') ? raw.slice(1) : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return '0, 82, 194';
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

function buildWatermarkCssValue(url) {
  const text = String(url || '').trim();
  if (!text) return 'none';
  const escaped = text.replace(/"/g, '\\"');
  return `url("${escaped}")`;
}

export default function MainLayout() {
  const location = useLocation();
  const { activeDepartment } = useDepartment();
  const hideSidebar = ['/settings', '/home'].includes(location.pathname) || location.pathname.startsWith('/admin');
  const hasDepartmentTheme = !!(activeDepartment && !hideSidebar);
  const departmentColor = String(activeDepartment?.color || '#0052C2').trim() || '#0052C2';
  const departmentLogo = String(activeDepartment?.icon || '').trim();
  const themeStyle = hasDepartmentTheme
    ? {
      '--cad-dept-accent': departmentColor,
      '--cad-dept-accent-rgb': hexToRgbCsv(departmentColor),
      '--cad-dept-watermark-image': buildWatermarkCssValue(departmentLogo),
    }
    : undefined;

  return (
    <div
      className={`h-screen flex flex-col ${hasDepartmentTheme ? 'cad-department-theme' : ''}`}
      style={themeStyle}
    >
      <Header />
      <div className="flex flex-1 overflow-hidden">
        {!hideSidebar && <Sidebar />}
        <main className="cad-app-main-shell flex-1 overflow-y-auto p-6 bg-cad-bg relative">
          <div className="cad-app-main-overlay" aria-hidden="true" />
          <div className="cad-app-page-content relative z-10">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
