function AuthFeature({ title, body }) {
  return (
    <div className="rounded-xl border border-cad-border bg-cad-card/70 px-3 py-2.5">
      <p className="text-sm font-medium text-cad-ink">{title}</p>
      <p className="text-xs text-cad-muted mt-1 leading-5">{body}</p>
    </div>
  );
}

export default function Login() {
  return (
    <div className="min-h-screen bg-cad-bg p-4 sm:p-6 flex items-center justify-center">
      <div className="w-full max-w-5xl">
        <section className="relative overflow-hidden rounded-3xl border border-cad-border bg-cad-card/90 shadow-[0_24px_80px_rgba(0,0,0,0.34)]">
          <div className="absolute inset-0 cad-ambient-grid opacity-35" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_8%_10%,rgba(43,127,255,0.22),transparent_36%),radial-gradient(circle_at_92%_12%,rgba(216,180,108,0.14),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))]" />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="w-[min(85vw,1050px)] h-[min(78vh,720px)] opacity-[0.22]">
              <img src="/1080.png" alt="" className="w-full h-full object-contain cad-home-watermark-image" />
            </div>
          </div>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-cad-bg/10 via-transparent to-cad-bg/45" />

          <div className="relative z-10 grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-4 p-4 sm:p-6">
            <section className="rounded-2xl border border-cad-border bg-cad-surface/55 p-5 sm:p-6">
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <span className="inline-flex items-center rounded-full border border-cad-border bg-cad-card/70 px-3 py-1 text-xs uppercase tracking-[0.16em] text-cad-muted">
                  Secure Access
                </span>
                <span className="inline-flex items-center rounded-full border border-cad-border bg-cad-card/70 px-3 py-1 text-xs text-cad-muted">
                  Steam Authentication
                </span>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl border border-cad-gold/25 bg-cad-surface/80 flex items-center justify-center shadow-inner">
                  <svg className="w-9 h-9 sm:w-11 sm:h-11 text-cad-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.4}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <h1 className="text-2xl sm:text-3xl xl:text-4xl font-bold tracking-tight text-cad-ink">
                    CAD Operations Portal
                  </h1>
                  <p className="text-sm sm:text-base text-cad-muted mt-2 leading-6 max-w-2xl">
                    Sign in with Steam to access the CAD. Your profile, audit trail identity, and in-game linkage all start from your Steam account.
                  </p>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-cad-border bg-cad-card/70 p-4">
                <p className="text-[11px] uppercase tracking-[0.16em] text-cad-muted mb-3">Sign In</p>
                <a
                  href="/api/auth/steam"
                  className="group inline-flex items-center gap-3 px-4 py-3 bg-[#171a21] hover:bg-[#223246] border border-[#2a475e] rounded-xl text-white font-medium transition-colors w-full justify-center shadow-[0_10px_24px_rgba(0,0,0,0.25)]"
                >
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M11.979 0C5.678 0 .511 4.86.022 10.928l6.432 2.658a3.387 3.387 0 011.912-.588c.063 0 .125.002.188.006l2.861-4.142V8.77c0-2.587 2.105-4.692 4.692-4.692 2.587 0 4.692 2.105 4.692 4.692 0 2.587-2.105 4.693-4.692 4.693h-.11l-4.076 2.911c0 .047.002.094.002.142 0 1.94-1.578 3.517-3.517 3.517-1.735 0-3.174-1.269-3.454-2.93L.533 14.568C1.905 19.848 6.49 23.754 12 23.754c6.627 0 12-5.373 12-12C24 5.373 18.627 0 12 0h-.021z" />
                  </svg>
                  <span>Sign In With Steam</span>
                  <span className="text-white/70 text-xs group-hover:text-white/90 transition-colors">OpenID</span>
                </a>

                <div className="mt-3 rounded-xl border border-cad-border bg-cad-surface/70 p-3">
                  <p className="text-xs font-medium text-cad-ink mb-1">Privacy & account data</p>
                  <p className="text-xs text-cad-muted leading-5">
                    CAD stores your Steam ID, display name and avatar to create your user profile, preserve identity in logs, and link your in-game session for protected workflows.
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-cad-border bg-cad-surface/55 p-5 sm:p-6 flex flex-col">
              <p className="text-[11px] uppercase tracking-[0.16em] text-cad-muted mb-3">Access Overview</p>
              <div className="space-y-3">
                <AuthFeature
                  title="Department workspaces"
                  body="Discord role mappings determine which police, dispatch, EMS, fire, and admin workspaces you can access after login."
                />
                <AuthFeature
                  title="In-game protected workflows"
                  body="Certain modules (records, warrants, evidence, incidents) require an active FiveM session unless you are in a dispatch workspace."
                />
                <AuthFeature
                  title="Role synchronisation"
                  body="CAD can synchronise Discord roles from QBox jobs and grades so permissions update automatically as players change roles."
                />
              </div>

              <div className="mt-4 rounded-2xl border border-cad-border bg-cad-card/70 p-4">
                <p className="text-[11px] uppercase tracking-[0.16em] text-cad-muted">After login</p>
                <ol className="mt-3 space-y-2">
                  {[
                    'Link Discord account (if not already linked)',
                    'Select your department workspace',
                    'Go on duty and start operational tasks',
                  ].map((step, index) => (
                    <li key={step} className="flex items-start gap-3">
                      <span className="w-5 h-5 mt-0.5 rounded-full border border-cad-border bg-cad-surface flex items-center justify-center text-[11px] text-cad-ink">
                        {index + 1}
                      </span>
                      <span className="text-sm text-cad-muted leading-5">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </section>
          </div>
        </section>
      </div>
    </div>
  );
}
