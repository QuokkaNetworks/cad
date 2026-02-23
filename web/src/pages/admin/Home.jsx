import { useNavigate } from 'react-router-dom';

const ADMIN_ITEMS = [
  {
    to: '/admin/users',
    title: 'Users',
    description: 'Manage access, admin rights, and bans.',
    color: 'bg-cad-accent',
  },
  {
    to: '/admin/departments',
    title: 'Departments',
    description: 'Create and manage departments, colors, and logos.',
    color: 'bg-emerald-500',
  },
  {
    to: '/admin/role-mappings',
    title: 'Role Access Sync',
    description: 'Bind Discord roles to department and sub-department access.',
    color: 'bg-[#5865F2]',
  },
  {
    to: '/admin/job-bindings',
    title: 'Job Role Sync',
    description: 'Bind QBox players.job job + grade values to Discord roles.',
    color: 'bg-indigo-500',
  },
  {
    to: '/admin/offences',
    title: 'Offence Catalog',
    description: 'Manage preset Infringements, Summary, and Indictment entries.',
    color: 'bg-rose-500',
  },
  {
    to: '/admin/audit-log',
    title: 'Audit Log',
    description: 'Review administrative and system actions.',
    color: 'bg-amber-500',
  },
  {
    to: '/admin/settings',
    title: 'System Settings',
    description: 'Configure database and integration settings.',
    color: 'bg-vicpol-navy',
  },
  {
    to: '/admin/qbox-settings',
    title: 'QBox Settings',
    description: 'Configure QBox connection and bind to default players/vehicles tables.',
    color: 'bg-cyan-500',
  },
];

function AdminCard({ item, onOpen, className = '' }) {
  return (
    <button
      onClick={() => onOpen(item.to)}
      className={`w-full h-full text-left bg-cad-card border border-cad-border rounded-2xl p-5 min-h-[168px] hover:bg-cad-surface transition-colors ${className}`}
    >
      <div className="h-full flex flex-col">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-base">{item.title}</h3>
            <p className="text-sm text-cad-muted mt-1">{item.description}</p>
          </div>
          <span className={`w-3 h-3 rounded-full mt-1.5 ${item.color}`} />
        </div>
        <div>
          <p className="text-xs text-cad-muted mt-4">Open {item.title}</p>
        </div>
      </div>
    </button>
  );
}

export default function AdminHome() {
  const navigate = useNavigate();

  return (
    <div className="w-full">
      <div className="max-w-6xl mx-auto">
        <div className="mb-5 flex items-start justify-between gap-3">
          <button
            onClick={() => navigate('/home')}
            className="px-3 py-1.5 text-sm bg-cad-card border border-cad-border text-cad-muted hover:text-cad-ink hover:bg-cad-surface rounded transition-colors"
          >
            Back to Home
          </button>
        </div>
        <div className="mb-5">
          <h2 className="text-xl font-bold">Administration</h2>
          <p className="text-sm text-cad-muted">Choose an admin section.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
          {ADMIN_ITEMS.map((item, index) => (
            <AdminCard
              key={item.to}
              item={item}
              onOpen={navigate}
              className={index === ADMIN_ITEMS.length - 1 && ADMIN_ITEMS.length % 2 === 1 ? 'md:col-span-2' : ''}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
