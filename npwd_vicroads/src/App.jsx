import React, { useMemo, useState } from 'react';
import logo from './assets/vicroads-logo.png';
import { fetchCadBridgeNui } from './utils/fetchNui.js';

const DEFAULT_DURATION = 35;
const EMPTY_FORM = {
  owner_name: '',
  plate: '',
  vehicle_model: '',
  vehicle_colour: '',
  duration_days: DEFAULT_DURATION,
  duration_options: [DEFAULT_DURATION],
};

function normalizeDurationOptions(input, fallback = DEFAULT_DURATION) {
  const values = Array.isArray(input) ? input : [];
  const seen = new Set();
  const out = [];
  for (const raw of values) {
    const num = Math.floor(Number(raw) || 0);
    if (!Number.isFinite(num) || num < 1 || seen.has(num)) continue;
    seen.add(num);
    out.push(num);
  }
  if (!out.length) out.push(Math.max(1, Math.floor(Number(fallback) || DEFAULT_DURATION)));
  out.sort((a, b) => a - b);
  return out;
}

function getDurationLabel(days) {
  const value = Number(days) || 0;
  if (value === 1) return 'Temporary (1 day)';
  if (value === 6) return '6 months (6 days)';
  if (value === 14) return '2 years (2 weeks)';
  if (value === 35) return '5 years (5 weeks)';
  if (value === 70) return '10 years (10 weeks)';
  return `${value} day${value === 1 ? '' : 's'}`;
}

function normalizePrefill(payload) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const defaultDuration = Math.max(1, Math.floor(Number(source.default_duration_days || source.duration_days || DEFAULT_DURATION) || DEFAULT_DURATION));
  const durationOptions = normalizeDurationOptions(source.duration_options, defaultDuration);
  const selectedDuration = durationOptions.includes(defaultDuration) ? defaultDuration : durationOptions[0];
  return {
    owner_name: String(source.owner_name || source.character_name || '').trim(),
    plate: String(source.plate || '').trim().toUpperCase(),
    vehicle_model: String(source.vehicle_model || source.model || '').trim(),
    vehicle_colour: String(source.vehicle_colour || source.colour || source.color || '').trim(),
    duration_days: selectedDuration,
    duration_options: durationOptions,
  };
}

function panelStyle() {
  return {
    borderRadius: 14,
    border: '1px solid rgba(148,163,184,0.2)',
    background: 'rgba(15,23,42,0.44)',
    padding: 12,
  };
}

function StatusBanner({ status }) {
  if (!status?.message) return null;
  const tone = status.type === 'error'
    ? { border: 'rgba(239,68,68,0.35)', bg: 'rgba(127,29,29,0.18)', text: '#fecaca' }
    : status.type === 'success'
      ? { border: 'rgba(34,197,94,0.35)', bg: 'rgba(20,83,45,0.18)', text: '#bbf7d0' }
      : { border: 'rgba(148,163,184,0.22)', bg: 'rgba(15,23,42,0.32)', text: '#dbeafe' };
  return (
    <div style={{ ...panelStyle(), border: `1px solid ${tone.border}`, background: tone.bg, color: tone.text, fontSize: 12.5, lineHeight: 1.35, padding: '10px 12px', whiteSpace: 'pre-wrap' }}>
      {status.message}
    </div>
  );
}

function FieldLabel({ children, required = false }) {
  return (
    <div style={{ fontSize: 11, color: '#b8cae6', marginBottom: 4 }}>
      {children}{required ? <span style={{ color: '#93c5fd' }}> *</span> : null}
    </div>
  );
}

function ReadOnlyInput({ value, placeholder }) {
  return (
    <input
      value={value}
      readOnly
      placeholder={placeholder}
      style={{
        width: '100%',
        borderRadius: 10,
        border: '1px solid rgba(148,163,184,0.22)',
        background: 'rgba(2,6,23,0.4)',
        color: '#f8fbff',
        padding: '9px 10px',
        fontSize: 12.5,
        outline: 'none',
        boxSizing: 'border-box',
      }}
    />
  );
}

function DurationChips({ options, selected, disabled, onSelect }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
      {options.map((option) => {
        const active = Number(selected) === Number(option);
        return (
          <button
            key={option}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(option)}
            style={{
              borderRadius: 10,
              border: active ? '1px solid rgba(59,130,246,0.55)' : '1px solid rgba(148,163,184,0.22)',
              background: active
                ? 'linear-gradient(135deg, rgba(37,99,235,0.22), rgba(29,78,216,0.16))'
                : 'rgba(2,6,23,0.35)',
              color: active ? '#dbeafe' : '#c2d2ea',
              padding: '9px 10px',
              fontSize: 11.5,
              fontWeight: active ? 700 : 600,
              textAlign: 'left',
              cursor: disabled ? 'default' : 'pointer',
              opacity: disabled ? 0.75 : 1,
            }}
          >
            {getDurationLabel(option)}
          </button>
        );
      })}
    </div>
  );
}

export default function App() {
  const [loadingVehicle, setLoadingVehicle] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [status, setStatus] = useState({
    type: 'info',
    message: 'Sit in the vehicle you want to register, then tap "Load Current Vehicle".',
  });
  const [lastLoadedAt, setLastLoadedAt] = useState('');

  const busy = loadingVehicle || submitting;
  const canSubmit = !!(String(form.owner_name || '').trim() && String(form.plate || '').trim() && String(form.vehicle_model || '').trim());
  const timestamp = useMemo(() => (lastLoadedAt || new Date().toLocaleTimeString()), [lastLoadedAt]);

  function setDuration(value) {
    const next = Math.max(1, Math.floor(Number(value) || DEFAULT_DURATION));
    setForm((current) => {
      const options = normalizeDurationOptions(current.duration_options, current.duration_days || DEFAULT_DURATION);
      if (!options.includes(next)) return current;
      return { ...current, duration_days: next };
    });
  }

  async function handleLoadVehicle() {
    if (busy) return;
    setLoadingVehicle(true);
    setStatus({ type: 'info', message: 'Checking your current vehicle and active character...' });
    try {
      const res = await fetchCadBridgeNui('cadBridgeNpwdVicRoadsGetPrefill', {}, { timeoutMs: 10000 });
      const ok = res?.ok === true || res?.success === true;
      if (!ok) {
        setStatus({
          type: 'error',
          message: String(res?.message || '').trim() || 'You must be seated in a vehicle to use VicRoads registration.',
        });
        return;
      }

      const prefill = normalizePrefill(res?.payload);
      if (!prefill.owner_name) {
        setForm(prefill);
        setStatus({
          type: 'error',
          message: 'Vehicle loaded, but your current character could not be resolved. Re-log and try again.',
        });
        return;
      }

      setForm(prefill);
      setLastLoadedAt(new Date().toLocaleTimeString());
      setStatus({
        type: 'success',
        message: 'Vehicle and character loaded. Confirm the registration length, then submit.',
      });
    } catch (err) {
      setStatus({
        type: 'error',
        message: `Unable to contact CAD bridge: ${String(err?.message || err || 'unknown error')}`,
      });
    } finally {
      setLoadingVehicle(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (busy) return;

    const ownerName = String(form.owner_name || '').trim();
    const plate = String(form.plate || '').trim().toUpperCase();
    const vehicleModel = String(form.vehicle_model || '').trim();
    const vehicleColour = String(form.vehicle_colour || '').trim();
    const allowedDurations = normalizeDurationOptions(form.duration_options, form.duration_days || DEFAULT_DURATION);
    const requestedDuration = Math.max(1, Math.floor(Number(form.duration_days || DEFAULT_DURATION) || DEFAULT_DURATION));
    const durationDays = allowedDurations.includes(requestedDuration) ? requestedDuration : allowedDurations[0];

    if (!ownerName || !plate || !vehicleModel) {
      setStatus({
        type: 'error',
        message: 'Owner, plate, and vehicle model are required. Load the current vehicle again if any field is blank.',
      });
      return;
    }
    if (!allowedDurations.includes(durationDays)) {
      setStatus({
        type: 'error',
        message: 'Select one of the available registration periods.',
      });
      return;
    }

    setSubmitting(true);
    setStatus({ type: 'info', message: 'Submitting registration to CAD...' });
    try {
      const res = await fetchCadBridgeNui('cadBridgeNpwdVicRoadsSubmitRegistration', {
        owner_name: ownerName,
        character_name: ownerName,
        plate,
        vehicle_model: vehicleModel,
        vehicle_colour: vehicleColour,
        duration_days: durationDays,
      }, { timeoutMs: 30000 });
      const ok = res?.ok === true || res?.success === true;
      if (ok) {
        setStatus({
          type: 'success',
          message: String(res?.message || '').trim() || 'Vehicle registration submitted successfully.',
        });
      } else {
        setStatus({
          type: 'error',
          message: String(res?.message || '').trim() || 'Vehicle registration failed.',
        });
      }
    } catch (err) {
      setStatus({
        type: 'error',
        message: `Unable to submit registration: ${String(err?.message || err || 'unknown error')}`,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        color: '#f8fbff',
        background: 'radial-gradient(circle at 15% 10%, rgba(59,130,246,0.28), transparent 50%), linear-gradient(180deg, #071228 0%, #0a1936 55%, #081224 100%)',
        fontFamily: 'Segoe UI, system-ui, sans-serif',
      }}
    >
      <div style={{ padding: '14px 14px 8px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: '#ffffff', display: 'grid', placeItems: 'center', boxShadow: '0 8px 18px rgba(0,0,0,0.25)' }}>
          <img src={logo} alt="VicRoads" style={{ width: 28, height: 28, objectFit: 'contain' }} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.1 }}>VicRoads</div>
          <div style={{ color: '#b8cae6', fontSize: 12 }}>Vehicle Registration</div>
        </div>
      </div>

      <div style={{ padding: '0 14px 14px', display: 'grid', gap: 10, overflow: 'auto' }}>
        <div style={{ ...panelStyle(), display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 13, color: '#dbeafe', fontWeight: 700 }}>Create Vehicle Registration Record</div>
          <div style={{ fontSize: 12, color: '#c2d2ea', lineHeight: 1.35 }}>
            Pulls vehicle details from your current driver seat and uses your active character as the registered owner.
          </div>
          <button
            type="button"
            onClick={handleLoadVehicle}
            disabled={busy}
            style={{
              border: '1px solid rgba(37,99,235,0.45)',
              background: loadingVehicle
                ? 'linear-gradient(135deg, rgba(30,64,175,0.6), rgba(30,58,138,0.55))'
                : 'linear-gradient(135deg, #2563eb, #1d4ed8)',
              color: '#fff',
              borderRadius: 12,
              padding: '10px 12px',
              fontSize: 13,
              fontWeight: 700,
              cursor: busy ? 'default' : 'pointer',
              opacity: busy ? 0.85 : 1,
            }}
          >
            {loadingVehicle ? 'Loading Vehicle...' : 'Load Current Vehicle'}
          </button>
        </div>

        <StatusBanner status={status} />

        <form onSubmit={handleSubmit} style={{ ...panelStyle(), display: 'grid', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <FieldLabel required>Owner Name</FieldLabel>
              <ReadOnlyInput value={form.owner_name} placeholder="Load Current Vehicle first" />
            </div>
            <div>
              <FieldLabel required>Plate</FieldLabel>
              <ReadOnlyInput value={form.plate} placeholder="ABC123" />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <FieldLabel required>Vehicle Model</FieldLabel>
              <ReadOnlyInput value={form.vehicle_model} placeholder="Adder" />
            </div>
            <div>
              <FieldLabel>Vehicle Colour</FieldLabel>
              <ReadOnlyInput value={form.vehicle_colour} placeholder="Blue / White" />
            </div>
          </div>

          <div>
            <FieldLabel>Registration Length</FieldLabel>
            <DurationChips
              options={normalizeDurationOptions(form.duration_options, form.duration_days)}
              selected={form.duration_days}
              disabled={busy}
              onSelect={setDuration}
            />
          </div>

          <button
            type="submit"
            disabled={busy || !canSubmit}
            style={{
              marginTop: 2,
              border: '1px solid rgba(16,185,129,0.35)',
              background: submitting
                ? 'linear-gradient(135deg, rgba(4,120,87,0.6), rgba(6,95,70,0.55))'
                : 'linear-gradient(135deg, #10b981, #059669)',
              color: '#fff',
              borderRadius: 12,
              padding: '10px 12px',
              fontSize: 13,
              fontWeight: 700,
              cursor: busy || !canSubmit ? 'default' : 'pointer',
              opacity: busy || !canSubmit ? 0.75 : 1,
            }}
          >
            {submitting ? 'Submitting...' : 'Save Registration'}
          </button>
        </form>

        <div style={{ ...panelStyle(), border: '1px solid rgba(148,163,184,0.16)', background: 'rgba(15,23,42,0.32)', padding: 10, fontSize: 11.5, color: '#9fb4d1', lineHeight: 1.35 }}>
          Owner name is locked to your current active character, matching the standard CAD registration form.
          <div style={{ marginTop: 6, opacity: 0.8 }}>Last vehicle load: {timestamp}</div>
        </div>
      </div>
    </div>
  );
}
