import { useCallback, useEffect, useMemo, useState } from 'react';
import EvidencePanel from '../../components/EvidencePanel';
import { api } from '../../api/client';
import { useDepartment } from '../../context/DepartmentContext';
import { useEventSource } from '../../hooks/useEventSource';
import { DEPARTMENT_LAYOUT, getDepartmentLayoutType } from '../../utils/departmentLayout';
import { formatDateTimeAU } from '../../utils/dateTime';

const ENTITY_FILTER_OPTIONS = [
  { value: 'all', label: 'All Evidence' },
  { value: 'criminal_record', label: 'Criminal Records' },
  { value: 'warrant', label: 'Warrants' },
];

function normalizeEntityType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'criminal_record' || normalized === 'warrant') return normalized;
  return '';
}

function buildTargetFromItem(item) {
  const entityType = normalizeEntityType(item?.entity_type);
  const entityId = Number(item?.entity_id);
  if (!entityType || !Number.isInteger(entityId) || entityId <= 0) return null;
  return { entityType, entityId };
}

function entityTypeLabel(value) {
  return value === 'warrant' ? 'Warrant' : 'Criminal Record';
}

function DepartmentLockedCard() {
  return (
    <div className="bg-cad-card border border-cad-border rounded-lg p-5">
      <h2 className="text-xl font-bold mb-2">Evidence Management</h2>
      <p className="text-sm text-cad-muted">
        Evidence management is available for law enforcement departments only.
      </p>
    </div>
  );
}

export default function EvidenceManagement() {
  const { activeDepartment } = useDepartment();
  const deptId = activeDepartment?.id;
  const layoutType = getDepartmentLayoutType(activeDepartment);
  const isLaw = layoutType === DEPARTMENT_LAYOUT.LAW_ENFORCEMENT;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [queryDraft, setQueryDraft] = useState('');
  const [query, setQuery] = useState('');
  const [entityFilter, setEntityFilter] = useState('all');
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [manualEntityType, setManualEntityType] = useState('criminal_record');
  const [manualEntityId, setManualEntityId] = useState('');

  const selectedEvidenceItem = useMemo(() => {
    if (!selectedTarget) return null;
    return items.find(
      (item) =>
        String(item?.entity_type || '') === selectedTarget.entityType
        && Number(item?.entity_id) === Number(selectedTarget.entityId)
    ) || null;
  }, [items, selectedTarget]);

  const loadEvidenceList = useCallback(async () => {
    if (!deptId || !isLaw) {
      setItems([]);
      return;
    }

    const params = new URLSearchParams();
    params.set('department_id', String(deptId));
    params.set('limit', '100');
    if (entityFilter !== 'all') params.set('entity_type', entityFilter);
    if (String(query || '').trim()) params.set('q', String(query).trim());

    setLoading(true);
    setError('');
    try {
      const data = await api.get(`/api/evidence?${params.toString()}`);
      const list = Array.isArray(data) ? data : [];
      setItems(list);
      setSelectedTarget((current) => {
        if (current) {
          const stillExists = list.some(
            (item) =>
              String(item?.entity_type || '') === current.entityType
              && Number(item?.entity_id) === Number(current.entityId)
          );
          if (stillExists) return current;
        }
        const firstTarget = buildTargetFromItem(list[0]);
        return firstTarget || current;
      });
    } catch (err) {
      setError(err?.message || 'Failed to load evidence');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [deptId, isLaw, entityFilter, query]);

  useEffect(() => {
    loadEvidenceList();
  }, [loadEvidenceList]);

  useEventSource({
    'evidence:create': (payload) => {
      if (Number(payload?.departmentId || payload?.department_id || 0) !== Number(deptId || 0)) return;
      loadEvidenceList();
    },
    'evidence:delete': (payload) => {
      if (Number(payload?.departmentId || payload?.department_id || 0) !== Number(deptId || 0)) return;
      loadEvidenceList();
    },
  });

  function submitFilters(event) {
    event.preventDefault();
    setQuery(String(queryDraft || '').trim());
  }

  function applyManualTarget() {
    const entityType = normalizeEntityType(manualEntityType);
    const entityId = Number(manualEntityId);
    if (!entityType || !Number.isInteger(entityId) || entityId <= 0) return;
    setSelectedTarget({ entityType, entityId });
  }

  if (!isLaw) {
    return <DepartmentLockedCard />;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Evidence Management</h2>
          <p className="text-sm text-cad-muted mt-1">
            Review department evidence items and manage the chain for criminal records and warrants.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-4">
        <div className="space-y-4">
          <div className="bg-cad-card border border-cad-border rounded-xl p-4">
            <form onSubmit={submitFilters} className="space-y-3">
              <div>
                <label className="block text-xs text-cad-muted mb-1">Entity Type</label>
                <select
                  value={entityFilter}
                  onChange={(e) => setEntityFilter(e.target.value)}
                  className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm"
                >
                  {ENTITY_FILTER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-cad-muted mb-1">Search</label>
                <input
                  type="text"
                  value={queryDraft}
                  onChange={(e) => setQueryDraft(e.target.value)}
                  placeholder="Case #, evidence title, parent title, citizen ID..."
                  className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 px-3 py-2 bg-cad-accent hover:bg-cad-accent-light text-white rounded text-sm font-medium"
                >
                  Apply Filters
                </button>
                <button
                  type="button"
                  onClick={loadEvidenceList}
                  className="px-3 py-2 border border-cad-border rounded text-sm text-cad-muted hover:text-cad-ink"
                >
                  Refresh
                </button>
              </div>
            </form>
          </div>

          <div className="bg-cad-card border border-cad-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-cad-border flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Recent Evidence</p>
              <span className="text-xs text-cad-muted">{loading ? 'Loading...' : `${items.length} item(s)`}</span>
            </div>

            {error ? (
              <div className="px-4 py-3 text-sm text-red-200 bg-red-500/10 border-t border-red-500/20">
                {error}
              </div>
            ) : null}

            {items.length === 0 && !loading ? (
              <div className="px-4 py-6 text-sm text-cad-muted text-center">
                No evidence items match the current filters.
              </div>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto divide-y divide-cad-border/40">
                {items.map((item) => {
                  const target = buildTargetFromItem(item);
                  const isSelected = !!(
                    target
                    && selectedTarget
                    && target.entityType === selectedTarget.entityType
                    && Number(target.entityId) === Number(selectedTarget.entityId)
                  );
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        if (target) setSelectedTarget(target);
                        setManualEntityType(String(item.entity_type || 'criminal_record'));
                        setManualEntityId(String(item.entity_id || ''));
                      }}
                      className={`w-full text-left px-4 py-3 transition-colors ${
                        isSelected ? 'bg-cad-accent/10' : 'hover:bg-cad-surface'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{item.title || `Evidence #${item.id}`}</p>
                          <p className="text-xs text-cad-muted mt-1">
                            {entityTypeLabel(item.entity_type)} #{item.entity_id}
                            {item.case_number ? ` | Case ${item.case_number}` : ''}
                            {item.chain_status ? ` | ${item.chain_status}` : ''}
                          </p>
                          {(item.parent_title || item.parent_subject_name || item.parent_citizen_id) ? (
                            <p className="text-xs text-cad-muted mt-1 truncate">
                              Parent: {item.parent_title || 'Untitled'}
                              {item.parent_subject_name ? ` | ${item.parent_subject_name}` : ''}
                              {item.parent_citizen_id ? ` | ${item.parent_citizen_id}` : ''}
                            </p>
                          ) : null}
                        </div>
                        <span className="text-[11px] text-cad-muted whitespace-nowrap">
                          {formatDateTimeAU(item.created_at ? `${item.created_at}Z` : '', '-')}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-cad-card border border-cad-border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-cad-muted uppercase tracking-wider">Open Evidence Chain</h3>
              {selectedTarget ? (
                <span className="text-xs text-cad-muted">
                  {entityTypeLabel(selectedTarget.entityType)} #{selectedTarget.entityId}
                </span>
              ) : null}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[1fr_140px_auto] gap-2">
              <select
                value={manualEntityType}
                onChange={(e) => setManualEntityType(e.target.value)}
                className="bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm"
              >
                <option value="criminal_record">Criminal Record</option>
                <option value="warrant">Warrant</option>
              </select>
              <input
                type="number"
                min="1"
                value={manualEntityId}
                onChange={(e) => setManualEntityId(e.target.value)}
                placeholder="Entity ID"
                className="bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={applyManualTarget}
                className="px-3 py-2 bg-cad-accent hover:bg-cad-accent-light text-white rounded text-sm font-medium"
              >
                Open
              </button>
            </div>

            {selectedEvidenceItem ? (
              <div className="rounded-lg border border-cad-border bg-cad-surface px-3 py-2 text-sm text-cad-muted">
                {selectedEvidenceItem.parent_title ? (
                  <p>
                    Parent: <span className="text-cad-ink">{selectedEvidenceItem.parent_title}</span>
                  </p>
                ) : null}
                {selectedEvidenceItem.parent_subject_name ? (
                  <p>
                    Subject: <span className="text-cad-ink">{selectedEvidenceItem.parent_subject_name}</span>
                  </p>
                ) : null}
                {selectedEvidenceItem.parent_citizen_id ? (
                  <p>
                    Citizen ID: <span className="text-cad-ink font-mono">{selectedEvidenceItem.parent_citizen_id}</span>
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          {selectedTarget ? (
            <EvidencePanel
              entityType={selectedTarget.entityType}
              entityId={selectedTarget.entityId}
              departmentId={deptId || null}
              title="Evidence Chain"
            />
          ) : (
            <div className="bg-cad-card border border-cad-border rounded-xl p-5 text-sm text-cad-muted">
              Select a recent evidence item or enter a criminal record / warrant ID to open its evidence chain.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
