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

function getDepartmentKindIcon(dept) {
  const kind = getDepartmentKindLabel(dept);
  if (kind === 'Dispatch') return '📡';
  if (kind === 'Fire') return '🔴';
  if (kind === 'EMS') return '🟢';
  return '🔵';
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

function DepartmentCard({ dept, onSelect, index }) {
  const accent = String(dept?.color || '#0052C2').trim() || '#0052C2';
  const kind = getDepartmentKindLabel(dept);
  const logo = String(dept?.icon || '').trim();
  const slogan = String(dept?.slogan || '').trim() || `${kind} workspace`;

  return (
    <button
      onClick={() => onSelect(dept)}
      className="group relative text-left rounded-2xl border overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:shadow-2xl focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-cad-bg"
      style={{
        borderColor: colorWithAlpha(accent, 0.2),
        background: `linear-gradient(145deg, ${colorWithAlpha(accent, 0.06)}, rgba(26,35,50,0.95))`,
        boxShadow: `0 4px 20px ${colorWithAlpha(accent, 0.08)}`,
        animationDelay: `${index * 40}ms`,
      }}
    >
      {/* Hover glow */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
        style={{ background: `linear-gradient(145deg, ${colorWithAlpha(accent, 0.12)}, transparent 60%)` }}
      />

      {/* Accent bar */}
      <div className="absolute top-0 left-0 right-0 h-0.5" style={{ backgroundColor: accent, opacity: 0.7 }} />

      {/* Background logo */}
      {logo && (
        <div className="absolute right-0 bottom-0 w-24 h-24 opacity-[0.045] pointer-events-none">
          <img src={logo} alt="" className="w-full h-full object-contain" style={{ filter: 'grayscale(1) brightness(2)' }} />
        </div>
      )}

      <div className="relative p-4 flex flex-col gap-3">
        {/* Header row */}
        <div className="flex items-start gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0 border"
            style={{ borderColor: colorWithAlpha(accent, 0.3), backgroundColor: colorWithAlpha(accent, 0.12) }}
          >
            {logo ? (
              <img src={logo} alt="" className="w-7 h-7 object-contain" />
            ) : (
              <span className="text-xs font-bold text-white">{getInitials(dept?.short_name || dept?.name)}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-cad-ink leading-tight truncate">{dept?.name || 'Department'}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: accent, boxShadow: `0 0 6px ${colorWithAlpha(accent, 0.8)}` }}
              />
              <span className="text-[10px] uppercase tracking-widest text-cad-muted">{kind}</span>
            </div>
          </div>
          <div
            className="flex-shrink-0 text-[10px] uppercase tracking-wider px-2 py-1 rounded-lg border font-medium transition-all group-hover:scale-105"
            style={{
              borderColor: colorWithAlpha(accent, 0.3),
              backgroundColor: colorWithAlpha(accent, 0.1),
              color: '#c8d8f4',
            }}
          >
            Launch
          </div>
        </div>

        {/* Slogan */}
        <p className="text-xs text-cad-muted line-clamp-2 leading-relaxed">{slogan}</p>
      </div>
    </button>
  );
}

function AdminCard({ onOpen }) {
  return (
    <button
      onClick={onOpen}
      className="group relative text-left rounded-2xl border border-cad-gold/20 overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:shadow-2xl focus:outline-none"
      style={{
        background: 'linear-gradient(145deg, rgba(216,180,108,0.06), rgba(26,35,50,0.95))',
        boxShadow: '0 4px 20px rgba(216,180,108,0.06)',
      }}
    >
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'linear-gradient(145deg, rgba(216,180,108,0.1), transparent 60%)' }} />
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-cad-gold opacity-60" />
      <div className="relative p-4 flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border border-cad-gold/25 bg-cad-gold/10">
            <svg className="w-5 h-5 text-cad-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-cad-ink leading-tight">Administration</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-cad-gold flex-shrink-0" style={{ boxShadow: '0 0 6px rgba(216,180,108,0.8)' }} />
              <span className="text-[10px] uppercase tracking-widest text-cad-muted">Admin</span>
            </div>
          </div>
          <div className="flex-shrink-0 text-[10px] uppercase tracking-wider px-2 py-1 rounded-lg border border-cad-gold/25 bg-cad-gold/10 font-medium text-cad-gold">
            Open
          </div>
        </div>
        <p className="text-xs text-cad-muted leading-relaxed">Manage departments, Discord sync, alarm zones, and platform configuration.</p>
      </div>
    </button>
  );
}

function StatusPill({ label, value, active }) {
  return (
    <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${active ? 'border-cad-accent/25 bg-cad-accent/8' : 'border-cad-border bg-cad-surface/40'}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${active ? 'bg-emerald-400' : 'bg-cad-muted'}`} />
      <div className="min-w-0">
        <p className="text-[9px] uppercase tracking-widest text-cad-muted">{label}</p>
        <p className="text-xs font-semibold text-cad-ink truncate">{value}</p>
      </div>
    </div>
  );
}

function WorkspaceHub({ user, departments, isAdmin, onSelectDepartment, onOpenAdmin }) {
  const linked = !!user?.discord_id;
  const kinds = countDepartmentKinds(departments);
  const totalTiles = departments.length + (isAdmin ? 1 : 0);

  return (
    <div className="flex flex-col h-full gap-0">
      {/* Hero header band */}
      <div
        className="relative overflow-hidden flex-none"
        style={{
          background: 'linear-gradient(135deg, rgba(3,34,97,0.7) 0%, rgba(0,82,194,0.25) 50%, rgba(10,15,26,0) 100%)',
          borderBottom: '1px solid rgba(0,82,194,0.18)',
        }}
      >
        {/* Grid texture */}
        <div className="absolute inset-0 cad-ambient-grid opacity-30 pointer-events-none" />

        {/* Watermark */}
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-[40%] hidden lg:flex items-center justify-end pr-6 opacity-[0.05]">
          <img src="/1080.png" alt="" className="h-full max-h-32 object-contain" style={{ filter: 'grayscale(1) brightness(2)' }} />
        </div>

        <div className="relative px-5 py-5 sm:px-6 sm:py-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              {/* Eyebrow */}
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400" style={{ boxShadow: '0 0 8px rgba(52,211,153,0.7)' }} />
                <span className="text-[10px] uppercase tracking-[0.2em] text-cad-muted">CAD Operations Centre</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-cad-ink leading-tight">
                {user?.name ? `Welcome back, ${user.name.split(' ')[0]}` : 'Operations Hub'}
              </h1>
              <p className="text-sm text-cad-muted mt-1 max-w-lg">
                Select a department workspace to continue into the operational environment.
              </p>
            </div>

            {/* Status pills */}
            <div className="flex flex-wrap gap-2">
              <StatusPill label="Access" value={linked ? 'Discord Verified' : 'Setup Required'} active={linked} />
              <StatusPill label="Workspaces" value={`${departments.length} assigned`} active={departments.length > 0} />
              <StatusPill label="Role" value={isAdmin ? 'Administrator' : 'Operator'} active={true} />
            </div>
          </div>

          {/* Coverage strip */}
          {departments.length > 0 && (
            <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-white/5">
              {kinds.police > 0 && (
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded bg-cad-accent" />
                  <span className="text-xs text-cad-muted">{kinds.police} Police</span>
                </div>
              )}
              {kinds.dispatch > 0 && (
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded bg-emerald-500" />
                  <span className="text-xs text-cad-muted">{kinds.dispatch} Dispatch</span>
                </div>
              )}
              {kinds.ems > 0 && (
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded bg-teal-500" />
                  <span className="text-xs text-cad-muted">{kinds.ems} EMS</span>
                </div>
              )}
              {kinds.fire > 0 && (
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded bg-red-500" />
                  <span className="text-xs text-cad-muted">{kinds.fire} Fire</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Department grid area */}
      <div className="flex-1 min-h-0 overflow-auto p-5 sm:p-6">
        {totalTiles === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center max-w-sm">
              <div className="w-16 h-16 rounded-2xl border border-cad-border bg-cad-surface flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-cad-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-cad-ink">No workspaces assigned</p>
              <p className="text-xs text-cad-muted mt-1">Contact an administrator to assign department access via Discord roles.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-cad-muted">{totalTiles} workspace{totalTiles !== 1 ? 's' : ''} available</p>
              {isAdmin && (
                <button
                  onClick={onOpenAdmin}
                  className="text-xs text-cad-muted hover:text-cad-gold transition-colors flex items-center gap-1"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Admin Panel
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
              {departments.map((dept, i) => (
                <DepartmentCard key={dept.id} dept={dept} onSelect={onSelectDepartment} index={i} />
              ))}
              {isAdmin && <AdminCard onOpen={onOpenAdmin} />}
            </div>
          </>
        )}
      </div>

      {/* Session footer bar */}
      <div className="flex-none border-t border-cad-border bg-cad-surface/40 px-5 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${linked ? 'bg-emerald-400' : 'bg-amber-400'}`} style={linked ? { boxShadow: '0 0 8px rgba(52,211,153,0.7)' } : {}} />
            <span className="text-xs text-cad-muted">{linked ? `Discord: ${user?.discord_name || 'Linked'}` : 'Discord not linked'}</span>
          </div>
          {user?.name && (
            <span className="text-xs text-cad-muted hidden sm:block">Steam: {user.name}</span>
          )}
        </div>
        <p className="text-[10px] uppercase tracking-wider text-cad-muted">
          Select a workspace above to enter the operational environment
        </p>
      </div>
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
    <div className="relative h-full overflow-hidden rounded-3xl border border-cad-border bg-cad-card/90 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
      <div className="absolute inset-0 cad-ambient-grid opacity-35" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_12%,rgba(88,101,242,0.22),transparent_36%),radial-gradient(circle_at_92%_10%,rgba(216,180,108,0.14),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))]" />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="w-[min(82vw,860px)] h-[min(76vh,700px)] opacity-[0.2]">
          <img src="/1080.png" alt="" className="w-full h-full object-contain cad-home-watermark-image" />
        </div>
      </div>

      <div className="relative z-10 h-full p-4 sm:p-6 grid grid-cols-1 xl:grid-cols-[1.08fr_0.92fr] gap-4 items-stretch">
        <section className="rounded-2xl border border-cad-border bg-cad-surface/55 p-5 sm:p-6 flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-amber-400" style={{ boxShadow: '0 0 10px rgba(251,191,36,0.75)' }} />
            <span className="text-[11px] uppercase tracking-[0.18em] text-cad-muted">Setup Required</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-cad-ink">
            {!hasDiscord ? 'Link Discord To Continue' : 'Awaiting Department Role Access'}
          </h1>
          <p className="text-sm sm:text-base text-cad-muted mt-2 leading-6 max-w-2xl">
            {!hasDiscord
              ? 'Your Discord roles determine which department workspaces appear in CAD. Link your Discord account to continue.'
              : 'Your Discord account is linked. A CAD administrator now needs to map your Discord roles to department access.'}
          </p>

          <div className="mt-5 space-y-3">
            {[
              { label: 'Link Discord account to your CAD profile', done: hasDiscord },
              { label: 'Admin maps Discord roles to departments', done: false },
              { label: 'Select and launch an assigned workspace', done: false },
            ].map((step, i) => (
              <div
                key={step.label}
                className={`flex items-center gap-4 rounded-xl border p-3.5 ${step.done ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-cad-border bg-cad-card/65'}`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold ${step.done ? 'bg-emerald-500/20 text-emerald-300' : 'bg-cad-surface border border-cad-border text-cad-muted'}`}>
                  {step.done ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (i + 1)}
                </div>
                <p className={`text-sm leading-5 ${step.done ? 'text-emerald-200' : 'text-cad-muted'}`}>{step.label}</p>
              </div>
            ))}
          </div>

          <div className="mt-auto pt-5">
            {!hasDiscord ? (
              <button
                onClick={linkDiscord}
                disabled={linking}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-3 rounded-xl bg-[#5865F2] hover:bg-[#4752C4] text-white px-4 py-3 text-sm font-semibold transition-colors disabled:opacity-50"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.04.035.052a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
                </svg>
                {linking ? 'Redirecting to Discord...' : 'Link Discord Account'}
              </button>
            ) : (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3.5 py-3">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <p className="text-sm font-medium text-emerald-200">{user?.discord_name || 'Discord linked'}</p>
                </div>
                <p className="text-xs text-cad-muted mt-1">
                  Waiting for department role assignment from an administrator.
                </p>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-cad-border bg-cad-surface/55 p-5 sm:p-6 flex flex-col">
          <p className="text-[11px] uppercase tracking-[0.16em] text-cad-muted mb-3">What Happens Next</p>
          <div className="space-y-3">
            <div className="rounded-xl border border-cad-border bg-cad-card/70 p-3.5">
              <p className="text-sm font-medium text-cad-ink">Role-based department access</p>
              <p className="text-xs text-cad-muted mt-1 leading-5">
                CAD reads your Discord roles and shows only the workspaces your account is authorised to use.
              </p>
            </div>
            <div className="rounded-xl border border-cad-border bg-cad-card/70 p-3.5">
              <p className="text-sm font-medium text-cad-ink">Operational access checks</p>
              <p className="text-xs text-cad-muted mt-1 leading-5">
                Some modules require an active FiveM session once you enter a department workspace. Dispatch is exempt.
              </p>
            </div>
            <div className="rounded-xl border border-cad-border bg-cad-card/70 p-3.5">
              <p className="text-sm font-medium text-cad-ink">Admin action (if needed)</p>
              <p className="text-xs text-cad-muted mt-1 leading-5">
                If Discord is linked but no departments appear, ask an admin to map your Discord roles to CAD departments.
              </p>
            </div>
          </div>
        </section>
      </div>
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
    <div className="relative overflow-hidden rounded-2xl border border-amber-500/20 bg-amber-500/6 px-4 py-3.5 mb-4">
      <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 via-transparent to-transparent" />
      <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg border border-amber-500/20 bg-amber-500/10 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-amber-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-amber-300/90">Setup Attention Required</p>
            <p className="text-sm text-amber-100 mt-0.5">
              {!hasDiscord
                ? 'Link your Discord account to access department workspaces.'
                : 'Discord linked - no departments are role-mapped yet.'}
            </p>
          </div>
        </div>
        {!hasDiscord && (
          <button
            onClick={linkDiscord}
            disabled={linking}
            className="flex-shrink-0 px-3.5 py-2 bg-[#5865F2] hover:bg-[#4752C4] text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
          >
            {linking ? 'Redirecting...' : 'Link Discord'}
          </button>
        )}
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
      <div className="w-full h-[calc(100vh-56px)] flex flex-col overflow-hidden">
        <div className="flex-1 min-h-0 max-w-2xl w-full mx-auto flex flex-col">
          <SetupPrompt user={user} />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-[calc(100vh-56px)] flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0 flex flex-col">
        {needsSetup && isAdmin ? <SetupBanner user={user} /> : null}
        <div className="flex-1 min-h-0 rounded-none overflow-hidden border-b border-cad-border" style={{ background: 'rgba(10,15,26,0.97)' }}>
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
