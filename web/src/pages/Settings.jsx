import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

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

function SettingsPanel({ title, subtitle, children, className = '' }) {
  return (
    <section className={`rounded-2xl border border-cad-border bg-cad-card/80 p-4 sm:p-5 ${className}`}>
      <div className="mb-3">
        <h3 className="text-base font-semibold text-cad-ink">{title}</h3>
        {subtitle ? <p className="text-sm text-cad-muted mt-1">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

function StatusBanner({ tone = 'ok', children }) {
  const toneClasses = tone === 'ok'
    ? 'border-emerald-500/25 bg-emerald-500/8 text-emerald-200'
    : 'border-red-500/25 bg-red-500/8 text-red-200';
  return (
    <div className={`rounded-xl border px-3 py-2.5 text-sm ${toneClasses}`}>
      {children}
    </div>
  );
}

export default function Settings() {
  const { user, refreshUser } = useAuth();
  const [searchParams] = useSearchParams();
  const [linking, setLinking] = useState(false);
  const [unlinking, setUnlinking] = useState(false);

  const discordLinked = searchParams.get('discord') === 'linked';
  const error = searchParams.get('error');

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

  async function unlinkDiscord() {
    if (!confirm('Unlink your Discord account? You will lose department access.')) return;
    setUnlinking(true);
    try {
      await api.post('/api/auth/unlink-discord');
      await refreshUser();
    } catch (err) {
      alert('Failed to unlink: ' + err.message);
    } finally {
      setUnlinking(false);
    }
  }

  if (!user) return null;

  const departments = Array.isArray(user.departments) ? user.departments : [];

  return (
    <div className="w-full">
      <div className="max-w-5xl mx-auto">
        <section className="relative overflow-hidden rounded-3xl border border-cad-border bg-cad-card/85 shadow-[0_18px_60px_rgba(0,0,0,0.24)]">
          <div className="absolute inset-0 cad-ambient-grid opacity-30" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_8%_12%,rgba(43,127,255,0.18),transparent_36%),radial-gradient(circle_at_92%_10%,rgba(88,101,242,0.16),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))]" />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="w-[min(82vw,980px)] h-[min(72vh,680px)] opacity-[0.18]">
              <img src="/1080.png" alt="" className="w-full h-full object-contain cad-home-watermark-image" />
            </div>
          </div>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-cad-bg/5 via-transparent to-cad-bg/30" />

          <div className="relative z-10 p-4 sm:p-6 space-y-4">
            <section className="rounded-2xl border border-cad-border bg-cad-surface/55 p-4 sm:p-5">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex items-start gap-4 min-w-0">
                  {user.avatar_url ? (
                    <img src={user.avatar_url} alt="" className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl border border-cad-border object-cover bg-cad-surface flex-shrink-0" />
                  ) : (
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl border border-cad-border bg-cad-surface flex items-center justify-center text-cad-muted text-xl font-semibold flex-shrink-0">
                      {String(user.steam_name || user.name || 'U').slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-cad-muted">Profile Settings</p>
                    <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mt-1 truncate">
                      {user.steam_name || user.name || 'CAD User'}
                    </h2>
                    <p className="text-sm text-cad-muted mt-2 max-w-2xl">
                      Manage your linked accounts and review which department workspaces your current Discord roles grant access to.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 min-w-[220px]">
                  <div className="rounded-xl border border-cad-border bg-cad-card/70 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-cad-muted">Steam</p>
                    <p className="text-sm font-semibold mt-1 text-emerald-300">Linked</p>
                  </div>
                  <div className="rounded-xl border border-cad-border bg-cad-card/70 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-cad-muted">Discord</p>
                    <p className={`text-sm font-semibold mt-1 ${user.discord_id ? 'text-emerald-300' : 'text-amber-300'}`}>
                      {user.discord_id ? 'Linked' : 'Not Linked'}
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {(discordLinked || error) && (
              <div className="space-y-2">
                {discordLinked ? (
                  <StatusBanner tone="ok">
                    Discord account linked successfully. Department access will sync from your Discord roles.
                  </StatusBanner>
                ) : null}
                {error ? (
                  <StatusBanner tone="error">
                    Error: {String(error).replace(/_/g, ' ')}
                  </StatusBanner>
                ) : null}
              </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-[1.05fr_0.95fr] gap-4">
              <div className="space-y-4">
                <SettingsPanel
                  title="Steam Account"
                  subtitle="Primary CAD sign-in identity used for profile and in-game linkage."
                >
                  <div className="rounded-xl border border-cad-border bg-cad-surface/70 p-3.5">
                    <div className="flex items-center gap-3">
                      {user.avatar_url ? (
                        <img src={user.avatar_url} alt="" className="w-12 h-12 rounded-xl border border-cad-border object-cover" />
                      ) : null}
                      <div className="min-w-0">
                        <p className="font-medium text-cad-ink truncate">{user.steam_name || 'Steam user'}</p>
                        <p className="text-xs text-cad-muted font-mono break-all">{user.steam_id}</p>
                      </div>
                    </div>
                  </div>
                </SettingsPanel>

                <SettingsPanel
                  title="Discord Account"
                  subtitle="Required for department access, role sync, and automated permissions."
                >
                  {user.discord_id ? (
                    <div className="space-y-3">
                      <div className="rounded-xl border border-cad-border bg-cad-surface/70 p-3.5 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-cad-ink truncate">{user.discord_name || 'Discord account'}</p>
                          <p className="text-xs text-cad-muted font-mono break-all">{user.discord_id}</p>
                        </div>
                        <span className="inline-flex items-center rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300">
                          Linked
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={unlinkDiscord}
                          disabled={unlinking}
                          className="px-3.5 py-2 text-sm bg-red-500/10 text-red-300 border border-red-500/25 rounded-lg hover:bg-red-500/15 transition-colors disabled:opacity-50"
                        >
                          {unlinking ? 'Unlinking...' : 'Unlink Discord'}
                        </button>
                        <p className="text-xs text-cad-muted self-center">
                          Unlinking will remove department access until Discord is re-linked.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-cad-border bg-cad-surface/70 p-3.5">
                      <p className="text-sm text-cad-muted leading-6">
                        Link your Discord account to sync role-based department access and unlock CAD workspaces.
                      </p>
                      <button
                        onClick={linkDiscord}
                        disabled={linking}
                        className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-[#5865F2] hover:bg-[#4752C4] text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                      >
                        <span className="w-2 h-2 rounded-full bg-white/80" />
                        {linking ? 'Redirecting to Discord...' : 'Link Discord Account'}
                      </button>
                    </div>
                  )}
                </SettingsPanel>
              </div>

              <div className="space-y-4">
                <SettingsPanel
                  title="Department Access"
                  subtitle="Workspaces currently available to this user based on linked Discord roles."
                >
                  {departments.length > 0 ? (
                    <div className="space-y-2">
                      {departments.map((dept) => (
                        <div
                          key={dept.id}
                          className="flex items-center gap-3 rounded-xl border border-cad-border bg-cad-surface/70 px-3 py-2.5"
                          style={{ boxShadow: `inset 0 1px 0 ${colorWithAlpha(dept.color, 0.08)}` }}
                        >
                          <div
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: dept.color || '#0052C2', boxShadow: `0 0 10px ${colorWithAlpha(dept.color, 0.45)}` }}
                          />
                          {dept.icon ? (
                            <img src={dept.icon} alt="" className="w-5 h-5 object-contain flex-shrink-0" />
                          ) : null}
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-cad-ink truncate">{dept.name}</p>
                            <p className="text-xs text-cad-muted truncate">{dept.short_name || 'Department'}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-cad-border bg-cad-surface/70 p-3.5">
                      <p className="text-sm text-cad-muted leading-6">
                        No department access yet. {!user.discord_id
                          ? 'Link your Discord account first.'
                          : 'Ask an administrator to map your Discord roles to CAD departments.'}
                      </p>
                    </div>
                  )}
                </SettingsPanel>

                <SettingsPanel
                  title="How access works"
                  subtitle="Quick reference for users and admins."
                >
                  <ol className="space-y-2.5">
                    {[
                      'Sign in with Steam to create your CAD identity.',
                      'Link Discord to enable role-based department access.',
                      'Admin role mappings determine which workspaces appear in CAD.',
                      'Some operational modules require an active FiveM session.',
                    ].map((item, index) => (
                      <li key={item} className="flex items-start gap-3">
                        <span className="w-5 h-5 mt-0.5 rounded-full border border-cad-border bg-cad-surface text-[11px] flex items-center justify-center text-cad-ink">
                          {index + 1}
                        </span>
                        <span className="text-sm text-cad-muted leading-5">{item}</span>
                      </li>
                    ))}
                  </ol>
                </SettingsPanel>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
