import { useEffect, useRef, useState } from 'react';

function buildDefaultLiveMapUrl() {
  const host = String(import.meta.env.VITE_LIVEMAP_HOST || '103.203.241.35').trim() || '103.203.241.35';
  const port = String(import.meta.env.VITE_LIVEMAP_PORT || '30122').trim() || '30122';
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

function buildProbeUrl(liveMapUrl) {
  try {
    const url = new URL(String(liveMapUrl || ''));
    const basePath = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
    url.pathname = `${basePath}version.json`;
    url.search = '';
    return url.toString();
  } catch {
    return String(liveMapUrl || '');
  }
}

function isHttpsToHttpMixedContent(targetUrl) {
  if (typeof window === 'undefined') return false;
  try {
    const current = new URL(window.location.href);
    const target = new URL(String(targetUrl || ''));
    return current.protocol === 'https:' && target.protocol === 'http:';
  } catch {
    return false;
  }
}

async function probeLiveMap(url, timeoutMs = 4000) {
  if (!url) {
    return { status: 'invalid', message: 'Livemap URL is empty.' };
  }

  if (isHttpsToHttpMixedContent(url)) {
    return {
      status: 'probe_blocked',
      message: 'CAD is HTTPS but livemap is HTTP. Browser blocks in-page connectivity probes (mixed content).',
    };
  }

  const controller = new AbortController();
  const timerId = window.setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 4000));

  try {
    await fetch(buildProbeUrl(url), {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal,
    });
    return { status: 'reachable', message: 'Livemap endpoint responded to a probe request.' };
  } catch (err) {
    if (err?.name === 'AbortError') {
      return { status: 'timeout', message: `No response within ${Math.floor(timeoutMs / 1000)}s.` };
    }
    return {
      status: 'unreachable',
      message: 'Browser could not reach the livemap endpoint (service down, firewall, or network timeout).',
    };
  } finally {
    window.clearTimeout(timerId);
  }
}

export default function MapPage() {
  const liveMapUrl = resolveLiveMapUrl();
  const autoOpenedRef = useRef(false);
  const [popupStatus, setPopupStatus] = useState('idle');
  const [probe, setProbe] = useState({ status: 'checking', message: 'Checking livemap endpoint...' });

  useEffect(() => {
    if (autoOpenedRef.current) return;
    autoOpenedRef.current = true;
    try {
      const opened = window.open(liveMapUrl, '_blank', 'noopener,noreferrer');
      setPopupStatus(opened ? 'opened' : 'blocked');
    } catch {
      setPopupStatus('blocked');
    }
  }, [liveMapUrl]);

  useEffect(() => {
    let cancelled = false;
    setProbe({ status: 'checking', message: 'Checking livemap endpoint...' });

    (async () => {
      const result = await probeLiveMap(liveMapUrl, 4000);
      if (!cancelled) setProbe(result);
    })();

    return () => {
      cancelled = true;
    };
  }, [liveMapUrl]);

  const probeToneClass = probe.status === 'reachable'
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
    : probe.status === 'checking'
      ? 'border-sky-500/30 bg-sky-500/10 text-sky-300'
      : probe.status === 'probe_blocked'
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
        : 'border-red-500/30 bg-red-500/10 text-red-300';

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
          <div className={`rounded-lg border px-3 py-2 ${probeToneClass}`}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="text-[11px] uppercase tracking-wider font-semibold">
                Status: {probe.status.replace(/_/g, ' ')}
              </p>
              <p className="text-xs">
                {probe.message}
              </p>
            </div>
            {popupStatus === 'blocked' && (
              <p className="mt-1 text-xs text-cad-muted">
                Popup may have been blocked. Use the button below to open the livemap manually.
              </p>
            )}
          </div>

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
                  const opened = window.open(liveMapUrl, '_blank', 'noopener,noreferrer');
                  setPopupStatus(opened ? 'opened' : 'blocked');
                } catch {
                  setPopupStatus('blocked');
                }
              }}
              className="inline-flex items-center rounded border border-cad-border bg-cad-surface px-3 py-2 text-xs text-cad-muted hover:text-cad-ink"
            >
              Try Open Again
            </button>
            <button
              type="button"
              onClick={async () => {
                setProbe({ status: 'checking', message: 'Checking livemap endpoint...' });
                const result = await probeLiveMap(liveMapUrl, 4000);
                setProbe(result);
              }}
              className="inline-flex items-center rounded border border-cad-border bg-cad-surface px-3 py-2 text-xs text-cad-muted hover:text-cad-ink"
            >
              Test Connectivity
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
