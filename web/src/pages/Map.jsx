import { useEffect, useRef } from 'react';

function buildDefaultLiveMapUrl() {
  const host = String(import.meta.env.VITE_LIVEMAP_HOST || '103.203.241.35').trim() || '103.203.241.35';
  const port = String(import.meta.env.VITE_LIVEMAP_PORT || '30121').trim() || '30121';
  const protocol = String(import.meta.env.VITE_LIVEMAP_PROTOCOL || 'http').trim().replace(/:$/, '') || 'http';
  return `${protocol}://${host}:${port}/map/`;
}

function resolveLiveMapUrl() {
  if (typeof window === 'undefined') return buildDefaultLiveMapUrl();

  const params = new URLSearchParams(window.location.search);
  const queryValue = String(params.get('livemap') || params.get('livemap_url') || '').trim();
  if (queryValue) return queryValue;

  const configured = String(import.meta.env.VITE_LIVEMAP_URL || '').trim();
  if (configured) return configured;

  return buildDefaultLiveMapUrl();
}

export default function MapPage() {
  const liveMapUrl = resolveLiveMapUrl();
  const autoOpenedRef = useRef(false);

  useEffect(() => {
    if (autoOpenedRef.current) return;
    autoOpenedRef.current = true;
    try {
      window.open(liveMapUrl, '_blank', 'noopener,noreferrer');
    } catch {
      // Ignore popup blocker errors; manual button remains available.
    }
  }, [liveMapUrl]);

  return (
    <div className="-m-6 flex min-h-[calc(100vh-52px)] items-start justify-center bg-cad-bg p-6">
      <div className="w-full max-w-3xl rounded-xl border border-cad-border bg-cad-surface shadow-xl">
        <div className="border-b border-cad-border px-4 py-3">
          <h1 className="text-sm font-semibold text-cad-ink">Live Map (Standalone)</h1>
          <p className="mt-1 text-xs text-cad-muted">
            The livemap is opening in a separate tab for now.
          </p>
        </div>

        <div className="space-y-4 px-4 py-4">
          <div className="rounded-lg border border-cad-border bg-cad-card px-3 py-2">
            <p className="text-[11px] uppercase tracking-wider text-cad-muted">Source</p>
            <p className="mt-1 break-all font-mono text-xs text-cad-ink">{liveMapUrl}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href={liveMapUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center rounded border border-cad-border bg-cad-card px-3 py-2 text-xs text-cad-muted hover:text-cad-ink"
            >
              Open Live Map
            </a>
            <button
              type="button"
              onClick={() => {
                try {
                  window.open(liveMapUrl, '_blank', 'noopener,noreferrer');
                } catch {
                  // Ignore popup blocker errors.
                }
              }}
              className="inline-flex items-center rounded border border-cad-border bg-cad-surface px-3 py-2 text-xs text-cad-muted hover:text-cad-ink"
            >
              Try Open Again
            </button>
          </div>

          <p className="text-xs text-cad-muted">
            Embedded mode is disabled for now because the livemap is running on a separate non-HTTPS endpoint.
          </p>
        </div>
      </div>
    </div>
  );
}
