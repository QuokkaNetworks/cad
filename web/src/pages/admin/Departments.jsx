import { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../../api/client';
import Modal from '../../components/Modal';
import AdminPageHeader from '../../components/AdminPageHeader';
import {
  DEPARTMENT_LAYOUT,
  DEPARTMENT_LAYOUT_OPTIONS,
  getDepartmentLayoutLabel,
  normalizeDepartmentLayoutType,
} from '../../utils/departmentLayout';

export default function AdminDepartments() {
  const { key: locationKey } = useLocation();
  const [departments, setDepartments] = useState([]);
  const [subDepartments, setSubDepartments] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showNewSub, setShowNewSub] = useState(false);
  const [showEditSub, setShowEditSub] = useState(false);
  const [form, setForm] = useState({
    name: '',
    short_name: '',
    color: '#0052C2',
    icon: '',
    slogan: '',
    layout_type: DEPARTMENT_LAYOUT.LAW_ENFORCEMENT,
    fivem_job_name: '',
    fivem_job_grade: 0,
  });
  const [editForm, setEditForm] = useState({
    id: null,
    name: '',
    short_name: '',
    color: '#0052C2',
    icon: '',
    slogan: '',
    is_active: 1,
    is_dispatch: 0,
    dispatch_visible: 0,
    layout_type: DEPARTMENT_LAYOUT.LAW_ENFORCEMENT,
    fivem_job_name: '',
    fivem_job_grade: 0,
  });
  const [subForm, setSubForm] = useState({
    department_id: '',
    name: '',
    short_name: '',
    color: '#0052C2',
    is_active: 1,
    fivem_job_name: '',
    fivem_job_grade: 0,
  });
  const [editSubForm, setEditSubForm] = useState({
    id: null,
    department_id: '',
    name: '',
    short_name: '',
    color: '#0052C2',
    is_active: 1,
    fivem_job_name: '',
    fivem_job_grade: 0,
  });
  const [newIconFile, setNewIconFile] = useState(null);
  const [editIconFile, setEditIconFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [movingDepartmentId, setMovingDepartmentId] = useState(null);
  const [movingSubDepartmentId, setMovingSubDepartmentId] = useState(null);
  const [deletingDepartmentId, setDeletingDepartmentId] = useState(null);
  const [deletingSubDepartmentId, setDeletingSubDepartmentId] = useState(null);

  const orderedDepartments = useMemo(
    () => [...departments].sort((a, b) => {
      const aOrder = Number.isFinite(Number(a.sort_order)) ? Number(a.sort_order) : 0;
      const bOrder = Number.isFinite(Number(b.sort_order)) ? Number(b.sort_order) : 0;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return Number(a.id) - Number(b.id);
    }),
    [departments]
  );

  const orderedSubDepartments = useMemo(() => {
    // Build a dept sort-order lookup once so the sort comparator is O(1) per call
    const deptOrderMap = new Map(orderedDepartments.map(d => [d.id, Number.isFinite(Number(d.sort_order)) ? Number(d.sort_order) : 0]));
    return [...subDepartments].sort((a, b) => {
      const deptOrderA = deptOrderMap.get(a.department_id) ?? 0;
      const deptOrderB = deptOrderMap.get(b.department_id) ?? 0;
      if (deptOrderA !== deptOrderB) return deptOrderA - deptOrderB;
      if (Number(a.department_id) !== Number(b.department_id)) return Number(a.department_id) - Number(b.department_id);
      const aOrder = Number.isFinite(Number(a.sort_order)) ? Number(a.sort_order) : 0;
      const bOrder = Number.isFinite(Number(b.sort_order)) ? Number(b.sort_order) : 0;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
  }, [subDepartments, orderedDepartments]);

  // Pre-compute siblings per department once so the render loop is O(1) per sub-dept
  const siblingsByDeptId = useMemo(() => {
    const map = new Map();
    for (const sub of orderedSubDepartments) {
      const deptId = sub.department_id;
      if (!map.has(deptId)) map.set(deptId, []);
      map.get(deptId).push(sub);
    }
    return map;
  }, [orderedSubDepartments]);

  async function fetchDepts() {
    try {
      const [depts, subs] = await Promise.all([
        api.get('/api/admin/departments'),
        api.get('/api/admin/sub-departments'),
      ]);
      setDepartments(depts);
      setSubDepartments(subs);
    } catch (err) {
      console.error('Failed to load departments:', err);
    }
  }

  useEffect(() => { fetchDepts(); }, [locationKey]);

  async function uploadIcon(file) {
    const data = new FormData();
    data.append('icon', file);
    const uploaded = await api.post('/api/admin/departments/upload-icon', data);
    return uploaded.icon;
  }

  async function createDept(e) {
    e.preventDefault();
    try {
      setSaving(true);
      let icon = form.icon;
      if (newIconFile) {
        icon = await uploadIcon(newIconFile);
      }
      await api.post('/api/admin/departments', {
        ...form,
        icon,
        slogan: String(form.slogan || '').trim(),
        layout_type: normalizeDepartmentLayoutType(form.layout_type),
        fivem_job_name: String(form.fivem_job_name || '').trim(),
        fivem_job_grade: Number(form.fivem_job_grade || 0),
      });
      setShowNew(false);
      setForm({
        name: '',
        short_name: '',
        color: '#0052C2',
        icon: '',
        slogan: '',
        layout_type: DEPARTMENT_LAYOUT.LAW_ENFORCEMENT,
        fivem_job_name: '',
        fivem_job_grade: 0,
      });
      setNewIconFile(null);
      fetchDepts();
    } catch (err) {
      alert('Failed to create department: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(id, isActive) {
    try {
      await api.patch(`/api/admin/departments/${id}`, { is_active: isActive ? 0 : 1 });
      fetchDepts();
    } catch (err) {
      alert('Failed to update department: ' + err.message);
    }
  }

  async function moveDepartment(departmentId, direction) {
    if (movingDepartmentId) return;
    const idx = orderedDepartments.findIndex(d => d.id === departmentId);
    const targetIdx = idx + direction;
    if (idx < 0 || targetIdx < 0 || targetIdx >= orderedDepartments.length) return;

    const next = [...orderedDepartments];
    const temp = next[idx];
    next[idx] = next[targetIdx];
    next[targetIdx] = temp;

    setMovingDepartmentId(departmentId);
    try {
      await api.post('/api/admin/departments/reorder', {
        ordered_ids: next.map(d => d.id),
      });
      fetchDepts();
    } catch (err) {
      alert('Failed to reorder department: ' + err.message);
    } finally {
      setMovingDepartmentId(null);
    }
  }

  async function deleteDepartment(dept) {
    const ok = confirm(`Delete department "${dept.name}"?`);
    if (!ok) return;
    setDeletingDepartmentId(dept.id);
    try {
      await api.delete(`/api/admin/departments/${dept.id}`);
      fetchDepts();
    } catch (err) {
      alert('Failed to delete department: ' + err.message);
    } finally {
      setDeletingDepartmentId(null);
    }
  }

  function openEdit(dept) {
    setEditForm({
      id: dept.id,
      name: dept.name || '',
      short_name: dept.short_name || '',
      color: dept.color || '#0052C2',
      icon: dept.icon || '',
      slogan: dept.slogan || '',
      is_active: dept.is_active ? 1 : 0,
      is_dispatch: dept.is_dispatch ? 1 : 0,
      dispatch_visible: dept.dispatch_visible ? 1 : 0,
      layout_type: normalizeDepartmentLayoutType(dept.layout_type),
      fivem_job_name: dept.fivem_job_name || '',
      fivem_job_grade: Number.isFinite(Number(dept.fivem_job_grade)) ? Number(dept.fivem_job_grade) : 0,
    });
    setEditIconFile(null);
    setShowEdit(true);
  }

  async function saveEdit(e) {
    e.preventDefault();
    try {
      setSaving(true);
      let icon = editForm.icon;
      if (editIconFile) {
        icon = await uploadIcon(editIconFile);
      }
      await api.patch(`/api/admin/departments/${editForm.id}`, {
        name: editForm.name,
        short_name: editForm.short_name,
        color: editForm.color,
        icon,
        slogan: String(editForm.slogan || '').trim(),
        is_active: editForm.is_active ? 1 : 0,
        is_dispatch: editForm.is_dispatch ? 1 : 0,
        dispatch_visible: editForm.dispatch_visible ? 1 : 0,
        layout_type: normalizeDepartmentLayoutType(editForm.layout_type),
        fivem_job_name: String(editForm.fivem_job_name || '').trim(),
        fivem_job_grade: Number(editForm.fivem_job_grade || 0),
      });
      setShowEdit(false);
      setEditIconFile(null);
      fetchDepts();
    } catch (err) {
      alert('Failed to save department: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function createSubDept(e) {
    e.preventDefault();
    try {
      setSaving(true);
      await api.post('/api/admin/sub-departments', {
        department_id: parseInt(subForm.department_id, 10),
        name: subForm.name,
        short_name: subForm.short_name,
        color: subForm.color,
        is_active: subForm.is_active ? 1 : 0,
        fivem_job_name: String(subForm.fivem_job_name || '').trim(),
        fivem_job_grade: Number(subForm.fivem_job_grade || 0),
      });
      setShowNewSub(false);
      setSubForm({
        department_id: '',
        name: '',
        short_name: '',
        color: '#0052C2',
        is_active: 1,
        fivem_job_name: '',
        fivem_job_grade: 0,
      });
      fetchDepts();
    } catch (err) {
      alert('Failed to create sub-department: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  function openEditSub(sub) {
    setEditSubForm({
      id: sub.id,
      department_id: sub.department_id,
      name: sub.name || '',
      short_name: sub.short_name || '',
      color: sub.color || '#0052C2',
      is_active: sub.is_active ? 1 : 0,
      fivem_job_name: sub.fivem_job_name || '',
      fivem_job_grade: Number.isFinite(Number(sub.fivem_job_grade)) ? Number(sub.fivem_job_grade) : 0,
    });
    setShowEditSub(true);
  }

  async function saveEditSub(e) {
    e.preventDefault();
    try {
      setSaving(true);
      await api.patch(`/api/admin/sub-departments/${editSubForm.id}`, {
        name: editSubForm.name,
        short_name: editSubForm.short_name,
        color: editSubForm.color,
        is_active: editSubForm.is_active ? 1 : 0,
        fivem_job_name: String(editSubForm.fivem_job_name || '').trim(),
        fivem_job_grade: Number(editSubForm.fivem_job_grade || 0),
      });
      setShowEditSub(false);
      fetchDepts();
    } catch (err) {
      alert('Failed to save sub-department: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleSubActive(sub) {
    try {
      await api.patch(`/api/admin/sub-departments/${sub.id}`, { is_active: sub.is_active ? 0 : 1 });
      fetchDepts();
    } catch (err) {
      alert('Failed to update sub-department: ' + err.message);
    }
  }

  function getSiblingSubDepartments(departmentId) {
    return siblingsByDeptId.get(departmentId) ?? [];
  }

  async function moveSubDepartment(sub, direction) {
    if (movingSubDepartmentId) return;
    const siblings = getSiblingSubDepartments(sub.department_id);
    const idx = siblings.findIndex(s => s.id === sub.id);
    const targetIdx = idx + direction;
    if (idx < 0 || targetIdx < 0 || targetIdx >= siblings.length) return;

    const next = [...siblings];
    const temp = next[idx];
    next[idx] = next[targetIdx];
    next[targetIdx] = temp;

    setMovingSubDepartmentId(sub.id);
    try {
      await api.post('/api/admin/sub-departments/reorder', {
        department_id: sub.department_id,
        ordered_ids: next.map(s => s.id),
      });
      fetchDepts();
    } catch (err) {
      alert('Failed to reorder sub-department: ' + err.message);
    } finally {
      setMovingSubDepartmentId(null);
    }
  }

  async function deleteSubDepartment(sub) {
    const ok = confirm(`Delete sub-department "${sub.name}"?`);
    if (!ok) return;
    setDeletingSubDepartmentId(sub.id);
    try {
      await api.delete(`/api/admin/sub-departments/${sub.id}`);
      fetchDepts();
    } catch (err) {
      alert('Failed to delete sub-department: ' + err.message);
    } finally {
      setDeletingSubDepartmentId(null);
    }
  }

  return (
    <div className="max-w-7xl space-y-6">
      <AdminPageHeader
        title="Departments"
        subtitle="Create and manage departments, colors, and logo assets."
        links={[
          { to: '/admin/users', label: 'Users' },
          { to: '/admin/role-mappings', label: 'Role Access Sync' },
          { to: '/admin/alarm-zones', label: 'Alarm Zones' },
        ]}
      />
      <div className="bg-cad-card border border-cad-border rounded-xl p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowNew(true)}
            className="px-4 py-2 bg-cad-accent hover:bg-cad-accent-light text-white rounded-lg text-sm font-medium transition-colors"
          >
            + New Department
          </button>
          <button
            onClick={() => setShowNewSub(true)}
            className="px-4 py-2 bg-cad-surface border border-cad-border hover:border-cad-accent/50 text-cad-ink rounded-lg text-sm font-medium transition-colors"
          >
            + New Sub-Department
          </button>
        </div>
      </div>
      </div>

      <div className="space-y-3">
        {orderedDepartments.map((dept, idx) => (
          <div key={dept.id} className="bg-cad-card border border-cad-border rounded-2xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {dept.icon ? (
                <img src={dept.icon} alt="" className="w-10 h-10 rounded-xl object-contain p-0.5 border border-cad-border bg-cad-surface" />
              ) : (
                <div className="w-10 h-10 rounded-xl border border-cad-border bg-cad-surface flex items-center justify-center text-xs text-cad-muted">
                  {dept.short_name?.slice(0, 3) || 'DEP'}
                </div>
              )}
              <div>
                <span className="font-medium">{dept.name}</span>
                <span className="text-sm text-cad-muted ml-2">({dept.short_name})</span>
                <span className="text-xs text-cad-muted ml-2">{dept.sub_department_count || 0} sub-department(s)</span>
                <div className="mt-1">
                  <span className="text-xs px-2 py-0.5 rounded font-mono" style={{ backgroundColor: `${dept.color || '#0052C2'}30`, color: dept.color || '#0052C2' }}>
                    {dept.color || '#0052C2'}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded font-mono ml-2 bg-cad-surface text-cad-ink border border-cad-border">
                    {getDepartmentLayoutLabel(dept.layout_type)}
                  </span>
                  {String(dept.fivem_job_name || '').trim() && (
                    <span className="text-xs px-2 py-0.5 rounded font-mono ml-2 bg-cad-surface text-cad-ink border border-cad-border">
                      Job {dept.fivem_job_name} / Grade {Number(dept.fivem_job_grade || 0)}
                    </span>
                  )}
                </div>
                {String(dept.slogan || '').trim() && (
                  <p className="text-xs text-cad-muted mt-1 italic">
                    "{dept.slogan}"
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => moveDepartment(dept.id, -1)}
                disabled={idx === 0 || !!movingDepartmentId}
                className="text-xs px-2 py-1 bg-cad-surface text-cad-muted hover:text-cad-ink rounded transition-colors disabled:opacity-50"
                title="Move up"
              >
                ↑
              </button>
              <button
                onClick={() => moveDepartment(dept.id, 1)}
                disabled={idx === orderedDepartments.length - 1 || !!movingDepartmentId}
                className="text-xs px-2 py-1 bg-cad-surface text-cad-muted hover:text-cad-ink rounded transition-colors disabled:opacity-50"
                title="Move down"
              >
                ↓
              </button>
              {!!dept.is_dispatch && (
                <span className="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30">
                  Dispatch Centre
                </span>
              )}
              {!!dept.dispatch_visible && (
                <span className="text-xs px-2 py-0.5 rounded bg-sky-500/20 text-sky-400 border border-sky-500/30">
                  Visible to Dispatch
                </span>
              )}
              <span className={`text-xs px-2 py-0.5 rounded ${dept.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-500/20 text-gray-400'}`}>
                {dept.is_active ? 'Active' : 'Inactive'}
              </span>
              <button
                onClick={() => toggleActive(dept.id, dept.is_active)}
                className="text-xs px-2 py-1 bg-cad-surface text-cad-muted hover:text-cad-ink rounded transition-colors"
              >
                {dept.is_active ? 'Disable' : 'Enable'}
              </button>
              <button
                onClick={() => openEdit(dept)}
                className="text-xs px-2 py-1 bg-cad-surface text-cad-muted hover:text-cad-ink rounded transition-colors"
              >
                Edit
              </button>
              <button
                onClick={() => deleteDepartment(dept)}
                disabled={deletingDepartmentId === dept.id}
                className="text-xs px-2 py-1 bg-red-500/10 text-red-400 border border-red-500/30 rounded hover:bg-red-500/20 transition-colors disabled:opacity-50"
              >
                {deletingDepartmentId === dept.id ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 space-y-3">
        <h3 className="text-sm font-semibold text-cad-muted uppercase tracking-wider">Sub-Departments</h3>
        {orderedSubDepartments.map(sub => {
          const siblings = getSiblingSubDepartments(sub.department_id);
          const idx = siblings.findIndex(s => s.id === sub.id);
          return (
            <div key={sub.id} className="bg-cad-card border border-cad-border rounded-xl p-3 flex items-center justify-between">
              <div>
                <span className="font-medium">{sub.name}</span>
                <span className="text-sm text-cad-muted ml-2">({sub.short_name})</span>
                <span className="text-xs text-cad-muted ml-2">Parent: {sub.department_name}</span>
                <span className="text-xs px-2 py-0.5 rounded font-mono ml-2" style={{ backgroundColor: `${sub.color || '#0052C2'}30`, color: sub.color || '#0052C2' }}>
                  {sub.color || '#0052C2'}
                </span>
                {String(sub.fivem_job_name || '').trim() && (
                  <span className="text-xs px-2 py-0.5 rounded font-mono ml-2 bg-cad-surface text-cad-ink border border-cad-border">
                    Job {sub.fivem_job_name} / Grade {Number(sub.fivem_job_grade || 0)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => moveSubDepartment(sub, -1)}
                  disabled={idx === 0 || !!movingSubDepartmentId}
                  className="text-xs px-2 py-1 bg-cad-surface text-cad-muted hover:text-cad-ink rounded transition-colors disabled:opacity-50"
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  onClick={() => moveSubDepartment(sub, 1)}
                  disabled={idx === siblings.length - 1 || !!movingSubDepartmentId}
                  className="text-xs px-2 py-1 bg-cad-surface text-cad-muted hover:text-cad-ink rounded transition-colors disabled:opacity-50"
                  title="Move down"
                >
                  ↓
                </button>
                <span className={`text-xs px-2 py-0.5 rounded ${sub.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-500/20 text-gray-400'}`}>
                  {sub.is_active ? 'Active' : 'Inactive'}
                </span>
                <button
                  onClick={() => toggleSubActive(sub)}
                  className="text-xs px-2 py-1 bg-cad-surface text-cad-muted hover:text-cad-ink rounded transition-colors"
                >
                  {sub.is_active ? 'Disable' : 'Enable'}
                </button>
                <button
                  onClick={() => openEditSub(sub)}
                  className="text-xs px-2 py-1 bg-cad-surface text-cad-muted hover:text-cad-ink rounded transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => deleteSubDepartment(sub)}
                  disabled={deletingSubDepartmentId === sub.id}
                  className="text-xs px-2 py-1 bg-red-500/10 text-red-400 border border-red-500/30 rounded hover:bg-red-500/20 transition-colors disabled:opacity-50"
                >
                  {deletingSubDepartmentId === sub.id ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          );
        })}
        {subDepartments.length === 0 && (
          <p className="text-sm text-cad-muted">No sub-departments configured.</p>
        )}
      </div>

      <Modal open={showNew} onClose={() => setShowNew(false)} title="New Department">
        <form onSubmit={createDept} className="space-y-3">
          <div>
            <label className="block text-sm text-cad-muted mb-1">Name *</label>
            <input type="text" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent" />
          </div>
          <div>
            <label className="block text-sm text-cad-muted mb-1">Short Name</label>
            <input type="text" value={form.short_name} onChange={e => setForm(f => ({ ...f, short_name: e.target.value }))}
              className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent" placeholder="e.g. VicPol" />
          </div>
          <div>
            <label className="block text-sm text-cad-muted mb-1">Slogan</label>
            <input
              type="text"
              value={form.slogan}
              onChange={e => setForm(f => ({ ...f, slogan: e.target.value }))}
              className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
              placeholder="e.g. Protecting with integrity"
            />
          </div>
          <div>
            <label className="block text-sm text-cad-muted mb-1">Department Layout</label>
            <select
              value={form.layout_type}
              onChange={e => setForm(f => ({ ...f, layout_type: e.target.value }))}
              className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
            >
              {DEPARTMENT_LAYOUT_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-cad-muted mb-1">Logo Image (optional)</label>
            <input
              type="file"
              accept="image/*"
              onChange={e => setNewIconFile(e.target.files?.[0] || null)}
              className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm file:mr-3 file:px-3 file:py-1.5 file:border-0 file:rounded file:bg-cad-surface file:text-cad-muted"
            />
            <p className="text-xs text-cad-muted mt-1">Max 2MB. PNG, JPG, WEBP, GIF.</p>
          </div>
          <div>
            <label className="block text-sm text-cad-muted mb-1">Color</label>
            <div className="flex items-center gap-2">
              <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                className="w-8 h-8 rounded border border-cad-border cursor-pointer" />
              <input type="text" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                className="flex-1 bg-cad-card border border-cad-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-cad-accent" />
            </div>
          </div>
          <div className="bg-cad-card border border-cad-border rounded-lg p-3 space-y-2">
            <p className="text-xs font-semibold text-cad-ink">FiveM Job Mapping</p>
            <div>
              <label className="block text-sm text-cad-muted mb-1">Job Name</label>
              <input
                type="text"
                value={form.fivem_job_name}
                onChange={e => setForm(f => ({ ...f, fivem_job_name: e.target.value }))}
                className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-cad-accent"
                placeholder="e.g. police"
              />
            </div>
            <div>
              <label className="block text-sm text-cad-muted mb-1">Default Grade</label>
              <input
                type="number"
                min="0"
                value={form.fivem_job_grade}
                onChange={e => setForm(f => ({ ...f, fivem_job_grade: e.target.value }))}
                className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-cad-accent"
              />
            </div>
            <p className="text-xs text-cad-muted">
              Used when a Discord role maps directly to this department.
            </p>
          </div>
          <div className="flex gap-2 pt-2">
            <button disabled={saving} type="submit" className="flex-1 px-4 py-2 bg-cad-accent hover:bg-cad-accent-light text-white rounded text-sm font-medium transition-colors disabled:opacity-50">{saving ? 'Saving...' : 'Create'}</button>
            <button type="button" onClick={() => setShowNew(false)} className="px-4 py-2 bg-cad-card hover:bg-cad-border text-cad-muted rounded text-sm transition-colors">Cancel</button>
          </div>
        </form>
      </Modal>

      <Modal open={showEdit} onClose={() => setShowEdit(false)} title="Edit Department">
        <form onSubmit={saveEdit} className="space-y-3">
          <div>
            <label className="block text-sm text-cad-muted mb-1">Name *</label>
            <input type="text" required value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
              className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent" />
          </div>
          <div>
            <label className="block text-sm text-cad-muted mb-1">Short Name</label>
            <input type="text" value={editForm.short_name} onChange={e => setEditForm(f => ({ ...f, short_name: e.target.value }))}
              className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent" />
          </div>
          <div>
            <label className="block text-sm text-cad-muted mb-1">Slogan</label>
            <input
              type="text"
              value={editForm.slogan}
              onChange={e => setEditForm(f => ({ ...f, slogan: e.target.value }))}
              className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
              placeholder="e.g. Protecting with integrity"
            />
          </div>
          <div>
            <label className="block text-sm text-cad-muted mb-1">Department Layout</label>
            <select
              value={editForm.layout_type}
              onChange={e => setEditForm(f => ({ ...f, layout_type: e.target.value }))}
              className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
            >
              {DEPARTMENT_LAYOUT_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-cad-muted mb-1">Logo Image (optional)</label>
            <input
              type="file"
              accept="image/*"
              onChange={e => setEditIconFile(e.target.files?.[0] || null)}
              className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm file:mr-3 file:px-3 file:py-1.5 file:border-0 file:rounded file:bg-cad-surface file:text-cad-muted"
            />
            <p className="text-xs text-cad-muted mt-1">Leave empty to keep current logo.</p>
            {editForm.icon && (
              <div className="mt-2 flex items-center gap-3">
                <img src={editForm.icon} alt="" className="w-10 h-10 rounded-xl object-contain p-0.5 border border-cad-border bg-cad-surface" />
                <button
                  type="button"
                  onClick={() => setEditForm(f => ({ ...f, icon: '' }))}
                  className="text-xs px-2 py-1 bg-cad-surface text-cad-muted hover:text-cad-ink rounded transition-colors"
                >
                  Remove Current Logo
                </button>
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm text-cad-muted mb-1">Color</label>
            <div className="flex items-center gap-2">
              <input type="color" value={editForm.color} onChange={e => setEditForm(f => ({ ...f, color: e.target.value }))}
                className="w-8 h-8 rounded border border-cad-border cursor-pointer" />
              <input type="text" value={editForm.color} onChange={e => setEditForm(f => ({ ...f, color: e.target.value }))}
                className="flex-1 bg-cad-card border border-cad-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-cad-accent" />
            </div>
          </div>
          <div className="bg-cad-card border border-cad-border rounded-lg p-3 space-y-2">
            <p className="text-xs font-semibold text-cad-ink">FiveM Job Mapping</p>
            <div>
              <label className="block text-sm text-cad-muted mb-1">Job Name</label>
              <input
                type="text"
                value={editForm.fivem_job_name}
                onChange={e => setEditForm(f => ({ ...f, fivem_job_name: e.target.value }))}
                className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-cad-accent"
                placeholder="e.g. police"
              />
            </div>
            <div>
              <label className="block text-sm text-cad-muted mb-1">Default Grade</label>
              <input
                type="number"
                min="0"
                value={editForm.fivem_job_grade}
                onChange={e => setEditForm(f => ({ ...f, fivem_job_grade: e.target.value }))}
                className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-cad-accent"
              />
            </div>
            <p className="text-xs text-cad-muted">
              Used when a Discord role maps directly to this department.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm text-cad-muted">
            <input
              type="checkbox"
              checked={!!editForm.is_active}
              onChange={e => setEditForm(f => ({ ...f, is_active: e.target.checked ? 1 : 0 }))}
              className="rounded"
            />
            Department is active
          </label>
          <div className="bg-cad-card border border-cad-border rounded-lg p-3 space-y-2">
            <p className="text-xs font-semibold text-cad-ink">Dispatch Settings</p>
            <label className="flex items-center gap-2 text-sm text-cad-muted">
              <input
                type="checkbox"
                checked={!!editForm.is_dispatch}
                onChange={e => setEditForm(f => ({ ...f, is_dispatch: e.target.checked ? 1 : 0 }))}
                className="rounded"
              />
              Dispatch centre
            </label>
            <p className="text-xs text-cad-muted ml-6">This department can see and manage units/calls from other departments.</p>
            <label className="flex items-center gap-2 text-sm text-cad-muted">
              <input
                type="checkbox"
                checked={!!editForm.dispatch_visible}
                onChange={e => setEditForm(f => ({ ...f, dispatch_visible: e.target.checked ? 1 : 0 }))}
                className="rounded"
              />
              Units visible to dispatch
            </label>
            <p className="text-xs text-cad-muted ml-6">On-duty units from this department will appear on dispatch boards.</p>
          </div>
          <div className="flex gap-2 pt-2">
            <button disabled={saving} type="submit" className="flex-1 px-4 py-2 bg-cad-accent hover:bg-cad-accent-light text-white rounded text-sm font-medium transition-colors disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
            <button type="button" onClick={() => setShowEdit(false)} className="px-4 py-2 bg-cad-card hover:bg-cad-border text-cad-muted rounded text-sm transition-colors">Cancel</button>
          </div>
        </form>
      </Modal>

      <Modal open={showNewSub} onClose={() => setShowNewSub(false)} title="New Sub-Department">
        <form onSubmit={createSubDept} className="space-y-3">
          <div>
            <label className="block text-sm text-cad-muted mb-1">Parent Department *</label>
            <select
              required
              value={subForm.department_id}
              onChange={e => {
                const dept = departments.find(d => String(d.id) === e.target.value);
                setSubForm(f => ({ ...f, department_id: e.target.value, color: dept?.color || f.color }));
              }}
              className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
            >
              <option value="">Select department...</option>
              {orderedDepartments.map(d => (
                <option key={d.id} value={d.id}>{d.name} ({d.short_name})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-cad-muted mb-1">Name *</label>
            <input type="text" required value={subForm.name} onChange={e => setSubForm(f => ({ ...f, name: e.target.value }))}
              className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent" placeholder="e.g. Highway Patrol" />
          </div>
          <div>
            <label className="block text-sm text-cad-muted mb-1">Short Name *</label>
            <input type="text" required value={subForm.short_name} onChange={e => setSubForm(f => ({ ...f, short_name: e.target.value }))}
              className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent" placeholder="e.g. HWP" />
          </div>
          <div>
            <label className="block text-sm text-cad-muted mb-1">Color</label>
            <div className="flex items-center gap-2">
              <input type="color" value={subForm.color} onChange={e => setSubForm(f => ({ ...f, color: e.target.value }))}
                className="w-8 h-8 rounded border border-cad-border cursor-pointer" />
              <input type="text" value={subForm.color} onChange={e => setSubForm(f => ({ ...f, color: e.target.value }))}
                className="flex-1 bg-cad-card border border-cad-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-cad-accent" />
            </div>
          </div>
          <div className="bg-cad-card border border-cad-border rounded-lg p-3 space-y-2">
            <p className="text-xs font-semibold text-cad-ink">FiveM Job Mapping</p>
            <div>
              <label className="block text-sm text-cad-muted mb-1">Job Name (optional override)</label>
              <input
                type="text"
                value={subForm.fivem_job_name}
                onChange={e => setSubForm(f => ({ ...f, fivem_job_name: e.target.value }))}
                className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-cad-accent"
                placeholder="e.g. police"
              />
            </div>
            <div>
              <label className="block text-sm text-cad-muted mb-1">Grade Override</label>
              <input
                type="number"
                min="0"
                value={subForm.fivem_job_grade}
                onChange={e => setSubForm(f => ({ ...f, fivem_job_grade: e.target.value }))}
                className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-cad-accent"
              />
            </div>
            <p className="text-xs text-cad-muted">
              If set, this overrides the parent department mapping and supports rank-specific roles.
            </p>
          </div>
          <div className="flex gap-2 pt-2">
            <button disabled={saving} type="submit" className="flex-1 px-4 py-2 bg-cad-accent hover:bg-cad-accent-light text-white rounded text-sm font-medium transition-colors disabled:opacity-50">{saving ? 'Saving...' : 'Create'}</button>
            <button type="button" onClick={() => setShowNewSub(false)} className="px-4 py-2 bg-cad-card hover:bg-cad-border text-cad-muted rounded text-sm transition-colors">Cancel</button>
          </div>
        </form>
      </Modal>

      <Modal open={showEditSub} onClose={() => setShowEditSub(false)} title="Edit Sub-Department">
        <form onSubmit={saveEditSub} className="space-y-3">
          <div>
            <label className="block text-sm text-cad-muted mb-1">Name *</label>
            <input type="text" required value={editSubForm.name} onChange={e => setEditSubForm(f => ({ ...f, name: e.target.value }))}
              className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent" />
          </div>
          <div>
            <label className="block text-sm text-cad-muted mb-1">Short Name *</label>
            <input type="text" required value={editSubForm.short_name} onChange={e => setEditSubForm(f => ({ ...f, short_name: e.target.value }))}
              className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent" />
          </div>
          <div>
            <label className="block text-sm text-cad-muted mb-1">Color</label>
            <div className="flex items-center gap-2">
              <input type="color" value={editSubForm.color} onChange={e => setEditSubForm(f => ({ ...f, color: e.target.value }))}
                className="w-8 h-8 rounded border border-cad-border cursor-pointer" />
              <input type="text" value={editSubForm.color} onChange={e => setEditSubForm(f => ({ ...f, color: e.target.value }))}
                className="flex-1 bg-cad-card border border-cad-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-cad-accent" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-cad-muted">
            <input
              type="checkbox"
              checked={!!editSubForm.is_active}
              onChange={e => setEditSubForm(f => ({ ...f, is_active: e.target.checked ? 1 : 0 }))}
              className="rounded"
            />
            Sub-department is active
          </label>
          <div className="bg-cad-card border border-cad-border rounded-lg p-3 space-y-2">
            <p className="text-xs font-semibold text-cad-ink">FiveM Job Mapping</p>
            <div>
              <label className="block text-sm text-cad-muted mb-1">Job Name (optional override)</label>
              <input
                type="text"
                value={editSubForm.fivem_job_name}
                onChange={e => setEditSubForm(f => ({ ...f, fivem_job_name: e.target.value }))}
                className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-cad-accent"
                placeholder="e.g. police"
              />
            </div>
            <div>
              <label className="block text-sm text-cad-muted mb-1">Grade Override</label>
              <input
                type="number"
                min="0"
                value={editSubForm.fivem_job_grade}
                onChange={e => setEditSubForm(f => ({ ...f, fivem_job_grade: e.target.value }))}
                className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-cad-accent"
              />
            </div>
            <p className="text-xs text-cad-muted">
              If set, this overrides the parent department mapping and supports rank-specific roles.
            </p>
          </div>
          <div className="flex gap-2 pt-2">
            <button disabled={saving} type="submit" className="flex-1 px-4 py-2 bg-cad-accent hover:bg-cad-accent-light text-white rounded text-sm font-medium transition-colors disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
            <button type="button" onClick={() => setShowEditSub(false)} className="px-4 py-2 bg-cad-card hover:bg-cad-border text-cad-muted rounded text-sm transition-colors">Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
