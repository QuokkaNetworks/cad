import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import Modal from '../components/Modal';
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

function formatDateTime(value) {
  if (!value) return 'Unknown';
  const parsed = new Date(String(value).replace(' ', 'T') + (String(value).includes('T') ? '' : 'Z'));
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString();
}

function getApplicationStatusMeta(status) {
  const key = String(status || '').trim().toLowerCase();
  if (key === 'approved') {
    return {
      label: 'Approved',
      className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    };
  }
  if (key === 'rejected') {
    return {
      label: 'Rejected',
      className: 'bg-red-500/15 text-red-300 border-red-500/30',
    };
  }
  if (key === 'withdrawn') {
    return {
      label: 'Withdrawn',
      className: 'bg-gray-500/15 text-gray-300 border-gray-500/30',
    };
  }
  return {
    label: 'Pending Review',
    className: 'bg-amber-500/15 text-amber-200 border-amber-500/25',
  };
}

function getDepartmentApplicationFormFields(dept) {
  if (!Array.isArray(dept?.application_form_schema)) return [];
  return dept.application_form_schema
    .filter((field) => field && typeof field === 'object' && String(field.label || '').trim())
    .map((field, index) => ({
      id: String(field.id || `field_${index + 1}`),
      label: String(field.label || `Question ${index + 1}`),
      type: String(field.type || 'text').toLowerCase(),
      required: !!field.required,
      description: String(field.description || ''),
      placeholder: String(field.placeholder || ''),
      options: Array.isArray(field.options) ? field.options.map((opt) => String(opt)).filter(Boolean) : [],
      max_length: Number.isInteger(Number(field.max_length)) ? Number(field.max_length) : undefined,
    }));
}

function buildInitialApplicationFormValues(fields) {
  const out = {};
  for (const field of fields) {
    const type = String(field?.type || 'text').toLowerCase();
    if (type === 'checkbox') out[field.id] = false;
    else out[field.id] = '';
  }
  return out;
}

function isStructuredFieldSatisfied(field, value) {
  const type = String(field?.type || 'text').toLowerCase();
  if (!field?.required) return true;
  if (type === 'checkbox') return value === true;
  if (type === 'yes_no') return value === true || value === false || value === 'true' || value === 'false';
  return String(value ?? '').trim() !== '';
}

function structuredFormHasMissingRequired(fields, values) {
  return fields.some((field) => !isStructuredFieldSatisfied(field, values?.[field.id]));
}

function formatStructuredAnswerValue(answer) {
  if (!answer || typeof answer !== 'object') return '';
  const type = String(answer.type || '').toLowerCase();
  const value = answer.value;
  if (type === 'checkbox' || type === 'yes_no') {
    return value ? 'Yes' : 'No';
  }
  return String(answer.value_label || value || '');
}

function ApplicationFormFieldInput({ field, value, onChange, disabled = false }) {
  const type = String(field?.type || 'text').toLowerCase();
  const fieldId = String(field?.id || 'field');
  const label = String(field?.label || 'Question');
  const description = String(field?.description || '').trim();
  const placeholder = String(field?.placeholder || '').trim();
  const maxLength = Number.isInteger(field?.max_length) ? field.max_length : (type === 'textarea' ? 4000 : 250);
  const options = Array.isArray(field?.options) ? field.options : [];

  return (
    <div className="rounded-lg border border-cad-border bg-cad-surface/45 p-3">
      <label className="block text-sm text-cad-ink font-medium mb-1" htmlFor={`app-field-${fieldId}`}>
        {label} {field?.required ? <span className="text-red-300">*</span> : null}
      </label>
      {description ? <p className="text-xs text-cad-muted mb-2 leading-5">{description}</p> : null}

      {(type === 'text' || type === 'number') && (
        <input
          id={`app-field-${fieldId}`}
          type={type === 'number' ? 'number' : 'text'}
          value={value ?? ''}
          onChange={(e) => onChange(fieldId, e.target.value)}
          placeholder={placeholder || undefined}
          maxLength={type === 'text' ? maxLength : undefined}
          disabled={disabled}
          className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent disabled:opacity-60"
        />
      )}

      {type === 'textarea' && (
        <>
          <textarea
            id={`app-field-${fieldId}`}
            rows={4}
            value={value ?? ''}
            onChange={(e) => onChange(fieldId, e.target.value)}
            placeholder={placeholder || undefined}
            maxLength={maxLength}
            disabled={disabled}
            className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent resize-y disabled:opacity-60"
          />
          <p className="text-[11px] text-cad-muted mt-1">{String(value ?? '').length}/{maxLength}</p>
        </>
      )}

      {(type === 'select') && (
        <select
          id={`app-field-${fieldId}`}
          value={value ?? ''}
          onChange={(e) => onChange(fieldId, e.target.value)}
          disabled={disabled}
          className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent disabled:opacity-60"
        >
          <option value="">{field?.required ? 'Select an option...' : 'Optional - no selection'}</option>
          {options.map((option) => (
            <option key={`${fieldId}-${option}`} value={option}>{option}</option>
          ))}
        </select>
      )}

      {type === 'radio' && (
        <div className="space-y-2">
          {options.map((option) => (
            <label key={`${fieldId}-${option}`} className="flex items-center gap-2 text-sm text-cad-muted">
              <input
                type="radio"
                name={`app-field-${fieldId}`}
                value={option}
                checked={String(value ?? '') === String(option)}
                onChange={(e) => onChange(fieldId, e.target.value)}
                disabled={disabled}
                className="accent-cad-accent"
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
      )}

      {(type === 'yes_no') && (
        <div className="flex flex-wrap gap-2">
          {[
            { value: 'true', label: 'Yes' },
            { value: 'false', label: 'No' },
          ].map((option) => (
            <button
              key={`${fieldId}-${option.value}`}
              type="button"
              onClick={() => onChange(fieldId, option.value)}
              disabled={disabled}
              className={`px-3 py-1.5 rounded-lg border text-xs transition-colors ${
                String(value ?? '') === option.value
                  ? 'border-cad-accent/40 bg-cad-accent/12 text-cad-accent-light'
                  : 'border-cad-border bg-cad-card text-cad-muted hover:text-cad-ink'
              } disabled:opacity-50`}
            >
              {option.label}
            </button>
          ))}
          {!field?.required ? (
            <button
              type="button"
              onClick={() => onChange(fieldId, '')}
              disabled={disabled}
              className="px-3 py-1.5 rounded-lg border border-cad-border bg-cad-card text-xs text-cad-muted hover:text-cad-ink transition-colors disabled:opacity-50"
            >
              Clear
            </button>
          ) : null}
        </div>
      )}

      {type === 'checkbox' && (
        <label className="inline-flex items-center gap-2 text-sm text-cad-muted">
          <input
            id={`app-field-${fieldId}`}
            type="checkbox"
            checked={value === true}
            onChange={(e) => onChange(fieldId, e.target.checked)}
            disabled={disabled}
            className="rounded accent-cad-accent"
          />
          <span>{placeholder || 'Tick to confirm'}</span>
        </label>
      )}
    </div>
  );
}

function DepartmentCard({
  dept,
  onSelect,
  index,
  locked = false,
  latestApplicationStatus = '',
  showApplicationState = true,
  actionLabel = '',
  disabled = false,
}) {
  const accent = String(dept?.color || '#0052C2').trim() || '#0052C2';
  const kind = getDepartmentKindLabel(dept);
  const logo = String(dept?.icon || '').trim();
  const slogan = String(dept?.slogan || '').trim() || `${kind} workspace`;
  const isAssigned = !!dept?.is_assigned && !locked;
  const applicationMeta = latestApplicationStatus ? getApplicationStatusMeta(latestApplicationStatus) : null;
  const canClick = !disabled && typeof onSelect === 'function';
  const actionText = String(actionLabel || '').trim() || (locked ? 'Locked' : 'Enter');

  return (
    <button
      type="button"
      onClick={() => {
        if (!canClick) return;
        onSelect(dept);
      }}
      aria-disabled={canClick ? 'false' : 'true'}
      className={`group relative text-left rounded-2xl border overflow-hidden transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-cad-bg ${
        canClick ? 'hover:-translate-y-1 hover:shadow-2xl' : 'cursor-not-allowed opacity-90'
      }`}
      style={{
        borderColor: colorWithAlpha(accent, 0.2),
        background: `linear-gradient(145deg, ${colorWithAlpha(accent, (!canClick || locked) ? 0.04 : 0.06)}, rgba(26,35,50,0.95))`,
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
            className={`flex-shrink-0 text-[10px] uppercase tracking-wider px-2 py-1 rounded-lg border font-medium transition-all ${canClick ? 'group-hover:scale-105' : ''}`}
            style={{
              borderColor: colorWithAlpha(accent, 0.3),
              backgroundColor: colorWithAlpha(accent, 0.1),
              color: '#c8d8f4',
            }}
          >
            {actionText}
          </div>
        </div>

        {/* Slogan */}
        <p className="text-xs text-cad-muted line-clamp-2 leading-relaxed">{slogan}</p>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-md border ${
            isAssigned
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-amber-500/25 bg-amber-500/10 text-amber-200'
          }`}>
            {isAssigned ? 'Access Granted' : 'No Access'}
          </span>
          {showApplicationState ? (
            <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-md border ${
              dept?.applications_open
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border-gray-500/30 bg-gray-500/10 text-gray-300'
            }`}>
              {dept?.applications_open ? 'Applications Open' : 'Applications Closed'}
            </span>
          ) : null}
          {applicationMeta && !isAssigned ? (
            <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-md border ${applicationMeta.className}`}>
              {applicationMeta.label}
            </span>
          ) : null}
        </div>
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

function WorkspaceHub({
  user,
  departments,
  isAdmin,
  onSelectDepartment,
  onRequestApplication,
  latestApplicationByDepartment,
}) {
  const linked = !!user?.discord_id;
  const assignedDepartments = departments.filter((dept) => !!dept?.is_assigned);
  const applicationDepartments = departments.filter((dept) => !dept?.is_assigned && !!dept?.applications_open);
  const kinds = countDepartmentKinds(assignedDepartments.length > 0 ? assignedDepartments : applicationDepartments);
  const totalTiles = assignedDepartments.length + applicationDepartments.length;
  const assignedTiles = assignedDepartments.length;

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
                {user?.name ? `${user.name.split(' ')[0]}'s Departments` : 'Departments'}
              </h1>
              <p className="text-sm text-cad-muted mt-1 max-w-lg">
                Select a department workspace to continue into the operational environment.
              </p>
            </div>

            {/* Status pills */}
            <div className="flex flex-wrap gap-2">
              <StatusPill label="Access" value={linked ? 'Discord Verified' : 'Setup Required'} active={linked} />
              <StatusPill label="Workspaces" value={`${assignedTiles} assigned`} active={assignedTiles > 0} />
              <StatusPill label="Directory" value={`${totalTiles} visible`} active={totalTiles > 0} />
              <StatusPill label="Role" value={isAdmin ? 'Administrator' : 'Operator'} active={true} />
            </div>
          </div>

          {/* Coverage strip */}
          {assignedDepartments.length > 0 && (
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
              <p className="text-sm font-semibold text-cad-ink">No departments available</p>
              <p className="text-xs text-cad-muted mt-1">
                You have no assigned workspaces and there are no departments with applications open right now.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-cad-muted">
                {assignedTiles} assigned / {totalTiles} visible
              </p>
            </div>
            <div className="space-y-6">
              <section>
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h2 className="text-sm font-semibold text-cad-ink">Your Departments</h2>
                  <span className="text-xs text-cad-muted">{assignedDepartments.length} assigned</span>
                </div>
                {assignedDepartments.length === 0 ? (
                  <div className="rounded-xl border border-cad-border bg-cad-surface/35 p-4 text-sm text-cad-muted">
                    You do not currently have access to any departments.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
                    {assignedDepartments.map((dept, i) => (
                      <DepartmentCard
                        key={`assigned-${dept.id}`}
                        dept={dept}
                        onSelect={onSelectDepartment}
                        index={i}
                        locked={false}
                        latestApplicationStatus={String(latestApplicationByDepartment?.get?.(Number(dept.id))?.status || '').toLowerCase()}
                      />
                    ))}
                  </div>
                )}
              </section>

              <section>
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h2 className="text-sm font-semibold text-cad-ink">Departments With Applications Open</h2>
                  <span className="text-xs text-cad-muted">{applicationDepartments.length} available</span>
                </div>
                <p className="text-xs text-cad-muted mb-3">
                  Only departments you do not already have access to are shown here. Click a card to start an application.
                </p>
                {applicationDepartments.length === 0 ? (
                  <div className="rounded-xl border border-cad-border bg-cad-surface/35 p-4 text-sm text-cad-muted">
                    No open department applications are available to you right now.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
                    {applicationDepartments.map((dept, i) => {
                      const latestStatus = String(latestApplicationByDepartment?.get?.(Number(dept.id))?.status || '').toLowerCase();
                      const canApply = latestStatus !== 'pending' && latestStatus !== 'approved';
                      const actionLabel = latestStatus === 'pending'
                        ? 'Pending'
                        : latestStatus === 'approved'
                          ? 'Awaiting Role'
                          : 'Apply';
                      return (
                        <DepartmentCard
                          key={`application-${dept.id}`}
                          dept={dept}
                          onSelect={onRequestApplication}
                          index={i}
                          locked={true}
                          actionLabel={actionLabel}
                          disabled={!canApply}
                          latestApplicationStatus={latestStatus}
                        />
                      );
                    })}
                  </div>
                )}
              </section>
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
          Select a department to enter, or apply to an open department above
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

function DepartmentApplicationsPortal({ user }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [portalData, setPortalData] = useState({ departments: [], applications: [] });
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [selectedDepartment, setSelectedDepartment] = useState(null);
  const [applicationMessage, setApplicationMessage] = useState('');
  const [applicationFormValues, setApplicationFormValues] = useState({});
  const [submitting, setSubmitting] = useState(false);

  async function loadPortalData() {
    setLoading(true);
    setError('');
    try {
      const data = await api.get('/api/department-applications');
      setPortalData({
        departments: Array.isArray(data?.departments) ? data.departments : [],
        applications: Array.isArray(data?.applications) ? data.applications : [],
      });
    } catch (err) {
      setError(err.message || 'Failed to load department applications');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPortalData();
  }, []);

  const latestApplicationByDepartment = useMemo(() => {
    const map = new Map();
    for (const application of portalData.applications) {
      const departmentId = Number(application?.department_id);
      if (!departmentId || map.has(departmentId)) continue;
      map.set(departmentId, application);
    }
    return map;
  }, [portalData.applications]);

  const openDepartments = portalData.departments.filter((dept) => !!dept.applications_open && !dept.is_assigned);
  const closedDepartments = portalData.departments.filter((dept) => !dept.applications_open && !dept.is_assigned);
  const pendingCount = portalData.applications.filter((app) => String(app?.status || '').toLowerCase() === 'pending').length;
  const selectedDepartmentFormFields = useMemo(
    () => getDepartmentApplicationFormFields(selectedDepartment),
    [selectedDepartment]
  );
  const selectedDepartmentHasStructuredForm = selectedDepartmentFormFields.length > 0;
  const structuredFormMissingRequired = selectedDepartmentHasStructuredForm
    ? structuredFormHasMissingRequired(selectedDepartmentFormFields, applicationFormValues)
    : false;

  function beginApply(department) {
    setSelectedDepartment(department);
    setApplicationMessage('');
    setApplicationFormValues(buildInitialApplicationFormValues(getDepartmentApplicationFormFields(department)));
    setShowApplyModal(true);
  }

  function updateApplicationFormValue(fieldId, value) {
    setApplicationFormValues((prev) => ({ ...prev, [String(fieldId)]: value }));
  }

  async function submitApplication(e) {
    e.preventDefault();
    if (!selectedDepartment) return;
    try {
      setSubmitting(true);
      const payload = {
        department_id: selectedDepartment.id,
        form_answers: applicationFormValues,
      };
      if (!selectedDepartmentHasStructuredForm || String(applicationMessage || '').trim()) {
        payload.message = applicationMessage;
      }
      await api.post('/api/department-applications', payload);
      setShowApplyModal(false);
      setSelectedDepartment(null);
      setApplicationMessage('');
      setApplicationFormValues({});
      await loadPortalData();
    } catch (err) {
      alert('Failed to submit application: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative h-full overflow-hidden rounded-3xl border border-cad-border bg-cad-card/90 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
      <div className="absolute inset-0 cad-ambient-grid opacity-25" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_15%,rgba(0,82,194,0.18),transparent_35%),radial-gradient(circle_at_88%_10%,rgba(16,185,129,0.12),transparent_40%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))]" />

      <div className="relative z-10 h-full p-4 sm:p-6 flex flex-col gap-4 overflow-hidden">
        <section className="rounded-2xl border border-cad-border bg-cad-surface/55 p-5 sm:p-6 flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-sky-400" style={{ boxShadow: '0 0 10px rgba(56,189,248,0.7)' }} />
                <span className="text-[11px] uppercase tracking-[0.18em] text-cad-muted">Department Applications</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-cad-ink">
                No Department Access Yet
              </h1>
              <p className="text-sm sm:text-base text-cad-muted mt-2 leading-6 max-w-3xl">
                Your Discord account is linked as {user?.discord_name || 'Linked User'}. Apply to a department below. CAD access is still granted by Discord role mapping after an application is reviewed.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:min-w-[240px]">
              <div className="rounded-xl border border-cad-border bg-cad-card/70 px-3 py-2">
                <p className="text-[10px] uppercase tracking-widest text-cad-muted">Open</p>
                <p className="text-sm font-semibold text-cad-ink">{openDepartments.length}</p>
              </div>
              <div className="rounded-xl border border-cad-border bg-cad-card/70 px-3 py-2">
                <p className="text-[10px] uppercase tracking-widest text-cad-muted">Closed</p>
                <p className="text-sm font-semibold text-cad-ink">{closedDepartments.length}</p>
              </div>
              <div className="rounded-xl border border-cad-border bg-cad-card/70 px-3 py-2">
                <p className="text-[10px] uppercase tracking-widest text-cad-muted">Pending</p>
                <p className="text-sm font-semibold text-cad-ink">{pendingCount}</p>
              </div>
              <div className="rounded-xl border border-cad-border bg-cad-card/70 px-3 py-2">
                <p className="text-[10px] uppercase tracking-widest text-cad-muted">Discord</p>
                <p className="text-xs font-semibold text-emerald-300">Linked</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-cad-border bg-cad-card/65 p-3.5">
            <p className="text-sm font-medium text-cad-ink">How access works</p>
            <p className="text-xs text-cad-muted mt-1 leading-5">
              Application approval records your request status. A CAD admin still needs to assign the matching Discord role before the department appears in your Departments list.
            </p>
          </div>
        </section>

        <section className="rounded-2xl border border-cad-border bg-cad-surface/45 p-4 sm:p-5 shrink-0">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-sm font-semibold text-cad-ink">Departments With Applications Open</h2>
            <span className="text-xs text-cad-muted">
              {openDepartments.length} available
            </span>
          </div>
          <p className="text-xs text-cad-muted mb-3">
            Click a department card to start an application. Departments are hidden here unless applications are open.
          </p>
          <div className="max-h-[280px] overflow-auto pr-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {openDepartments.map((dept, index) => {
                const latestStatus = String(latestApplicationByDepartment.get(Number(dept.id))?.status || '').toLowerCase();
                const canApply = latestStatus !== 'pending' && latestStatus !== 'approved';
                const actionLabel = latestStatus === 'pending'
                  ? 'Pending'
                  : latestStatus === 'approved'
                    ? 'Awaiting Role'
                    : 'Apply';
                return (
                  <DepartmentCard
                    key={`directory-${dept.id}`}
                    dept={dept}
                    index={index}
                    locked={true}
                    actionLabel={actionLabel}
                    disabled={!canApply}
                    onSelect={() => beginApply(dept)}
                    latestApplicationStatus={latestStatus}
                  />
                );
              })}
            </div>
            {!loading && openDepartments.length === 0 ? (
              <p className="text-sm text-cad-muted mt-3">No departments currently have applications open.</p>
            ) : null}
          </div>
        </section>

        <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-4 min-h-0 flex-1">
          <section className="rounded-2xl border border-cad-border bg-cad-surface/45 p-4 sm:p-5 overflow-auto">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-cad-ink">Open Application Details</h2>
              <button
                type="button"
                onClick={loadPortalData}
                disabled={loading}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-cad-border bg-cad-card text-cad-muted hover:text-cad-ink transition-colors disabled:opacity-50"
              >
                {loading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>

            {error ? (
              <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-200">
                {error}
              </div>
            ) : null}

            {loading && portalData.departments.length === 0 ? (
              <div className="text-sm text-cad-muted">Loading departments...</div>
            ) : null}

            <div className="space-y-3">
              {openDepartments.map((dept) => {
                const latestApplication = latestApplicationByDepartment.get(Number(dept.id));
                const latestStatus = String(latestApplication?.status || '').toLowerCase();
                const statusMeta = latestApplication ? getApplicationStatusMeta(latestStatus) : null;
                const canApply = !!dept.applications_open && latestStatus !== 'pending' && latestStatus !== 'approved';

                return (
                  <div key={dept.id} className="rounded-xl border border-cad-border bg-cad-card/60 p-4">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-cad-ink truncate">{dept.name}</span>
                          <span className="text-xs px-2 py-0.5 rounded border border-cad-border bg-cad-surface text-cad-muted">
                            {dept.short_name || getDepartmentKindLabel(dept)}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded border ${dept.applications_open ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-gray-500/30 bg-gray-500/10 text-gray-300'}`}>
                            {dept.applications_open ? 'Applications Open' : 'Applications Closed'}
                          </span>
                        </div>
                        <p className="text-xs text-cad-muted mt-1 leading-5">
                          {String(dept.slogan || '').trim() || `${getDepartmentKindLabel(dept)} department access application`}
                        </p>
                        {String(dept.application_template || '').trim() ? (
                          <p className="text-xs text-cad-muted mt-1">
                            Application template available for this department.
                          </p>
                        ) : null}
                        {latestApplication ? (
                          <div className="mt-2 text-xs text-cad-muted space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`px-2 py-0.5 rounded border ${statusMeta.className}`}>{statusMeta.label}</span>
                              <span>Submitted {formatDateTime(latestApplication.created_at)}</span>
                              {latestApplication.reviewed_at ? <span>Reviewed {formatDateTime(latestApplication.reviewed_at)}</span> : null}
                            </div>
                            {String(latestApplication.review_notes || '').trim() ? (
                              <p className="text-cad-muted">Review notes: {latestApplication.review_notes}</p>
                            ) : null}
                          </div>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-2 sm:flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => beginApply(dept)}
                          disabled={!canApply}
                          className="px-3.5 py-2 rounded-lg text-xs font-medium bg-cad-accent hover:bg-cad-accent-light text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {latestStatus === 'pending'
                            ? 'Pending Review'
                            : latestStatus === 'approved'
                              ? 'Approved (Awaiting Role)'
                              : dept.applications_open
                                ? 'Apply'
                                : 'Closed'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {!loading && openDepartments.length === 0 ? (
              <p className="text-sm text-cad-muted">No departments are available to apply for right now.</p>
            ) : null}
          </section>

          <section className="rounded-2xl border border-cad-border bg-cad-surface/45 p-4 sm:p-5 overflow-auto">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-cad-ink">Your Applications</h2>
              <span className="text-[10px] uppercase tracking-widest text-cad-muted">{portalData.applications.length} total</span>
            </div>

            {portalData.applications.length === 0 ? (
              <div className="rounded-xl border border-cad-border bg-cad-card/60 p-4">
                <p className="text-sm text-cad-muted">You have not submitted any department applications yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {portalData.applications.map((application) => {
                  const statusMeta = getApplicationStatusMeta(application.status);
                  return (
                    <div key={application.id} className="rounded-xl border border-cad-border bg-cad-card/60 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-cad-ink truncate">
                            {application.department_name || 'Department'}
                          </p>
                          <p className="text-xs text-cad-muted mt-1">
                            Submitted {formatDateTime(application.created_at)}
                          </p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded border ${statusMeta.className}`}>
                          {statusMeta.label}
                        </span>
                      </div>
                    {String(application.message || '').trim() ? (
                      <p className="text-xs text-cad-muted mt-2 whitespace-pre-wrap leading-5">
                        {application.message}
                      </p>
                    ) : null}
                    {Array.isArray(application.form_answers) && application.form_answers.length > 0 ? (
                      <div className="mt-2 rounded-lg border border-cad-border bg-cad-surface/45 p-2.5">
                        <p className="text-[10px] uppercase tracking-widest text-cad-muted">Form Responses</p>
                        <div className="mt-2 space-y-1.5">
                          {application.form_answers.map((answer, idx) => (
                            <div key={`${application.id}-answer-${answer.field_id || idx}`} className="text-xs">
                              <span className="text-cad-ink font-medium">{answer.label || answer.field_id || 'Field'}:</span>{' '}
                              <span className="text-cad-muted whitespace-pre-wrap">{formatStructuredAnswerValue(answer) || '-'}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {String(application.review_notes || '').trim() ? (
                      <div className="mt-2 rounded-lg border border-cad-border bg-cad-surface/50 p-2.5">
                          <p className="text-[10px] uppercase tracking-widest text-cad-muted">Review Notes</p>
                          <p className="text-xs text-cad-muted mt-1 whitespace-pre-wrap leading-5">{application.review_notes}</p>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>

      <Modal
        open={showApplyModal}
        onClose={() => !submitting && setShowApplyModal(false)}
        title={selectedDepartment ? `Apply: ${selectedDepartment.name}` : 'Apply to Department'}
        closeOnBackdrop={!submitting}
        closeOnEscape={!submitting}
      >
        <form onSubmit={submitApplication} className="space-y-3">
          <p className="text-sm text-cad-muted">
            {selectedDepartmentHasStructuredForm
              ? 'Complete the required department application questions below.'
              : 'Tell the admin team why you want to join this department and any relevant experience.'}
          </p>
          {String(selectedDepartment?.application_template || '').trim() ? (
            <div className="rounded-lg border border-cad-border bg-cad-surface/50 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-cad-muted">Department Application Template</p>
                <button
                  type="button"
                  onClick={() => setApplicationMessage(String(selectedDepartment?.application_template || ''))}
                  className="text-xs px-2 py-1 rounded border border-cad-border bg-cad-card text-cad-muted hover:text-cad-ink transition-colors"
                >
                  Insert Template
                </button>
              </div>
              <pre className="mt-2 text-xs text-cad-muted whitespace-pre-wrap leading-5 font-sans">
                {String(selectedDepartment?.application_template || '').trim()}
              </pre>
            </div>
          ) : null}
          {selectedDepartmentHasStructuredForm ? (
            <div className="space-y-3">
              {selectedDepartmentFormFields.map((field) => (
                <ApplicationFormFieldInput
                  key={`selected-form-field-${field.id}`}
                  field={field}
                  value={applicationFormValues[field.id]}
                  onChange={updateApplicationFormValue}
                  disabled={submitting}
                />
              ))}
              <div>
                <label className="block text-sm text-cad-muted mb-1">Additional Notes (optional)</label>
                <textarea
                  rows={4}
                  maxLength={4000}
                  value={applicationMessage}
                  onChange={(e) => setApplicationMessage(e.target.value)}
                  className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent resize-y"
                  placeholder="Optional extra information not covered by the form."
                />
                <p className="text-xs text-cad-muted mt-1">{applicationMessage.length}/4000</p>
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-sm text-cad-muted mb-1">Application Message *</label>
              <textarea
                required
                rows={6}
                maxLength={4000}
                value={applicationMessage}
                onChange={(e) => setApplicationMessage(e.target.value)}
                className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent resize-y"
                placeholder="Example: I am applying for Highway Patrol. I am active evenings and have prior patrol/dispatch experience..."
              />
              <p className="text-xs text-cad-muted mt-1">{applicationMessage.length}/4000</p>
            </div>
          )}
          {selectedDepartmentHasStructuredForm && structuredFormMissingRequired ? (
            <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              Complete all required form fields before submitting.
            </div>
          ) : null}
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={submitting || (!selectedDepartmentHasStructuredForm && !applicationMessage.trim()) || structuredFormMissingRequired}
              className="flex-1 px-4 py-2 bg-cad-accent hover:bg-cad-accent-light text-white rounded text-sm font-medium transition-colors disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit Application'}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => setShowApplyModal(false)}
              className="px-4 py-2 bg-cad-card hover:bg-cad-border text-cad-muted rounded text-sm transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>
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

export default function Departments() {
  const navigate = useNavigate();
  const { user, departments, isAdmin } = useAuth();
  const { setActiveDepartment } = useDepartment();
  const [directoryData, setDirectoryData] = useState({ departments: [], applications: [] });
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [selectedDepartment, setSelectedDepartment] = useState(null);
  const [applicationMessage, setApplicationMessage] = useState('');
  const [applicationFormValues, setApplicationFormValues] = useState({});
  const [submittingApplication, setSubmittingApplication] = useState(false);

  const departmentList = useMemo(() => (Array.isArray(departments) ? departments : []), [departments]);
  const assignedDepartmentIds = useMemo(
    () => new Set(departmentList.map((dept) => Number(dept?.id)).filter((id) => Number.isInteger(id) && id > 0)),
    [departmentList]
  );

  async function loadDirectoryData() {
    try {
      const data = await api.get('/api/department-applications');
      setDirectoryData({
        departments: Array.isArray(data?.departments) ? data.departments : [],
        applications: Array.isArray(data?.applications) ? data.applications : [],
      });
    } catch {
      setDirectoryData({ departments: [], applications: [] });
    }
  }

  useEffect(() => {
    let active = true;
    async function loadDirectory() {
      try {
        const data = await api.get('/api/department-applications');
        if (!active) return;
        setDirectoryData({
          departments: Array.isArray(data?.departments) ? data.departments : [],
          applications: Array.isArray(data?.applications) ? data.applications : [],
        });
      } catch {
        if (!active) return;
        setDirectoryData({ departments: [], applications: [] });
      }
    }
    loadDirectory();
    return () => { active = false; };
  }, [user?.id]);

  const latestApplicationByDepartment = useMemo(() => {
    const map = new Map();
    for (const application of Array.isArray(directoryData.applications) ? directoryData.applications : []) {
      const departmentId = Number(application?.department_id);
      if (!departmentId || map.has(departmentId)) continue;
      map.set(departmentId, application);
    }
    return map;
  }, [directoryData.applications]);

  const visibleDepartmentCards = useMemo(() => {
    if (Array.isArray(directoryData.departments) && directoryData.departments.length > 0) {
      return directoryData.departments.map((dept) => ({
        ...dept,
        is_assigned: assignedDepartmentIds.has(Number(dept?.id)) || !!dept?.is_assigned,
      }));
    }
    return departmentList.map((dept) => ({ ...dept, is_assigned: true }));
  }, [directoryData.departments, departmentList, assignedDepartmentIds]);

  const selectedDepartmentFormFields = useMemo(
    () => getDepartmentApplicationFormFields(selectedDepartment),
    [selectedDepartment]
  );
  const selectedDepartmentHasStructuredForm = selectedDepartmentFormFields.length > 0;
  const structuredFormMissingRequired = selectedDepartmentHasStructuredForm
    ? structuredFormHasMissingRequired(selectedDepartmentFormFields, applicationFormValues)
    : false;

  function beginApply(department) {
    if (!department) return;
    if (assignedDepartmentIds.has(Number(department?.id))) return;
    setSelectedDepartment(department);
    setApplicationMessage('');
    setApplicationFormValues(buildInitialApplicationFormValues(getDepartmentApplicationFormFields(department)));
    setShowApplyModal(true);
  }

  function updateApplicationFormValue(fieldId, value) {
    setApplicationFormValues((prev) => ({ ...prev, [String(fieldId)]: value }));
  }

  async function submitApplication(e) {
    e.preventDefault();
    if (!selectedDepartment) return;
    try {
      setSubmittingApplication(true);
      const payload = {
        department_id: selectedDepartment.id,
        form_answers: applicationFormValues,
      };
      if (!selectedDepartmentHasStructuredForm || String(applicationMessage || '').trim()) {
        payload.message = applicationMessage;
      }
      await api.post('/api/department-applications', payload);
      setShowApplyModal(false);
      setSelectedDepartment(null);
      setApplicationMessage('');
      setApplicationFormValues({});
      await loadDirectoryData();
    } catch (err) {
      alert('Failed to submit application: ' + err.message);
    } finally {
      setSubmittingApplication(false);
    }
  }

  function selectDepartment(dept) {
    const departmentId = Number(dept?.id || 0);
    if (!assignedDepartmentIds.has(departmentId)) {
      alert('You do not currently have access to this department. Apply (if open) and wait for role assignment.');
      return;
    }
    setActiveDepartment(dept);
    navigate('/department');
  }

  const needsSetup = !user?.discord_id || departmentList.length === 0;
  const needsDiscordLink = !user?.discord_id;
  const hasNoDepartmentAccess = departmentList.length === 0;

  if (!isAdmin && needsDiscordLink) {
    return (
      <div className="w-full h-[calc(100vh-56px)] flex flex-col overflow-hidden">
        <div className="flex-1 min-h-0 max-w-2xl w-full mx-auto flex flex-col">
          <SetupPrompt user={user} />
        </div>
      </div>
    );
  }

  if (!isAdmin && hasNoDepartmentAccess) {
    return (
      <div className="w-full h-[calc(100vh-56px)] flex flex-col overflow-hidden">
        <div className="flex-1 min-h-0 max-w-7xl w-full mx-auto flex flex-col p-2 sm:p-4">
          <DepartmentApplicationsPortal user={user} />
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
            departments={visibleDepartmentCards}
            isAdmin={isAdmin}
            onSelectDepartment={selectDepartment}
            onRequestApplication={beginApply}
            latestApplicationByDepartment={latestApplicationByDepartment}
          />
        </div>
      </div>
      <Modal
        open={showApplyModal}
        onClose={() => !submittingApplication && setShowApplyModal(false)}
        title={selectedDepartment ? `Apply: ${selectedDepartment.name}` : 'Apply to Department'}
        closeOnBackdrop={!submittingApplication}
        closeOnEscape={!submittingApplication}
      >
        <form onSubmit={submitApplication} className="space-y-3">
          <p className="text-sm text-cad-muted">
            {selectedDepartmentHasStructuredForm
              ? 'Complete the required department application questions below.'
              : 'Tell the admin team why you want to join this department and any relevant experience.'}
          </p>
          {String(selectedDepartment?.application_template || '').trim() ? (
            <div className="rounded-lg border border-cad-border bg-cad-surface/50 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-cad-muted">Department Application Template</p>
                <button
                  type="button"
                  onClick={() => setApplicationMessage(String(selectedDepartment?.application_template || ''))}
                  className="text-xs px-2 py-1 rounded border border-cad-border bg-cad-card text-cad-muted hover:text-cad-ink transition-colors"
                >
                  Insert Template
                </button>
              </div>
              <pre className="mt-2 text-xs text-cad-muted whitespace-pre-wrap leading-5 font-sans">
                {String(selectedDepartment?.application_template || '').trim()}
              </pre>
            </div>
          ) : null}
          {selectedDepartmentHasStructuredForm ? (
            <div className="space-y-3">
              {selectedDepartmentFormFields.map((field) => (
                <ApplicationFormFieldInput
                  key={`directory-selected-form-field-${field.id}`}
                  field={field}
                  value={applicationFormValues[field.id]}
                  onChange={updateApplicationFormValue}
                  disabled={submittingApplication}
                />
              ))}
              <div>
                <label className="block text-sm text-cad-muted mb-1">Additional Notes (optional)</label>
                <textarea
                  rows={4}
                  maxLength={4000}
                  value={applicationMessage}
                  onChange={(e) => setApplicationMessage(e.target.value)}
                  className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent resize-y"
                  placeholder="Optional extra information not covered by the form."
                />
                <p className="text-xs text-cad-muted mt-1">{applicationMessage.length}/4000</p>
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-sm text-cad-muted mb-1">Application Message *</label>
              <textarea
                required
                rows={6}
                maxLength={4000}
                value={applicationMessage}
                onChange={(e) => setApplicationMessage(e.target.value)}
                className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent resize-y"
                placeholder="Example: I am applying for Highway Patrol. I am active evenings and have prior patrol/dispatch experience..."
              />
              <p className="text-xs text-cad-muted mt-1">{applicationMessage.length}/4000</p>
            </div>
          )}
          {selectedDepartmentHasStructuredForm && structuredFormMissingRequired ? (
            <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              Complete all required form fields before submitting.
            </div>
          ) : null}
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={submittingApplication || (!selectedDepartmentHasStructuredForm && !applicationMessage.trim()) || structuredFormMissingRequired}
              className="flex-1 px-4 py-2 bg-cad-accent hover:bg-cad-accent-light text-white rounded text-sm font-medium transition-colors disabled:opacity-50"
            >
              {submittingApplication ? 'Submitting...' : 'Submit Application'}
            </button>
            <button
              type="button"
              disabled={submittingApplication}
              onClick={() => setShowApplyModal(false)}
              className="px-4 py-2 bg-cad-card hover:bg-cad-border text-cad-muted rounded text-sm transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
