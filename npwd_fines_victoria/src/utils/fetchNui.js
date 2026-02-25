const CAD_BRIDGE_RESOURCE = 'cad_bridge';
const IS_PROD = typeof import.meta !== 'undefined' && import.meta.env?.PROD === true;
// Qbox NPWD is most reliable with the explicit cfx-nui endpoint. The generic
// `https://cad_bridge` fallback can trigger browser-style dialogs in some CEF builds.
const CAD_BRIDGE_ENDPOINTS = IS_PROD
  ? [`https://cfx-nui-${CAD_BRIDGE_RESOURCE}`]
  : [`https://cfx-nui-${CAD_BRIDGE_RESOURCE}`, `https://${CAD_BRIDGE_RESOURCE}`];

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
  let lastErr = null;
  for (const baseUrl of CAD_BRIDGE_ENDPOINTS) {
    try {
      const response = await postJson(`${baseUrl}/${event}`, data, timeoutMs);
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
