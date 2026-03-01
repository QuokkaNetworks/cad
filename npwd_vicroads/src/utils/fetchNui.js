const CAD_BRIDGE_RESOURCE = 'cad_bridge';
const CAD_BRIDGE_ENDPOINTS = [
  `https://cfx-nui-${CAD_BRIDGE_RESOURCE}`,
  `https://${CAD_BRIDGE_RESOURCE}`,
];

function isEmptyObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0;
}

function looksLikeCadBridgePayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if ('ok' in value || 'success' in value || 'error' in value || 'message' in value) return true;
  if ('payload' in value || 'notice' in value || 'notices' in value || 'summary' in value) return true;
  return false;
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
  let lastErr = null;
  for (const baseUrl of CAD_BRIDGE_ENDPOINTS) {
    try {
      const response = await postJson(`${baseUrl}/${event}`, data, timeoutMs);
      if (isEmptyObject(response) || !looksLikeCadBridgePayload(response)) {
        lastErr = new Error(`Invalid CAD bridge callback payload from ${baseUrl}`);
        continue;
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
