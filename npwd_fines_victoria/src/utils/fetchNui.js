const DEFAULT_CAD_BRIDGE_RESOURCES = ['cad_bridge', 'fivem-resource', 'fivem_resource'];

function normalizeCadBridgeResourceName(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  // FiveM resource names are simple slug-like values.
  if (!/^[a-z0-9_-]+$/i.test(text)) return '';
  return text;
}

function dedupeList(values) {
  const out = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const normalized = normalizeCadBridgeResourceName(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function resolveCadBridgeResourceCandidates() {
  const candidates = [];
  if (typeof window !== 'undefined') {
    const explicitCandidates = [
      window.CAD_BRIDGE_RESOURCE,
      window.cadBridgeResource,
      window.__CAD_BRIDGE_RESOURCE__,
      window.__cadBridgeResource__,
    ];
    if (Array.isArray(window.CAD_BRIDGE_RESOURCES)) explicitCandidates.push(...window.CAD_BRIDGE_RESOURCES);
    if (Array.isArray(window.__CAD_BRIDGE_RESOURCES__)) explicitCandidates.push(...window.__CAD_BRIDGE_RESOURCES__);

    try {
      const search = new URLSearchParams(String(window.location?.search || ''));
      explicitCandidates.push(search.get('cadBridgeResource'));
      explicitCandidates.push(search.get('cad_bridge_resource'));
    } catch {
      // no-op
    }
    try {
      explicitCandidates.push(window.localStorage?.getItem('cad_bridge_resource'));
    } catch {
      // no-op
    }

    candidates.push(...explicitCandidates);
  }
  candidates.push(...DEFAULT_CAD_BRIDGE_RESOURCES);
  return dedupeList(candidates);
}

function buildCadBridgeEndpoints() {
  const resources = resolveCadBridgeResourceCandidates();
  const endpoints = [];
  for (const resourceName of resources) {
    // Prefer explicit cfx-nui first, then generic endpoint for CEF/runtime variants.
    endpoints.push(`https://cfx-nui-${resourceName}`);
    endpoints.push(`https://${resourceName}`);
  }
  return endpoints;
}

function isEmptyObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0;
}

function looksLikeCadBridgePayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if ('ok' in value || 'success' in value || 'error' in value || 'message' in value) return true;
  if ('payload' in value || 'notice' in value || 'notices' in value || 'summary' in value) return true;
  return false;
}

function normalizeCadBridgePayload(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (value === false) {
    return {
      ok: false,
      error: 'callback_failed',
      message: 'CAD bridge callback returned false.',
    };
  }
  const text = String(value || '').trim();
  if (!text) {
    return {
      ok: false,
      error: 'invalid_payload',
      message: 'CAD bridge returned an empty payload.',
    };
  }
  return {
    ok: false,
    error: 'invalid_payload',
    message: text,
  };
}

function withTimeout(timeoutMs) {
  const timeout = Math.max(1000, Number(timeoutMs) || 10000);
  if (typeof AbortController === 'undefined') {
    return { signal: undefined, cancel: () => {}, timeout };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Request timed out')), timeout);
  return {
    signal: controller.signal,
    timeout,
    cancel: () => clearTimeout(timer),
  };
}

async function postJson(url, body, timeoutMs) {
  const control = withTimeout(timeoutMs);
  try {
    const fetchPromise = fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
      },
      cache: 'no-store',
      credentials: 'omit',
      signal: control.signal,
      body: JSON.stringify(body || {}),
    });
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('CAD bridge request timed out')), control.timeout || Math.max(1000, Number(timeoutMs) || 10000));
    });
    const resp = await Promise.race([fetchPromise, timeoutPromise]);

    const text = await resp.text();
    let parsed = null;
    try {
      parsed = JSON.parse(text || '{}');
    } catch {
      parsed = null;
    }

    if (!resp.ok) {
      return parsed || {
        ok: false,
        error: 'http_error',
        status: resp.status,
        message: text || `CAD bridge request failed (${resp.status})`,
      };
    }

    return parsed || { ok: false, error: 'invalid_json', message: text || 'Invalid response from CAD bridge' };
  } catch (err) {
    const aborted = String(err?.name || '').toLowerCase() === 'aborterror';
    throw new Error(aborted ? 'CAD bridge request timed out' : String(err?.message || err || 'CAD bridge request failed'));
  } finally {
    control.cancel();
  }
}

export async function fetchCadBridgeNui(eventName, data, options = {}) {
  const event = String(eventName || '').trim();
  if (!event) {
    return { ok: false, error: 'invalid_event', message: 'Missing CAD bridge event name' };
  }

  const timeoutMs = Math.max(1000, Number(options.timeoutMs) || 10000);
  const endpoints = buildCadBridgeEndpoints();
  let lastErr = null;
  for (const baseUrl of endpoints) {
    try {
      const response = normalizeCadBridgePayload(await postJson(`${baseUrl}/${event}`, data, timeoutMs));
      if (isEmptyObject(response) || !looksLikeCadBridgePayload(response)) {
        lastErr = new Error(`Invalid CAD bridge callback payload from ${baseUrl}`);
        continue;
      }
      if (response && typeof response === 'object' && !response.__endpoint) {
        return { ...response, __endpoint: baseUrl };
      }
      return response;
    } catch (err) {
      lastErr = err;
    }
  }

  return {
    ok: false,
    error: 'bridge_unreachable',
    message: String(lastErr?.message || 'Unable to contact CAD bridge'),
  };
}
