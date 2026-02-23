import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

const ADMIN_SECTIONS = [
  {
    key: 'access',
    title: 'Access, Roles & Users',
    description: 'Manage who can access CAD, how Discord roles map into CAD, and how in-game jobs map back to Discord.',
    accent: 'from-[#5865F2]/20 to-indigo-500/5',
    items: [
      {
        to: '/admin/users',
        title: 'Users',
        description: 'Admin rights, bans, linked identities, and preferred characters.',
        color: 'bg-cad-accent',
      },
      {
        to: '/admin/role-mappings',
        title: 'Role Access Sync',
        description: 'Discord role -> department/sub-department access mappings.',
        color: 'bg-[#5865F2]',
      },
      {
        to: '/admin/job-bindings',
        title: 'Job Role Sync',
        description: 'QBox job + grade -> Discord role mappings and debug tools.',
        color: 'bg-indigo-500',
      },
      {
        to: '/admin/qbox-settings',
        title: 'QBox Settings',
        description: 'QBox connection, table bindings, and job source settings.',
        color: 'bg-cyan-500',
      },
    ],
  },
  {
    key: 'departments',
    title: 'Departments & Operations',
    description: 'Configure departments and operational data used by dispatch and in-game automation.',
    accent: 'from-emerald-500/20 to-cad-card/10',
    items: [
      {
        to: '/admin/departments',
        title: 'Departments',
        description: 'Department branding, layouts, dispatch visibility, and sub-departments.',
        color: 'bg-emerald-500',
      },
      {
        to: '/admin/alarm-zones',
        title: 'Alarm Zones',
        description: 'Named circle/polygon alarm triggers and primary/backup department routing.',
        color: 'bg-orange-500',
      },
      {
        to: '/admin/offences',
        title: 'Offence Catalog',
        description: 'Charge catalog with default fines and jail times used in reports/records.',
        color: 'bg-rose-500',
      },
    ],
  },
  {
    key: 'system',
    title: 'Platform & Audit',
    description: 'System integration settings, Discord/webhook behavior, bridge sync, and audit visibility.',
    accent: 'from-cad-gold/20 to-cad-card/10',
    items: [
      {
        to: '/admin/settings',
        title: 'System Settings',
        description: 'FiveM bridge, Discord sync timers, webhook alerts, and CAD system settings.',
        color: 'bg-vicpol-navy',
      },
      {
        to: '/admin/audit-log',
        title: 'Audit Log',
        description: 'Administrative and system action history for QA and accountability.',
        color: 'bg-amber-500',
      },
    ],
  },
];

const QUICK_START = [
  { to: '/admin/settings', label: 'System Settings' },
  { to: '/admin/role-mappings', label: 'Role Access Sync' },
  { to: '/admin/job-bindings', label: 'Job Role Sync' },
  { to: '/admin/alarm-zones', label: 'Alarm Zones' },
];

function AdminToolCard({ item, onOpen }) {
  return (
    <button
      onClick={() => onOpen(item.to)}
      className="w-full h-full text-left rounded-xl border border-cad-border bg-cad-surface/60 hover:bg-cad-surface p-4 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-cad-ink">{item.title}</p>
          <p className="text-xs text-cad-muted mt-1 leading-5">{item.description}</p>
        </div>
        <span className={`w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0 ${item.color}`} />
      </div>
      <p className="text-[11px] uppercase tracking-wider text-cad-muted mt-4">Open</p>
    </button>
  );
}

function AdminSectionCard({ section, onOpen }) {
  return (
    <section className="rounded-2xl border border-cad-border bg-cad-card overflow-hidden">
      <div className={`px-5 py-4 border-b border-cad-border bg-gradient-to-r ${section.accent}`}>
        <h3 className="text-sm font-semibold text-cad-ink">{section.title}</h3>
        <p className="text-xs text-cad-muted mt-1 max-w-3xl leading-5">{section.description}</p>
      </div>
      <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
        {section.items.map((item) => (
          <AdminToolCard key={item.to} item={item} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}

export default function AdminHome() {
  const navigate = useNavigate();

  const totals = useMemo(() => ({
    sections: ADMIN_SECTIONS.length,
    tools: ADMIN_SECTIONS.reduce((sum, section) => sum + section.items.length, 0),
  }), []);

  return (
    <div className="w-full">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-3">
          <button
            onClick={() => navigate('/home')}
            className="px-3 py-1.5 text-sm bg-cad-card border border-cad-border text-cad-muted hover:text-cad-ink hover:bg-cad-surface rounded transition-colors"
          >
            Back to Home
          </button>
        </div>

        <section className="rounded-2xl border border-cad-border bg-cad-card p-6 relative overflow-hidden">
          <div className="absolute inset-0 opacity-30 pointer-events-none bg-[radial-gradient(circle_at_10%_10%,rgba(88,101,242,0.16),transparent_45%),radial-gradient(circle_at_95%_0%,rgba(0,82,194,0.14),transparent_50%)]" />
          <div className="relative grid grid-cols-1 xl:grid-cols-[1.35fr_1fr] gap-5">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-cad-muted">Admin Workspace</p>
              <h2 className="text-2xl font-bold mt-2">CAD Administration</h2>
              <p className="text-sm text-cad-muted mt-2 max-w-2xl leading-6">
                Manage access, integrations, departments, operational data, and automation settings from one place.
                Tools are grouped below so related setup steps are easier to find.
              </p>

              <div className="flex flex-wrap gap-2 mt-4">
                {QUICK_START.map((link) => (
                  <button
                    key={link.to}
                    onClick={() => navigate(link.to)}
                    className="px-3 py-1.5 text-xs rounded border border-cad-border bg-cad-surface text-cad-muted hover:text-cad-ink hover:bg-cad-card transition-colors"
                  >
                    {link.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-cad-border bg-cad-surface/60 p-4">
                <p className="text-[11px] uppercase tracking-wider text-cad-muted">Tool Groups</p>
                <p className="text-2xl font-bold mt-2">{totals.sections}</p>
              </div>
              <div className="rounded-xl border border-cad-border bg-cad-surface/60 p-4">
                <p className="text-[11px] uppercase tracking-wider text-cad-muted">Admin Tools</p>
                <p className="text-2xl font-bold mt-2">{totals.tools}</p>
              </div>
              <div className="rounded-xl border border-cad-border bg-cad-surface/60 p-4 col-span-2">
                <p className="text-[11px] uppercase tracking-wider text-cad-muted">Recommended Setup Order</p>
                <p className="text-sm text-cad-ink mt-2">
                  <span className="font-mono">QBox Settings</span> {'>'} <span className="font-mono">Job Role Sync</span> {'>'} <span className="font-mono">Role Access Sync</span> {'>'} <span className="font-mono">Departments</span> {'>'} <span className="font-mono">System Settings</span>
                </p>
              </div>
            </div>
          </div>
        </section>

        <div className="space-y-5">
          {ADMIN_SECTIONS.map((section) => (
            <AdminSectionCard key={section.key} section={section} onOpen={navigate} />
          ))}
        </div>
      </div>
    </div>
  );
}
