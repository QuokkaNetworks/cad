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

function normalizeHex6(hex) {
  const raw = String(hex || '').trim();
  if (!raw) return '0052C2';
  const normalized = raw.startsWith('#') ? raw.slice(1) : raw;
  if (/^[0-9a-fA-F]{6}$/.test(normalized)) return normalized;
  if (/^[0-9a-fA-F]{3}$/.test(normalized)) {
    return normalized.split('').map((c) => c + c).join('');
  }
  return '0052C2';
}

function mixHexColor(hex, targetRgb = [255, 255, 255], ratio = 0.2) {
  const safeHex = normalizeHex6(hex);
  const clampedRatio = Math.max(0, Math.min(1, Number(ratio) || 0));
  const base = [
    parseInt(safeHex.slice(0, 2), 16),
    parseInt(safeHex.slice(2, 4), 16),
    parseInt(safeHex.slice(4, 6), 16),
  ];
  const mixed = base.map((channel, idx) => {
    const target = Array.isArray(targetRgb) ? Number(targetRgb[idx] ?? channel) : channel;
    return Math.round(channel + (target - channel) * clampedRatio);
  });
  return `${mixed[0]}, ${mixed[1]}, ${mixed[2]}`;
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
  const isAdminRoute = location.pathname.startsWith('/admin');
  const isHomeRoute = location.pathname === '/home' || location.pathname.startsWith('/home/');
  const hideSidebar = ['/settings', '/home', '/departments', '/rules'].includes(location.pathname) || isAdminRoute;
  const hasDepartmentTheme = !!(activeDepartment && !hideSidebar);
  const departmentColor = String(activeDepartment?.color || '#0052C2').trim() || '#0052C2';
  const departmentLogo = String(activeDepartment?.icon || '').trim();
  const departmentAccentLightRgb = mixHexColor(departmentColor, [255, 255, 255], 0.18);
  const departmentAccentDimRgb = mixHexColor(departmentColor, [0, 0, 0], 0.32);
  const themeStyle = hasDepartmentTheme
    ? {
      '--cad-dept-accent': departmentColor,
      '--cad-dept-accent-rgb': hexToRgbCsv(departmentColor),
      '--cad-dept-accent-light-rgb': departmentAccentLightRgb,
      '--cad-dept-accent-dim-rgb': departmentAccentDimRgb,
      '--cad-dept-watermark-image': buildWatermarkCssValue(departmentLogo),
    }
    : undefined;

  return (
    <div
      className={`h-screen flex flex-col ${hasDepartmentTheme ? 'cad-department-theme' : ''} ${isAdminRoute ? 'cad-admin-route' : ''}`}
      style={themeStyle}
    >
      <Header />
      <div className="flex flex-1 overflow-hidden">
        {!hideSidebar && <Sidebar />}
        <main className={`cad-app-main-shell flex-1 overflow-y-auto bg-cad-bg relative ${isHomeRoute ? 'p-0' : 'p-6'}`}>
          <div className="cad-app-main-overlay" aria-hidden="true" />
          <div className={`cad-app-page-content relative z-10 ${isAdminRoute ? 'cad-admin-page-content' : ''} ${isHomeRoute ? 'h-full' : ''}`}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
