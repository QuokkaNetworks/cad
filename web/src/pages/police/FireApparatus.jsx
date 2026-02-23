import { Link } from 'react-router-dom';
import { useDepartment } from '../../context/DepartmentContext';
import { DEPARTMENT_LAYOUT, getDepartmentLayoutType } from '../../utils/departmentLayout';

function FireOnlyNotice() {
  return (
    <div className="bg-cad-card border border-cad-border rounded-lg p-5">
      <h2 className="text-xl font-bold mb-2">Apparatus Management</h2>
      <p className="text-sm text-cad-muted">
        This page is intended for fire departments only.
      </p>
    </div>
  );
}

export default function FireApparatus() {
  const { activeDepartment } = useDepartment();
  const isFire = getDepartmentLayoutType(activeDepartment) === DEPARTMENT_LAYOUT.FIRE;
  const responseBoardPath = activeDepartment?.is_dispatch ? '/dispatch' : '/units';

  if (!isFire) return <FireOnlyNotice />;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold">Apparatus Management</h2>
        <p className="text-sm text-cad-muted mt-1">
          This tab is the dedicated apparatus workspace for fire departments. Full roster/crew/equipment management is the next backend module.
        </p>
      </div>

      <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3">
        <p className="text-xs uppercase tracking-wider text-amber-300 font-semibold">Current Status</p>
        <p className="text-sm text-amber-100 mt-1">
          Guided placeholder: use the Response Board for live unit assignment right now, then use this tab as the hub for apparatus workflow once the module lands.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-cad-card border border-cad-border rounded-xl p-4">
          <h3 className="font-semibold mb-2">Use Now</h3>
          <p className="text-sm text-cad-muted mb-3">
            Manage appliances/crews on live incidents in the Response Board while apparatus-specific tooling is under development.
          </p>
          <Link
            to={responseBoardPath}
            className="inline-flex px-3 py-2 rounded bg-cad-accent hover:bg-cad-accent-light text-white text-sm font-medium"
          >
            Open Response Board
          </Link>
        </div>

        <div className="bg-cad-card border border-cad-border rounded-xl p-4">
          <h3 className="font-semibold mb-2">Planned Apparatus Tools</h3>
          <ul className="text-sm text-cad-muted space-y-1">
            <li>Apparatus roster (engine, ladder, rescue, command)</li>
            <li>Crew assignments by seat/role</li>
            <li>Equipment readiness / out-of-service status</li>
            <li>Maintenance notes / availability tags</li>
          </ul>
        </div>

        <div className="bg-cad-card border border-cad-border rounded-xl p-4">
          <h3 className="font-semibold mb-2">Related Fire Tabs</h3>
          <div className="flex flex-wrap gap-2">
            <Link to="/records" className="px-3 py-1.5 rounded border border-cad-border text-sm hover:bg-cad-surface">Incident Reports</Link>
            <Link to="/search" className="px-3 py-1.5 rounded border border-cad-border text-sm hover:bg-cad-surface">Lookup</Link>
            <Link to="/fire-preplans" className="px-3 py-1.5 rounded border border-cad-border text-sm hover:bg-cad-surface">Pre-Plans</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
