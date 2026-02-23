import { Link } from 'react-router-dom';
import { useDepartment } from '../../context/DepartmentContext';
import { DEPARTMENT_LAYOUT, getDepartmentLayoutType } from '../../utils/departmentLayout';

function FireOnlyNotice() {
  return (
    <div className="bg-cad-card border border-cad-border rounded-lg p-5">
      <h2 className="text-xl font-bold mb-2">Pre-Plan Database</h2>
      <p className="text-sm text-cad-muted">
        This page is intended for fire departments only.
      </p>
    </div>
  );
}

export default function FirePrePlans() {
  const { activeDepartment } = useDepartment();
  const isFire = getDepartmentLayoutType(activeDepartment) === DEPARTMENT_LAYOUT.FIRE;

  if (!isFire) return <FireOnlyNotice />;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold">Pre-Plan Database</h2>
        <p className="text-sm text-cad-muted mt-1">
          This tab is the dedicated pre-plan workspace for fire departments. The full address-linked pre-plan database is still pending.
        </p>
      </div>

      <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3">
        <p className="text-xs uppercase tracking-wider text-amber-300 font-semibold">Current Status</p>
        <p className="text-sm text-amber-100 mt-1">
          Guided placeholder: use Lookup and Incident Reports for now, then use this tab for hydrants, hazards, and access plans once the pre-plan module is built.
        </p>
      </div>

      <div className="bg-cad-card border border-cad-border rounded-xl p-5">
        <h3 className="font-semibold mb-2">Planned Pre-Plan Content</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-cad-muted">
          <div className="rounded-lg border border-cad-border bg-cad-surface px-3 py-3">
            Building profile, occupancy type, construction, hazard notes, Knox box/access details.
          </div>
          <div className="rounded-lg border border-cad-border bg-cad-surface px-3 py-3">
            Hydrant locations, water supply notes, standpipe/sprinkler information, utility shutoffs.
          </div>
          <div className="rounded-lg border border-cad-border bg-cad-surface px-3 py-3">
            Tactical notes and approach/egress points linked to response addresses.
          </div>
          <div className="rounded-lg border border-cad-border bg-cad-surface px-3 py-3">
            Cross-linking to incident reports for post-incident updates and lessons learned.
          </div>
        </div>

        <div className="mt-4">
          <p className="text-xs uppercase tracking-wider text-cad-muted mb-2">Use These Tabs In The Meantime</p>
          <div className="flex flex-wrap gap-2">
          <Link to="/search" className="px-3 py-1.5 rounded border border-cad-border text-sm hover:bg-cad-surface">
            Open Lookup
          </Link>
          <Link to="/records" className="px-3 py-1.5 rounded border border-cad-border text-sm hover:bg-cad-surface">
            Open Incident Reports
          </Link>
          <Link to="/fire-apparatus" className="px-3 py-1.5 rounded border border-cad-border text-sm hover:bg-cad-surface">
            Open Apparatus Tab
          </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
