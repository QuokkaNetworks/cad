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

function formatStatusLabel(value) {
  return String(value || '')
    .trim()
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || 'Unknown';
}

function getStatusBadgeClasses(status) {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'seized' || normalized === 'collected') {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
  }
  if (normalized === 'submitted' || normalized === 'lab') {
    return 'border-sky-500/30 bg-sky-500/10 text-sky-300';
  }
  if (normalized === 'released') {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
  }
  if (normalized === 'in_locker') {
    return 'border-violet-500/30 bg-violet-500/10 text-violet-300';
  }
  return 'border-cad-border bg-cad-surface text-cad-muted';
}

function parseSqliteUtcMs(value) {
  const text = String(value || '').trim();
  if (!text) return NaN;
  const normalized = text.includes('T') ? text : text.replace(' ', 'T');
  return Date.parse(normalized.endsWith('Z') ? normalized : `${normalized}Z`);
}

function chainKey(entityType, entityId) {
  return `${String(entityType || '').trim().toLowerCase()}:${Number(entityId)}`;
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

  const chains = useMemo(() => {
    const grouped = new Map();

    for (const item of Array.isArray(items) ? items : []) {
      const target = buildTargetFromItem(item);
      if (!target) continue;

      const key = chainKey(target.entityType, target.entityId);
      const itemUpdatedAt = String(item?.updated_at || item?.created_at || '').trim();
      const itemUpdatedAtMs = parseSqliteUtcMs(itemUpdatedAt);

      if (!grouped.has(key)) {
        grouped.set(key, {
          key,
          entityType: target.entityType,
          entityId: target.entityId,
          parentTitle: String(item?.parent_title || '').trim(),
          parentSubjectName: String(item?.parent_subject_name || '').trim(),
          parentCitizenId: String(item?.parent_citizen_id || '').trim(),
          latestEvidenceTitle: String(item?.title || '').trim(),
          latestEvidenceDescription: String(item?.description || '').trim(),
          latestCaseNumber: String(item?.case_number || '').trim(),
          latestChainStatus: String(item?.chain_status || '').trim(),
          latestUpdatedAt: itemUpdatedAt,
          latestUpdatedAtMs: Number.isFinite(itemUpdatedAtMs) ? itemUpdatedAtMs : -1,
          itemCount: 0,
          photoCount: 0,
          caseNumbers: new Set(),
          statuses: new Set(),
        });
      }

      const chain = grouped.get(key);
      chain.itemCount += 1;
      if (String(item?.photo_url || '').trim()) {
        chain.photoCount += 1;
      }
      if (String(item?.case_number || '').trim()) {
        chain.caseNumbers.add(String(item.case_number).trim());
      }
      if (String(item?.chain_status || '').trim()) {
        chain.statuses.add(String(item.chain_status).trim().toLowerCase());
      }

      if (
        Number.isFinite(itemUpdatedAtMs)
        && (itemUpdatedAtMs > chain.latestUpdatedAtMs || !chain.latestEvidenceTitle)
      ) {
        chain.latestEvidenceTitle = String(item?.title || '').trim();
        chain.latestEvidenceDescription = String(item?.description || '').trim();
        chain.latestCaseNumber = String(item?.case_number || '').trim();
        chain.latestChainStatus = String(item?.chain_status || '').trim();
        chain.latestUpdatedAt = itemUpdatedAt;
        chain.latestUpdatedAtMs = itemUpdatedAtMs;
      }
    }

    return Array.from(grouped.values())
      .map((chain) => ({
        ...chain,
        caseNumbers: Array.from(chain.caseNumbers),
        statuses: Array.from(chain.statuses),
      }))
      .sort((a, b) => {
        if (a.latestUpdatedAtMs !== b.latestUpdatedAtMs) return b.latestUpdatedAtMs - a.latestUpdatedAtMs;
        if (a.itemCount !== b.itemCount) return b.itemCount - a.itemCount;
        return String(a.parentTitle || '').localeCompare(String(b.parentTitle || ''), undefined, { sensitivity: 'base' });
      });
  }, [items]);

  const selectedChain = useMemo(() => {
    if (!selectedTarget) return null;
    return chains.find(
      (chain) =>
        chain.entityType === selectedTarget.entityType
        && Number(chain.entityId) === Number(selectedTarget.entityId)
    ) || null;
  }, [chains, selectedTarget]);

  const selectedEvidenceItem = useMemo(() => {
    if (!selectedTarget) return null;
    return items.find(
      (item) =>
        String(item?.entity_type || '') === selectedTarget.entityType
        && Number(item?.entity_id) === Number(selectedTarget.entityId)
    ) || null;
  }, [items, selectedTarget]);

  const summary = useMemo(() => {
    const totalItems = items.length;
    const totalChains = chains.length;
    const warrantChains = chains.filter((chain) => chain.entityType === 'warrant').length;
    const recordChains = chains.filter((chain) => chain.entityType === 'criminal_record').length;
    const withPhotos = chains.filter((chain) => Number(chain.photoCount || 0) > 0).length;
    return { totalItems, totalChains, warrantChains, recordChains, withPhotos };
  }, [items, chains]);

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

  useEffect(() => {
    const handle = setTimeout(() => {
      setQuery(String(queryDraft || '').trim());
    }, 250);
    return () => clearTimeout(handle);
  }, [queryDraft]);

  useEffect(() => {
    setSelectedTarget((current) => {
      if (current) {
        const exists = chains.some(
          (chain) =>
            chain.entityType === current.entityType
            && Number(chain.entityId) === Number(current.entityId)
        );
        if (exists) return current;
      }
      if (chains.length > 0) {
        return { entityType: chains[0].entityType, entityId: chains[0].entityId };
      }
      return current && !items.length ? null : current;
    });
  }, [chains, items.length]);

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

  function clearFilters() {
    setEntityFilter('all');
    setQueryDraft('');
    setQuery('');
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

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-cad-card border border-cad-border rounded-xl p-3">
          <p className="text-[11px] uppercase tracking-wider text-cad-muted">Chains</p>
          <p className="text-xl font-semibold mt-1">{loading ? '...' : summary.totalChains}</p>
        </div>
        <div className="bg-cad-card border border-cad-border rounded-xl p-3">
          <p className="text-[11px] uppercase tracking-wider text-cad-muted">Evidence Items</p>
          <p className="text-xl font-semibold mt-1">{loading ? '...' : summary.totalItems}</p>
        </div>
        <div className="bg-cad-card border border-cad-border rounded-xl p-3">
          <p className="text-[11px] uppercase tracking-wider text-cad-muted">Record Chains</p>
          <p className="text-xl font-semibold mt-1 text-cad-accent-light">{loading ? '...' : summary.recordChains}</p>
        </div>
        <div className="bg-cad-card border border-cad-border rounded-xl p-3">
          <p className="text-[11px] uppercase tracking-wider text-cad-muted">Warrant Chains</p>
          <p className="text-xl font-semibold mt-1 text-amber-300">{loading ? '...' : summary.warrantChains}</p>
        </div>
        <div className="bg-cad-card border border-cad-border rounded-xl p-3">
          <p className="text-[11px] uppercase tracking-wider text-cad-muted">Chains With Photos</p>
          <p className="text-xl font-semibold mt-1 text-emerald-300">{loading ? '...' : summary.withPhotos}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-4">
        <div className="space-y-4">
          <div className="bg-cad-card border border-cad-border rounded-xl p-4">
            <form onSubmit={submitFilters} className="space-y-3">
              <div>
                <label className="block text-xs text-cad-muted mb-1">Entity Type</label>
                <div className="flex flex-wrap gap-2">
                  {ENTITY_FILTER_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setEntityFilter(option.value)}
                      className={`px-2.5 py-1.5 rounded text-xs border transition-colors ${
                        entityFilter === option.value
                          ? 'bg-cad-accent/15 border-cad-accent/40 text-cad-accent-light'
                          : 'bg-cad-surface border-cad-border text-cad-muted hover:text-cad-ink'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
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
                <p className="text-[11px] text-cad-muted mt-1">Search updates automatically as you type.</p>
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
                <button
                  type="button"
                  onClick={clearFilters}
                  className="px-3 py-2 border border-cad-border rounded text-sm text-cad-muted hover:text-cad-ink"
                >
                  Clear
                </button>
              </div>
            </form>
          </div>

          <div className="bg-cad-card border border-cad-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-cad-border flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Evidence Chains</p>
              <span className="text-xs text-cad-muted">
                {loading ? 'Loading...' : `${chains.length} chain(s) / ${items.length} item(s)`}
              </span>
            </div>

            {error ? (
              <div className="px-4 py-3 text-sm text-red-200 bg-red-500/10 border-t border-red-500/20">
                {error}
              </div>
            ) : null}

            {chains.length === 0 && !loading ? (
              <div className="px-4 py-6 text-sm text-cad-muted text-center">
                No evidence chains match the current filters.
              </div>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto divide-y divide-cad-border/40">
                {chains.map((chain) => {
                  const isSelected = !!(
                    selectedTarget
                    && chain.entityType === selectedTarget.entityType
                    && Number(chain.entityId) === Number(selectedTarget.entityId)
                  );
                  return (
                    <button
                      key={chain.key}
                      type="button"
                      onClick={() => {
                        setSelectedTarget({ entityType: chain.entityType, entityId: chain.entityId });
                        setManualEntityType(String(chain.entityType || 'criminal_record'));
                        setManualEntityId(String(chain.entityId || ''));
                      }}
                      className={`w-full text-left px-4 py-3 transition-colors ${
                        isSelected ? 'bg-cad-accent/10 ring-1 ring-inset ring-cad-accent/30' : 'hover:bg-cad-surface'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium truncate">
                              {chain.parentTitle || `${entityTypeLabel(chain.entityType)} #${chain.entityId}`}
                            </p>
                            <span className="px-2 py-0.5 rounded border border-cad-border text-[11px] text-cad-muted">
                              {entityTypeLabel(chain.entityType)} #{chain.entityId}
                            </span>
                          </div>
                          {(chain.parentSubjectName || chain.parentCitizenId) ? (
                            <p className="text-xs text-cad-muted mt-1 truncate">
                              {chain.parentSubjectName ? `Subject: ${chain.parentSubjectName}` : ''}
                              {chain.parentSubjectName && chain.parentCitizenId ? ' | ' : ''}
                              {chain.parentCitizenId ? `Citizen ID: ${chain.parentCitizenId}` : ''}
                            </p>
                          ) : null}
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            <span className="px-2 py-0.5 rounded border border-cad-border text-[11px] text-cad-muted">
                              {chain.itemCount} item{chain.itemCount === 1 ? '' : 's'}
                            </span>
                            {chain.photoCount > 0 ? (
                              <span className="px-2 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 text-[11px] text-emerald-300">
                                {chain.photoCount} photo{chain.photoCount === 1 ? '' : 's'}
                              </span>
                            ) : null}
                            {chain.latestChainStatus ? (
                              <span className={`px-2 py-0.5 rounded border text-[11px] ${getStatusBadgeClasses(chain.latestChainStatus)}`}>
                                {formatStatusLabel(chain.latestChainStatus)}
                              </span>
                            ) : null}
                            {chain.latestCaseNumber ? (
                              <span className="px-2 py-0.5 rounded border border-cad-border text-[11px] text-cad-muted">
                                Case {chain.latestCaseNumber}
                              </span>
                            ) : null}
                          </div>
                          {chain.latestEvidenceTitle ? (
                            <p className="text-xs text-cad-muted mt-2 truncate">
                              Latest: <span className="text-cad-ink">{chain.latestEvidenceTitle}</span>
                            </p>
                          ) : null}
                        </div>
                        <span className="text-[11px] text-cad-muted whitespace-nowrap">
                          {formatDateTimeAU(chain.latestUpdatedAt ? `${chain.latestUpdatedAt}Z` : '', '-')}
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
              {selectedChain ? (
                <span className="text-xs text-cad-muted">
                  {entityTypeLabel(selectedChain.entityType)} #{selectedChain.entityId}
                </span>
              ) : null}
            </div>

            {selectedChain ? (
              <div className="rounded-lg border border-cad-border bg-cad-surface px-3 py-2 text-sm text-cad-muted">
                {selectedChain.parentTitle ? (
                  <p>
                    Parent: <span className="text-cad-ink">{selectedChain.parentTitle}</span>
                  </p>
                ) : null}
                {selectedChain.parentSubjectName ? (
                  <p>
                    Subject: <span className="text-cad-ink">{selectedChain.parentSubjectName}</span>
                  </p>
                ) : null}
                {selectedChain.parentCitizenId ? (
                  <p>
                    Citizen ID: <span className="text-cad-ink font-mono">{selectedChain.parentCitizenId}</span>
                  </p>
                ) : null}
                <p>
                  Chain Items: <span className="text-cad-ink">{selectedChain.itemCount}</span>
                  {selectedChain.photoCount > 0 ? ` | Photos: ${selectedChain.photoCount}` : ''}
                </p>
              </div>
            ) : null}

            <details className="rounded-lg border border-cad-border bg-cad-surface">
              <summary className="px-3 py-2 text-sm text-cad-muted cursor-pointer select-none">
                Open by ID (manual)
              </summary>
              <div className="px-3 pb-3 pt-1">
                <div className="grid grid-cols-1 md:grid-cols-[1fr_140px_auto] gap-2">
                  <select
                    value={manualEntityType}
                    onChange={(e) => setManualEntityType(e.target.value)}
                    className="bg-cad-card border border-cad-border rounded px-3 py-2 text-sm"
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
                    className="bg-cad-card border border-cad-border rounded px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={applyManualTarget}
                    className="px-3 py-2 bg-cad-accent hover:bg-cad-accent-light text-white rounded text-sm font-medium"
                  >
                    Open
                  </button>
                </div>
              </div>
            </details>
          </div>

          {selectedTarget ? (
            <EvidencePanel
              entityType={selectedTarget.entityType}
              entityId={selectedTarget.entityId}
              departmentId={deptId || null}
              title={`${entityTypeLabel(selectedTarget.entityType)} #${selectedTarget.entityId} Evidence Chain`}
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
