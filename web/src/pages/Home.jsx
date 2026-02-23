import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useDepartment } from '../context/DepartmentContext';

function getInitials(text, fallback = 'DEP') {
  const value = String(text || '').trim();
  if (!value) return fallback;
  const parts = value.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
  return parts.slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}

function colorWithAlpha(color, alpha, fallback = `rgba(0,82,194,${alpha})`) {
  const value = String(color || '').trim();
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!hex) return fallback;
  const raw = hex[1];
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  const int = Number.parseInt(full, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getDepartmentKindLabel(dept) {
  if (dept?.is_dispatch) return 'Dispatch';
  const layout = String(dept?.layout_type || dept?.department_layout_type || '').toLowerCase();
  if (layout.includes('fire')) return 'Fire';
  if (layout.includes('ems') || layout.includes('paramedic') || layout.includes('medical')) return 'EMS';
  if (layout.includes('law') || layout.includes('police')) return 'Police';
  return 'Department';
}

function countDepartmentKinds(departments) {
  return departments.reduce(
    (acc, dept) => {
      const kind = getDepartmentKindLabel(dept).toLowerCase();
      if (kind.includes('dispatch')) acc.dispatch += 1;
      else if (kind.includes('police')) acc.police += 1;
      else if (kind.includes('ems')) acc.ems += 1;
      else if (kind.includes('fire')) acc.fire += 1;
      else acc.other += 1;
      return acc;
    },
    { dispatch: 0, police: 0, ems: 0, fire: 0, other: 0 }
  );
}

function HomeMetric({ label, value, tone = 'cad' }) {
  const toneMap = {
    cad: 'border-cad-accent/20 bg-cad-accent/5 text-cad-accent-light',
    ok: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-300',
    warn: 'border-amber-500/20 bg-amber-500/5 text-amber-300',
    gold: 'border-cad-gold/20 bg-cad-gold/5 text-cad-gold',
  };
  return (
    <div className={`rounded-xl border px-3.5 py-3 ${toneMap[tone] || toneMap.cad}`}>
      <p className="text-[10px] uppercase tracking-[0.16em] text-cad-muted">{label}</p>
      <p className="text-lg font-semibold mt-1 leading-tight truncate">{value}</p>
    </div>
  );
}

function DepartmentLaunchTile({ dept, onSelect }) {
  const logo = String(dept?.icon || '').trim();
  const accent = String(dept?.color || '#0052C2').trim() || '#0052C2';
  const kind = getDepartmentKindLabel(dept);
  const subtitle = String(dept?.slogan || '').trim() || `${kind} workspace`;

  return (
    <button
      onClick={() => onSelect(dept)}
      className="relative text-left rounded-xl border bg-cad-card/90 p-3.5 overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-xl min-h-[110px]"
      style={{
        borderColor: colorWithAlpha(accent, 0.24, 'rgba(255,255,255,0.12)'),
        boxShadow: `0 8px 20px ${colorWithAlpha(accent, 0.10)}`,
      }}
    >
      <div className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity" style={{ background: `linear-gradient(135deg, ${colorWithAlpha(accent, 0.1)}, transparent 62%)` }} />
      {logo ? (
        <div className="absolute right-1 bottom-0 w-16 h-16 cad-watermark-fade">
          <img src={logo} alt="" className="w-full h-full object-contain cad-watermark-image" />
        </div>
      ) : null}
      <div className="relative h-full flex flex-col">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            {logo ? (
              <div className="w-9 h-9 rounded-lg border bg-cad-surface flex items-center justify-center overflow-hidden flex-shrink-0" style={{ borderColor: colorWithAlpha(accent, 0.22) }}>
                <img src={logo} alt="" className="w-7 h-7 object-contain" />
              </div>
            ) : (
              <div className="w-9 h-9 rounded-lg border text-[10px] font-semibold flex items-center justify-center flex-shrink-0" style={{ borderColor: colorWithAlpha(accent, 0.22), backgroundColor: colorWithAlpha(accent, 0.1), color: '#e5edff' }}>
                {getInitials(dept?.short_name || dept?.name)}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{dept?.name || 'Department'}</p>
              <p className="text-[11px] text-cad-muted truncate">{dept?.short_name || kind}</p>
            </div>
          </div>
          <span className="w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: accent, boxShadow: `0 0 10px ${colorWithAlpha(accent, 0.55)}` }} />
        </div>

        <p className="mt-2 text-xs text-cad-muted line-clamp-2 leading-5 flex-1">{subtitle}</p>

        <div className="mt-2.5 flex items-center justify-between gap-2">
          <span className="text-[10px] uppercase tracking-[0.16em] text-cad-muted">{kind}</span>
          <span className="text-[11px] rounded-md border px-2 py-0.5" style={{ borderColor: colorWithAlpha(accent, 0.25), backgroundColor: colorWithAlpha(accent, 0.08), color: '#dce8ff' }}>
            Open
          </span>
        </div>
      </div>
    </button>
  );
}

function AdminLaunchTile({ onOpen }) {
  return (
    <button
      onClick={onOpen}
      className="relative text-left rounded-xl border border-cad-gold/30 bg-cad-card/90 p-3.5 overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-xl min-h-[110px]"
      style={{ boxShadow: '0 8px 20px rgba(245, 197, 66, 0.10)' }}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-cad-gold/10 to-transparent" />
      <div className="relative h-full flex flex-col">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">Administration</p>
            <p className="text-[11px] text-cad-muted mt-0.5">System settings, roles, integrations</p>
          </div>
          <span className="w-2.5 h-2.5 rounded-full mt-1.5 bg-cad-gold shadow-[0_0_10px_rgba(245,197,66,0.45)]" />
        </div>
        <p className="mt-2 text-xs text-cad-muted leading-5 flex-1">Manage department configuration, Discord sync, alarm zones, and platform settings.</p>
        <div className="mt-2.5 flex items-center justify-between gap-2">
          <span className="text-[10px] uppercase tracking-[0.16em] text-cad-muted">Admin</span>
          <span className="text-[11px] rounded-md border border-cad-gold/25 bg-cad-gold/8 px-2 py-0.5 text-cad-gold">Open</span>
        </div>
      </div>
    </button>
  );
}

function WorkspaceHub({ user, departments, isAdmin, onSelectDepartment, onOpenAdmin }) {
  const linked = !!user?.discord_id;
  const kinds = countDepartmentKinds(departments);
  const featured = departments.slice(0, 4);
  const readiness = !linked ? 'Setup Required' : departments.length > 0 ? 'Ready To Launch' : 'Access Pending';
  const totalTiles = departments.length + (isAdmin ? 1 : 0);

  return (
    <section className="relative h-full min-h-[640px] max-h-[calc(100vh-128px)] overflow-hidden rounded-3xl border border-cad-border bg-cad-card/90 shadow-[0_18px_60px_rgba(0,0,0,0.28)]">
      <div className="absolute inset-0 cad-ambient-grid opacity-40" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_8%_10%,rgba(43,127,255,0.18),transparent_36%),radial-gradient(circle_at_94%_8%,rgba(216,180,108,0.14),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))]" />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="w-[min(88vw,1200px)] h-[min(88vh,880px)] opacity-[0.09]">
          <img src="/1080.png" alt="" className="w-full h-full object-contain cad-home-watermark-image" />
        </div>
      </div>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-cad-bg/10 via-transparent to-cad-bg/35" />

      <div className="relative z-10 h-full p-4 sm:p-5 lg:p-6 flex flex-col gap-4 min-h-0">
        <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-4 flex-none">
          <section className="rounded-2xl border border-cad-border bg-cad-surface/55 p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-cad-border bg-cad-card/70 px-3 py-1 text-xs text-cad-muted">
                <span className={`w-2 h-2 rounded-full ${linked ? 'bg-emerald-400' : 'bg-amber-300'}`} />
                {linked ? 'Discord Linked' : 'Discord Pending'}
              </span>
              <span className="inline-flex items-center rounded-full border border-cad-border bg-cad-card/70 px-3 py-1 text-xs text-cad-muted">
                {readiness}
              </span>
              <span className="inline-flex items-center rounded-full border border-cad-border bg-cad-card/70 px-3 py-1 text-xs text-cad-muted">
                {departments.length} Workspace{departments.length === 1 ? '' : 's'}
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl xl:text-4xl font-bold tracking-tight text-cad-ink leading-tight">
              {user?.name ? `Welcome back, ${user.name}` : 'CAD Operations Hub'}
            </h1>
            <p className="text-sm sm:text-base text-cad-muted mt-2 max-w-3xl leading-6">
              Select a department workspace to continue into dispatch, lookup, incidents, records, and operational tooling with the correct permissions and workflow context.
            </p>

            <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
              <HomeMetric label="Profile" value={isAdmin ? 'Administrator' : 'Operator'} tone={isAdmin ? 'gold' : 'cad'} />
              <HomeMetric label="Police" value={kinds.police} tone="cad" />
              <HomeMetric label="Dispatch" value={kinds.dispatch} tone="ok" />
              <HomeMetric label="EMS / Fire" value={`${kinds.ems + kinds.fire}`} tone="warn" />
            </div>

            {featured.length > 0 ? (
              <div className="mt-4 rounded-xl border border-cad-border bg-cad-card/60 p-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-cad-muted mb-2">Quick Launch</p>
                <div className="flex flex-wrap gap-2">
                  {featured.map((dept) => (
                    <button
                      key={`quick-${dept.id}`}
                      onClick={() => onSelectDepartment(dept)}
                      className="inline-flex items-center gap-2 rounded-lg border border-cad-border bg-cad-surface px-2.5 py-1.5 text-xs text-cad-ink hover:border-cad-accent/40 transition-colors max-w-full"
                    >
                      {dept.icon ? (
                        <img src={dept.icon} alt="" className="w-4 h-4 object-contain flex-shrink-0" />
                      ) : (
                        <span className="w-4 h-4 rounded bg-cad-card border border-cad-border text-[8px] flex items-center justify-center text-cad-muted flex-shrink-0">
                          {getInitials(dept.short_name || dept.name, 'D').slice(0, 2)}
                        </span>
                      )}
                      <span className="truncate">{dept.short_name || dept.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-cad-border bg-cad-surface/55 p-4 sm:p-5">
            <div className="grid grid-cols-1 gap-3 h-full">
              <div className="rounded-xl border border-cad-border bg-cad-card/70 p-3.5">
                <p className="text-[11px] uppercase tracking-[0.16em] text-cad-muted">Session Status</p>
                <div className="mt-2 space-y-1.5 text-sm">
                  <p><span className="text-cad-muted">Access:</span> <span className="text-cad-ink">{linked ? 'Verified via Discord' : 'Awaiting Discord link'}</span></p>
                  <p><span className="text-cad-muted">Role:</span> <span className="text-cad-ink">{isAdmin ? 'Administrator' : 'Department Operator'}</span></p>
                  <p><span className="text-cad-muted">Available:</span> <span className="text-cad-ink">{departments.length} department workspace{departments.length === 1 ? '' : 's'}</span></p>
                </div>
              </div>

              <div className="rounded-xl border border-cad-border bg-cad-card/70 p-3.5">
                <p className="text-[11px] uppercase tracking-[0.16em] text-cad-muted">Department Coverage</p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <StatRow label="Police" value={kinds.police} />
                  <StatRow label="Dispatch" value={kinds.dispatch} />
                  <StatRow label="EMS" value={kinds.ems} />
                  <StatRow label="Fire" value={kinds.fire} />
                </div>
                {kinds.other > 0 ? (
                  <p className="text-xs text-cad-muted mt-2">Additional workspace types: {kinds.other}</p>
                ) : null}
              </div>

              <div className="rounded-xl border border-cad-border bg-cad-card/70 p-3.5">
                <p className="text-[11px] uppercase tracking-[0.16em] text-cad-muted">Operator Guidance</p>
                <p className="text-xs text-cad-muted leading-5 mt-2">
                  Choose the correct department before going on duty so incidents, units, and reports stay in the correct workflow. Dispatch workspaces can be used without an in-game session.
                </p>
                {isAdmin ? (
                  <button
                    onClick={onOpenAdmin}
                    className="mt-3 w-full rounded-lg border border-cad-gold/30 bg-cad-gold/10 hover:bg-cad-gold/15 px-3 py-2 text-sm font-medium text-cad-ink transition-colors"
                  >
                    Open Admin Workspace
                  </button>
                ) : null}
              </div>
            </div>
          </section>
        </div>

        <section className="flex-1 min-h-0 rounded-2xl border border-cad-border bg-cad-surface/55 p-4 sm:p-5 flex flex-col">
          <div className="flex flex-wrap items-end justify-between gap-2 mb-3 flex-none">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-cad-muted">Department Workspaces</p>
              <h2 className="text-lg sm:text-xl font-semibold mt-1">Select A Workspace</h2>
              <p className="text-xs sm:text-sm text-cad-muted mt-1">All department portals are listed below. If many are available, this panel scrolls without moving the page.</p>
            </div>
            <div className="text-xs uppercase tracking-[0.16em] text-cad-muted">{totalTiles} launch tile{totalTiles === 1 ? '' : 's'}</div>
          </div>

          <div className="flex-1 min-h-0 overflow-auto pr-1">
            <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3">
              {departments.map((dept) => (
                <DepartmentLaunchTile key={dept.id} dept={dept} onSelect={onSelectDepartment} />
              ))}
              {isAdmin ? <AdminLaunchTile onOpen={onOpenAdmin} /> : null}
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}

function StatRow({ label, value }) {
  return (
    <div className="rounded-lg border border-cad-border bg-cad-surface/60 px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-[0.14em] text-cad-muted">{label}</p>
      <p className="text-sm font-semibold mt-1 text-cad-ink">{value}</p>
    </div>
  );
}

function SetupPrompt({ user }) {
  const [linking, setLinking] = useState(false);
  const hasDiscord = !!user?.discord_id;

  async function linkDiscord() {
    setLinking(true);
    try {
      const { url } = await api.post('/api/auth/link-discord');
      window.location.href = url;
    } catch (err) {
      alert('Failed to start Discord linking: ' + err.message);
      setLinking(false);
    }
  }

  return (
    <div className="relative h-full min-h-[560px] max-h-[calc(100vh-128px)] overflow-hidden rounded-3xl border border-cad-border bg-cad-card/90">
      <div className="absolute inset-0 cad-ambient-grid opacity-50" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_8%_8%,rgba(88,101,242,0.2),transparent_36%),radial-gradient(circle_at_96%_10%,rgba(216,180,108,0.15),transparent_38%)]" />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="w-[min(86vw,1100px)] h-[min(82vh,760px)] opacity-[0.09]">
          <img src="/1080.png" alt="" className="w-full h-full object-contain cad-home-watermark-image" />
        </div>
      </div>

      <div className="relative z-10 h-full p-5 sm:p-6 grid grid-cols-1 xl:grid-cols-[1.05fr_0.95fr] gap-4 items-stretch">
        <section className="rounded-2xl border border-cad-border bg-cad-surface/55 p-5 flex flex-col justify-center">
          <p className="text-xs uppercase tracking-[0.18em] text-cad-muted">CAD Access Setup</p>
          <h2 className="text-3xl font-bold tracking-tight mt-3">{!hasDiscord ? 'Link Discord To Start' : 'No Department Access Yet'}</h2>
          <p className="text-cad-muted mt-3 leading-6 max-w-2xl">
            {!hasDiscord
              ? 'Link your Discord account to unlock CAD access. Your Discord roles determine which department workspaces you can enter.'
              : 'Your Discord account is linked, but no departments are assigned yet. Ask an administrator to map your Discord roles to CAD departments.'}
          </p>
          {!hasDiscord ? (
            <button
              onClick={linkDiscord}
              disabled={linking}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#5865F2] hover:bg-[#4752C4] text-white px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50 self-start"
            >
              {linking ? 'Redirecting to Discord...' : 'Link Discord Account'}
            </button>
          ) : null}
        </section>

        <section className="rounded-2xl border border-cad-border bg-cad-surface/55 p-5 flex flex-col">
          <p className="text-xs uppercase tracking-[0.16em] text-cad-muted mb-3">Setup Checklist</p>
          <div className="space-y-3">
            <StepRow number="1" text="Link your Discord account to your CAD user." done={hasDiscord} />
            <StepRow number="2" text="Ensure your Discord roles are mapped to departments in Admin." done={false} />
            <StepRow number="3" text="Return here and launch your assigned workspace." done={false} />
          </div>
          {hasDiscord ? (
            <div className="mt-4 rounded-xl border border-cad-border bg-cad-card/70 p-3">
              <p className="text-sm font-medium">{user?.discord_name || 'Discord Account Linked'}</p>
              <p className="text-xs text-cad-muted mt-1">Linked successfully. Waiting for department role mappings.</p>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function StepRow({ number, text, done = false }) {
  return (
    <div className="flex gap-3 items-start rounded-xl border border-cad-border bg-cad-card/70 p-3">
      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${done ? 'bg-emerald-500/20 text-emerald-300' : 'bg-[#5865F2]/20 text-[#9ca8ff]'}`}>
        {done ? 'OK' : number}
      </span>
      <p className="text-sm text-cad-muted leading-relaxed">{text}</p>
    </div>
  );
}

function SetupBanner({ user }) {
  const [linking, setLinking] = useState(false);
  const hasDiscord = !!user?.discord_id;

  async function linkDiscord() {
    setLinking(true);
    try {
      const { url } = await api.post('/api/auth/link-discord');
      window.location.href = url;
    } catch (err) {
      alert('Failed to start Discord linking: ' + err.message);
      setLinking(false);
    }
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-[#5865F2]/25 bg-[#5865F2]/8 p-3 mb-4">
      <div className="absolute inset-0 bg-gradient-to-r from-[#5865F2]/10 to-transparent" />
      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[#cdd4ff]">
          {!hasDiscord ? 'Link your Discord account to access departments.' : 'No department access yet. Ensure your Discord roles are mapped.'}
        </p>
        {!hasDiscord ? (
          <button
            onClick={linkDiscord}
            disabled={linking}
            className="px-3 py-1.5 bg-[#5865F2] hover:bg-[#4752C4] text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {linking ? 'Redirecting...' : 'Link Discord'}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const { user, departments, isAdmin } = useAuth();
  const { setActiveDepartment } = useDepartment();

  const departmentList = useMemo(() => (Array.isArray(departments) ? departments : []), [departments]);

  function selectDepartment(dept) {
    setActiveDepartment(dept);
    navigate('/department');
  }

  const needsSetup = !user?.discord_id || departmentList.length === 0;

  if (needsSetup && !isAdmin) {
    return (
      <div className="w-full h-[calc(100vh-132px)]">
        <div className="max-w-7xl mx-auto h-full min-h-0">
          <SetupPrompt user={user} />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-[calc(100vh-132px)]">
      <div className="max-w-7xl mx-auto h-full min-h-0 flex flex-col">
        {needsSetup && isAdmin ? <SetupBanner user={user} /> : null}
        <div className="flex-1 min-h-0">
          <WorkspaceHub
            user={user}
            departments={departmentList}
            isAdmin={isAdmin}
            onSelectDepartment={selectDepartment}
            onOpenAdmin={() => navigate('/admin')}
          />
        </div>
      </div>
    </div>
  );
}
