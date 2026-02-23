const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const config = require('../config');

let db;

const DEPARTMENT_LAYOUT_TYPES = new Set(['law_enforcement', 'paramedics', 'fire']);
const OFFENCE_CATEGORIES = new Set(['infringement', 'summary', 'indictment']);

function normalizeDepartmentLayoutType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (DEPARTMENT_LAYOUT_TYPES.has(normalized)) return normalized;
  return 'law_enforcement';
}

function normalizeOffenceCategory(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (OFFENCE_CATEGORIES.has(normalized)) return normalized;
  return 'infringement';
}

function getNextSortOrder(tableName, whereClause = '', whereValues = []) {
  const query = `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort_order FROM ${tableName} ${whereClause}`;
  const row = db.prepare(query).get(...whereValues);
  return Number.isFinite(Number(row?.next_sort_order)) ? Number(row.next_sort_order) : 0;
}

function initDb() {
  const dir = path.dirname(config.sqlite.file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  db = new Database(config.sqlite.file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Migration tracking
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  // Run migrations
  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.js')).sort();
  const applied = db.prepare('SELECT name FROM _migrations').all().map(r => r.name);

  for (const file of files) {
    if (!applied.includes(file)) {
      const migration = require(path.join(migrationsDir, file));
      db.transaction(() => {
        migration.up(db);
        db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(file);
      })();
      console.log(`Migration applied: ${file}`);
    }
  }

  return db;
}

// --- Users ---
const Users = {
  findBySteamId(steamId) {
    return db.prepare('SELECT * FROM users WHERE steam_id = ?').get(steamId);
  },
  findById(id) {
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  },
  findByDiscordId(discordId) {
    return db.prepare('SELECT * FROM users WHERE discord_id = ?').get(discordId);
  },
  findByPreferredCitizenId(citizenId) {
    return db.prepare('SELECT * FROM users WHERE lower(preferred_citizen_id) = lower(?)').get(String(citizenId || '').trim());
  },
  create({ steam_id, steam_name, avatar_url }) {
    const info = db.prepare(
      'INSERT INTO users (steam_id, steam_name, avatar_url) VALUES (?, ?, ?)'
    ).run(steam_id, steam_name, avatar_url || '');
    return this.findById(info.lastInsertRowid);
  },
  update(id, fields) {
    const allowed = ['steam_name', 'avatar_url', 'discord_id', 'discord_name', 'is_admin', 'is_banned', 'preferred_citizen_id'];
    const updates = [];
    const values = [];
    for (const key of allowed) {
      if (fields[key] !== undefined) {
        updates.push(`${key} = ?`);
        if (key === 'preferred_citizen_id') {
          values.push(String(fields[key] || '').trim());
        } else {
          values.push(fields[key]);
        }
      }
    }
    if (updates.length === 0) return;
    updates.push("updated_at = datetime('now')");
    values.push(id);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  },
  list() {
    return db.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
  },
};

// --- User citizen ID links (multi-character mapping per CAD user) ---
const UserCitizenLinks = {
  upsert({ user_id, citizen_id, source = 'unknown', seen_at = null }) {
    const parsedUserId = Number(user_id);
    const normalizedCitizenId = String(citizen_id || '').trim();
    if (!Number.isInteger(parsedUserId) || parsedUserId <= 0) return null;
    if (!normalizedCitizenId) return null;
    const normalizedSource = String(source || '').trim() || 'unknown';
    const seenAt = String(seen_at || '').trim() || null;
    db.prepare(`
      INSERT INTO user_citizen_links (
        user_id, citizen_id, source, first_seen_at, last_seen_at, created_at, updated_at
      ) VALUES (
        ?, ?, ?, COALESCE(?, datetime('now')), COALESCE(?, datetime('now')), datetime('now'), datetime('now')
      )
      ON CONFLICT(user_id, citizen_id) DO UPDATE SET
        source = CASE
          WHEN excluded.source IS NOT NULL AND TRIM(excluded.source) <> '' THEN excluded.source
          ELSE user_citizen_links.source
        END,
        last_seen_at = COALESCE(excluded.last_seen_at, user_citizen_links.last_seen_at, datetime('now')),
        updated_at = datetime('now')
    `).run(parsedUserId, normalizedCitizenId, normalizedSource, seenAt, seenAt);
    return this.findByUserIdAndCitizenId(parsedUserId, normalizedCitizenId);
  },
  findByUserIdAndCitizenId(userId, citizenId) {
    const parsedUserId = Number(userId);
    const normalizedCitizenId = String(citizenId || '').trim();
    if (!Number.isInteger(parsedUserId) || parsedUserId <= 0 || !normalizedCitizenId) return null;
    return db.prepare(`
      SELECT * FROM user_citizen_links
      WHERE user_id = ? AND lower(citizen_id) = lower(?)
      LIMIT 1
    `).get(parsedUserId, normalizedCitizenId);
  },
  listByUserId(userId, limit = 100) {
    const parsedUserId = Number(userId);
    const parsedLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.trunc(Number(limit))) : 100;
    if (!Number.isInteger(parsedUserId) || parsedUserId <= 0) return [];
    return db.prepare(`
      SELECT * FROM user_citizen_links
      WHERE user_id = ?
      ORDER BY last_seen_at DESC, id DESC
      LIMIT ?
    `).all(parsedUserId, parsedLimit);
  },
  findLatestByCitizenId(citizenId) {
    const normalizedCitizenId = String(citizenId || '').trim();
    if (!normalizedCitizenId) return null;
    return db.prepare(`
      SELECT * FROM user_citizen_links
      WHERE lower(citizen_id) = lower(?)
      ORDER BY last_seen_at DESC, id DESC
      LIMIT 1
    `).get(normalizedCitizenId);
  },
};

// --- Departments ---
const Departments = {
  list() {
    return db.prepare('SELECT * FROM departments ORDER BY sort_order ASC, id ASC').all();
  },
  listActive() {
    return db.prepare('SELECT * FROM departments WHERE is_active = 1 ORDER BY sort_order ASC, id ASC').all();
  },
  findById(id) {
    return db.prepare('SELECT * FROM departments WHERE id = ?').get(id);
  },
  findByShortName(shortName) {
    return db.prepare('SELECT * FROM departments WHERE short_name = ?').get(shortName);
  },
  create({ name, short_name, color, icon, slogan, layout_type, fivem_job_name, fivem_job_grade, sort_order }) {
    const resolvedSortOrder = Number.isFinite(Number(sort_order))
      ? Math.max(0, Math.trunc(Number(sort_order)))
      : getNextSortOrder('departments');
    const info = db.prepare(
      'INSERT INTO departments (name, short_name, color, icon, slogan, layout_type, fivem_job_name, fivem_job_grade, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      name,
      short_name || '',
      color || '#0052C2',
      icon || '',
      String(slogan || '').trim(),
      normalizeDepartmentLayoutType(layout_type),
      String(fivem_job_name || '').trim(),
      Number.isFinite(Number(fivem_job_grade)) ? Math.max(0, Math.trunc(Number(fivem_job_grade))) : 0,
      resolvedSortOrder
    );
    return this.findById(info.lastInsertRowid);
  },
  update(id, fields) {
    const allowed = ['name', 'short_name', 'color', 'icon', 'slogan', 'is_active', 'dispatch_visible', 'is_dispatch', 'layout_type', 'fivem_job_name', 'fivem_job_grade', 'sort_order'];
    const updates = [];
    const values = [];
    for (const key of allowed) {
      if (fields[key] !== undefined) {
        updates.push(`${key} = ?`);
        if (key === 'fivem_job_name' || key === 'slogan') {
          values.push(String(fields[key] || '').trim());
        } else if (key === 'fivem_job_grade') {
          const grade = Number(fields[key]);
          values.push(Number.isFinite(grade) ? Math.max(0, Math.trunc(grade)) : 0);
        } else if (key === 'layout_type') {
          values.push(normalizeDepartmentLayoutType(fields[key]));
        } else if (key === 'sort_order') {
          const sortOrder = Number(fields[key]);
          values.push(Number.isFinite(sortOrder) ? Math.max(0, Math.trunc(sortOrder)) : 0);
        } else {
          values.push(fields[key]);
        }
      }
    }
    if (updates.length === 0) return;
    values.push(id);
    db.prepare(`UPDATE departments SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  },
  listDispatchVisible() {
    const explicit = db.prepare(
      'SELECT * FROM departments WHERE dispatch_visible = 1 AND is_active = 1 AND is_dispatch = 0 ORDER BY sort_order ASC, id ASC'
    ).all();
    if (explicit.length > 0) return explicit;
    return db.prepare(
      'SELECT * FROM departments WHERE is_active = 1 AND is_dispatch = 0 ORDER BY sort_order ASC, id ASC'
    ).all();
  },
  reorder(orderedIds) {
    const tx = db.transaction(() => {
      const update = db.prepare('UPDATE departments SET sort_order = ? WHERE id = ?');
      orderedIds.forEach((id, index) => {
        update.run(index, id);
      });
    });
    tx();
  },
  delete(id) {
    db.prepare('DELETE FROM departments WHERE id = ?').run(id);
  },
};

// --- User Departments ---
const UserDepartments = {
  getForUser(userId) {
    return db.prepare(`
      SELECT d.* FROM departments d
      JOIN user_departments ud ON ud.department_id = d.id
      WHERE ud.user_id = ?
      ORDER BY d.sort_order ASC, d.id ASC
    `).all(userId);
  },
  setForUser(userId, departmentIds) {
    db.transaction(() => {
      db.prepare('DELETE FROM user_departments WHERE user_id = ?').run(userId);
      const insert = db.prepare('INSERT INTO user_departments (user_id, department_id) VALUES (?, ?)');
      for (const deptId of departmentIds) {
        insert.run(userId, deptId);
      }
    })();
  },
  add(userId, departmentId) {
    db.prepare(
      'INSERT OR IGNORE INTO user_departments (user_id, department_id) VALUES (?, ?)'
    ).run(userId, departmentId);
  },
  remove(userId, departmentId) {
    db.prepare(
      'DELETE FROM user_departments WHERE user_id = ? AND department_id = ?'
    ).run(userId, departmentId);
  },
};

// --- Sub Departments ---
const SubDepartments = {
  list() {
    return db.prepare(`
      SELECT sd.*, d.name as department_name, d.short_name as department_short_name
      FROM sub_departments sd
      JOIN departments d ON d.id = sd.department_id
      ORDER BY d.sort_order ASC, d.id ASC, sd.sort_order ASC, sd.name ASC, sd.id ASC
    `).all();
  },
  listByDepartment(departmentId, activeOnly = false) {
    const filter = activeOnly ? 'AND sd.is_active = 1' : '';
    return db.prepare(`
      SELECT sd.*, d.name as department_name, d.short_name as department_short_name
      FROM sub_departments sd
      JOIN departments d ON d.id = sd.department_id
      WHERE sd.department_id = ? ${filter}
      ORDER BY sd.sort_order ASC, sd.name ASC, sd.id ASC
    `).all(departmentId);
  },
  findById(id) {
    return db.prepare(`
      SELECT sd.*, d.name as department_name, d.short_name as department_short_name
      FROM sub_departments sd
      JOIN departments d ON d.id = sd.department_id
      WHERE sd.id = ?
    `).get(id);
  },
  create({ department_id, name, short_name, color, is_active, fivem_job_name, fivem_job_grade, sort_order }) {
    const resolvedSortOrder = Number.isFinite(Number(sort_order))
      ? Math.max(0, Math.trunc(Number(sort_order)))
      : getNextSortOrder('sub_departments', 'WHERE department_id = ?', [department_id]);
    const info = db.prepare(`
      INSERT INTO sub_departments (department_id, name, short_name, color, is_active, fivem_job_name, fivem_job_grade, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      department_id,
      name,
      short_name || '',
      color || '#0052C2',
      is_active === undefined ? 1 : (is_active ? 1 : 0),
      String(fivem_job_name || '').trim(),
      Number.isFinite(Number(fivem_job_grade)) ? Math.max(0, Math.trunc(Number(fivem_job_grade))) : 0,
      resolvedSortOrder
    );
    return this.findById(info.lastInsertRowid);
  },
  update(id, fields) {
    const allowed = ['name', 'short_name', 'color', 'is_active', 'fivem_job_name', 'fivem_job_grade', 'sort_order'];
    const updates = [];
    const values = [];
    for (const key of allowed) {
      if (fields[key] !== undefined) {
        updates.push(`${key} = ?`);
        if (key === 'fivem_job_name') {
          values.push(String(fields[key] || '').trim());
        } else if (key === 'fivem_job_grade') {
          const grade = Number(fields[key]);
          values.push(Number.isFinite(grade) ? Math.max(0, Math.trunc(grade)) : 0);
        } else if (key === 'sort_order') {
          const sortOrder = Number(fields[key]);
          values.push(Number.isFinite(sortOrder) ? Math.max(0, Math.trunc(sortOrder)) : 0);
        } else {
          values.push(fields[key]);
        }
      }
    }
    if (updates.length === 0) return;
    values.push(id);
    db.prepare(`UPDATE sub_departments SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  },
  reorderForDepartment(departmentId, orderedIds) {
    const tx = db.transaction(() => {
      const update = db.prepare('UPDATE sub_departments SET sort_order = ? WHERE id = ? AND department_id = ?');
      orderedIds.forEach((id, index) => {
        update.run(index, id, departmentId);
      });
    });
    tx();
  },
  delete(id) {
    db.prepare('DELETE FROM sub_departments WHERE id = ?').run(id);
  },
};

// --- User Sub Departments ---
const UserSubDepartments = {
  getForUser(userId) {
    return db.prepare(`
      SELECT sd.*, d.name as department_name, d.short_name as department_short_name
      FROM sub_departments sd
      JOIN user_sub_departments usd ON usd.sub_department_id = sd.id
      JOIN departments d ON d.id = sd.department_id
      WHERE usd.user_id = ?
      ORDER BY d.sort_order ASC, d.id ASC, sd.sort_order ASC, sd.name ASC
    `).all(userId);
  },
  setForUser(userId, subDepartmentIds) {
    db.transaction(() => {
      db.prepare('DELETE FROM user_sub_departments WHERE user_id = ?').run(userId);
      const insert = db.prepare('INSERT INTO user_sub_departments (user_id, sub_department_id) VALUES (?, ?)');
      for (const subDeptId of subDepartmentIds) {
        insert.run(userId, subDeptId);
      }
    })();
  },
};

// --- Discord Role Mappings / Links ---
const DiscordRoleMappings = {
  list() {
    return db.prepare(`
      SELECT
        drl.*,
        d.name as department_name,
        d.short_name as department_short_name,
        sd.name as sub_department_name,
        sd.short_name as sub_department_short_name,
        pd.name as parent_department_name,
        pd.short_name as parent_department_short_name
      FROM discord_role_links drl
      LEFT JOIN departments d
        ON drl.target_type = 'department' AND d.id = drl.target_id
      LEFT JOIN sub_departments sd
        ON drl.target_type = 'sub_department' AND sd.id = drl.target_id
      LEFT JOIN departments pd
        ON sd.department_id = pd.id
      ORDER BY drl.id
    `).all();
  },
  findById(id) {
    return db.prepare('SELECT * FROM discord_role_links WHERE id = ?').get(id);
  },
  findByRoleId(roleId) {
    return db.prepare('SELECT * FROM discord_role_links WHERE discord_role_id = ?').all(roleId);
  },
  create({ discord_role_id, discord_role_name, target_type, target_id, job_name, job_grade }) {
    const normalizedTargetId = Number.isFinite(Number(target_id)) ? Math.max(0, Math.trunc(Number(target_id))) : 0;
    const normalizedJobName = String(job_name || '').trim();
    const normalizedJobGradeRaw = Number(job_grade);
    const isJobWildcardGrade = target_type === 'job' && Number.isFinite(normalizedJobGradeRaw) && normalizedJobGradeRaw < 0;
    const normalizedJobGrade = isJobWildcardGrade
      ? -1
      : (Number.isFinite(normalizedJobGradeRaw)
        ? Math.max(0, Math.trunc(normalizedJobGradeRaw))
        : 0);

    const info = db.prepare(
      `INSERT INTO discord_role_links (
        discord_role_id, discord_role_name, target_type, target_id, job_name, job_grade
      ) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      discord_role_id,
      discord_role_name || '',
      target_type,
      normalizedTargetId,
      normalizedJobName,
      normalizedJobGrade
    );

    return {
      id: info.lastInsertRowid,
      discord_role_id,
      discord_role_name: discord_role_name || '',
      target_type,
      target_id: normalizedTargetId,
      job_name: normalizedJobName,
      job_grade: normalizedJobGrade,
    };
  },
  update(id, { discord_role_id, discord_role_name, target_type, target_id, job_name, job_grade }) {
    const existing = this.findById(id);
    if (!existing) return null;

    const normalizedTargetId = Number.isFinite(Number(target_id)) ? Math.max(0, Math.trunc(Number(target_id))) : 0;
    const normalizedJobName = String(job_name || '').trim();
    const normalizedJobGradeRaw = Number(job_grade);
    const isJobWildcardGrade = target_type === 'job' && Number.isFinite(normalizedJobGradeRaw) && normalizedJobGradeRaw < 0;
    const normalizedJobGrade = isJobWildcardGrade
      ? -1
      : (Number.isFinite(normalizedJobGradeRaw)
        ? Math.max(0, Math.trunc(normalizedJobGradeRaw))
        : 0);

    db.prepare(`
      UPDATE discord_role_links
      SET
        discord_role_id = ?,
        discord_role_name = ?,
        target_type = ?,
        target_id = ?,
        job_name = ?,
        job_grade = ?
      WHERE id = ?
    `).run(
      String(discord_role_id || '').trim(),
      String(discord_role_name || '').trim(),
      String(target_type || '').trim(),
      normalizedTargetId,
      normalizedJobName,
      normalizedJobGrade,
      id
    );

    return this.findById(id);
  },
  delete(id) {
    db.prepare('DELETE FROM discord_role_links WHERE id = ?').run(id);
  },
};

// --- Units ---
const Units = {
  _baseSelect() {
    return `
      SELECT
        u.*,
        COALESCE(NULLIF(dl.full_name, ''), NULLIF(fpl.player_name, ''), us.steam_name) as user_name,
        us.avatar_url as user_avatar,
        sd.name as sub_department_name,
        sd.short_name as sub_department_short_name,
        sd.color as sub_department_color
      FROM units u
      JOIN users us ON us.id = u.user_id
      LEFT JOIN fivem_player_links fpl ON fpl.steam_id = us.steam_id
      LEFT JOIN driver_licenses dl
        ON lower(dl.citizen_id) = lower(COALESCE(NULLIF(fpl.citizen_id, ''), us.preferred_citizen_id))
      LEFT JOIN sub_departments sd ON sd.id = u.sub_department_id
    `;
  },
  findById(id) {
    return db.prepare(`${this._baseSelect()} WHERE u.id = ?`).get(id);
  },
  findByUserId(userId) {
    return db.prepare(`${this._baseSelect()} WHERE u.user_id = ?`).get(userId);
  },
  listByDepartment(departmentId) {
    return db.prepare(`${this._baseSelect()} WHERE u.department_id = ? ORDER BY u.callsign`).all(departmentId);
  },
  listByDepartmentIds(departmentIds) {
    if (!departmentIds.length) return [];
    const placeholders = departmentIds.map(() => '?').join(',');
    return db.prepare(`
      SELECT
        u.*,
        COALESCE(NULLIF(dl.full_name, ''), NULLIF(fpl.player_name, ''), us.steam_name) as user_name,
        us.avatar_url as user_avatar,
        sd.name as sub_department_name,
        sd.short_name as sub_department_short_name,
        sd.color as sub_department_color,
        d.name as department_name,
        d.short_name as department_short_name,
        d.color as department_color
      FROM units u
      JOIN users us ON us.id = u.user_id
      LEFT JOIN fivem_player_links fpl ON fpl.steam_id = us.steam_id
      LEFT JOIN driver_licenses dl
        ON lower(dl.citizen_id) = lower(COALESCE(NULLIF(fpl.citizen_id, ''), us.preferred_citizen_id))
      JOIN departments d ON d.id = u.department_id
      LEFT JOIN sub_departments sd ON sd.id = u.sub_department_id
      WHERE u.department_id IN (${placeholders})
      ORDER BY d.id, u.callsign
    `).all(...departmentIds);
  },
  list() {
    return db.prepare(`${this._baseSelect()} ORDER BY u.callsign`).all();
  },
  create({ user_id, department_id, sub_department_id, callsign, status, location, note }) {
    const info = db.prepare(
      'INSERT INTO units (user_id, department_id, sub_department_id, callsign, status, location, note) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(user_id, department_id, sub_department_id || null, callsign, status || 'available', location || '', note || '');
    return this.findById(info.lastInsertRowid);
  },
  update(id, fields) {
    const allowed = ['callsign', 'status', 'location', 'note'];
    const updates = [];
    const values = [];
    for (const key of allowed) {
      if (fields[key] !== undefined) {
        updates.push(`${key} = ?`);
        values.push(fields[key]);
      }
    }
    if (updates.length === 0) return;
    updates.push("updated_at = datetime('now')");
    values.push(id);
    db.prepare(`UPDATE units SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  },
  remove(id) {
    db.prepare('DELETE FROM units WHERE id = ?').run(id);
  },
  removeByUserId(userId) {
    db.prepare('DELETE FROM units WHERE user_id = ?').run(userId);
  },
};

function normalizeRequestedDepartmentIds(value) {
  let source = [];
  if (Array.isArray(value)) {
    source = value;
  } else if (typeof value === 'string') {
    const text = String(value || '').trim();
    if (text) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) source = parsed;
      } catch {
        source = [];
      }
    }
  }

  return Array.from(new Set(
    source
      .map(item => Number(item))
      .filter(item => Number.isInteger(item) && item > 0)
  ));
}

function getFallbackRequestedDepartmentIds(departmentId) {
  const parsed = Number(departmentId);
  if (!Number.isInteger(parsed) || parsed <= 0) return [];
  return [parsed];
}

function normalizeRequestedDepartmentIdsWithFallback(value, fallbackDepartmentId) {
  const normalized = normalizeRequestedDepartmentIds(value);
  if (normalized.length > 0) return normalized;
  return getFallbackRequestedDepartmentIds(fallbackDepartmentId);
}

function hydrateRequestedDepartments(call) {
  if (!call || typeof call !== 'object') return call;
  call.requested_department_ids = normalizeRequestedDepartmentIdsWithFallback(
    call.requested_department_ids_json,
    call.department_id
  );
  return call;
}

// --- Calls ---
const Calls = {
  findById(id) {
    const call = db.prepare('SELECT * FROM calls WHERE id = ?').get(id);
    if (call) {
      call.assigned_units = db.prepare(`
        SELECT u.*, COALESCE(NULLIF(dl.full_name, ''), NULLIF(fpl.player_name, ''), us.steam_name) as user_name,
               sd.name as sub_department_name, sd.short_name as sub_department_short_name, sd.color as sub_department_color,
               d.short_name as department_short_name, d.color as department_color
        FROM call_units cu
        JOIN units u ON u.id = cu.unit_id
        JOIN users us ON us.id = u.user_id
        LEFT JOIN fivem_player_links fpl ON fpl.steam_id = us.steam_id
        LEFT JOIN driver_licenses dl
          ON lower(dl.citizen_id) = lower(COALESCE(NULLIF(fpl.citizen_id, ''), us.preferred_citizen_id))
        JOIN departments d ON d.id = u.department_id
        LEFT JOIN sub_departments sd ON sd.id = u.sub_department_id
        WHERE cu.call_id = ?
      `).all(id);
      hydrateRequestedDepartments(call);
    }
    return call;
  },
  listByDepartment(departmentId, includeCompleted = false) {
    const statusFilter = includeCompleted ? '' : "AND c.status != 'closed'";
    const calls = db.prepare(`
      SELECT c.*, us.steam_name as creator_name
      FROM calls c
      LEFT JOIN users us ON us.id = c.created_by
      WHERE c.department_id = ? ${statusFilter}
      ORDER BY
        CASE c.priority WHEN '1' THEN 1 WHEN '2' THEN 2 WHEN '3' THEN 3 ELSE 4 END,
        c.created_at DESC
    `).all(departmentId);

    const getUnits = db.prepare(`
      SELECT u.id, u.callsign, u.status, COALESCE(NULLIF(dl.full_name, ''), NULLIF(fpl.player_name, ''), us.steam_name) as user_name,
             sd.name as sub_department_name, sd.short_name as sub_department_short_name, sd.color as sub_department_color,
             d.short_name as department_short_name, d.color as department_color
      FROM call_units cu
      JOIN units u ON u.id = cu.unit_id
      JOIN users us ON us.id = u.user_id
      LEFT JOIN fivem_player_links fpl ON fpl.steam_id = us.steam_id
      LEFT JOIN driver_licenses dl
        ON lower(dl.citizen_id) = lower(COALESCE(NULLIF(fpl.citizen_id, ''), us.preferred_citizen_id))
      JOIN departments d ON d.id = u.department_id
      LEFT JOIN sub_departments sd ON sd.id = u.sub_department_id
      WHERE cu.call_id = ?
    `);

    for (const call of calls) {
      call.assigned_units = getUnits.all(call.id);
      hydrateRequestedDepartments(call);
    }
    return calls;
  },
  listByDepartmentIds(departmentIds, includeCompleted = false) {
    if (!departmentIds.length) return [];
    const placeholders = departmentIds.map(() => '?').join(',');
    const statusFilter = includeCompleted ? '' : "AND c.status != 'closed'";
    const calls = db.prepare(`
      SELECT c.*, us.steam_name as creator_name,
             d.name as department_name, d.short_name as department_short_name, d.color as department_color
      FROM calls c
      LEFT JOIN users us ON us.id = c.created_by
      JOIN departments d ON d.id = c.department_id
      WHERE c.department_id IN (${placeholders}) ${statusFilter}
      ORDER BY
        CASE c.priority WHEN '1' THEN 1 WHEN '2' THEN 2 WHEN '3' THEN 3 ELSE 4 END,
        c.created_at DESC
    `).all(...departmentIds);

    const getUnits = db.prepare(`
      SELECT u.id, u.callsign, u.status, COALESCE(NULLIF(dl.full_name, ''), NULLIF(fpl.player_name, ''), us.steam_name) as user_name,
             sd.name as sub_department_name, sd.short_name as sub_department_short_name, sd.color as sub_department_color,
             d.short_name as department_short_name, d.color as department_color
      FROM call_units cu
      JOIN units u ON u.id = cu.unit_id
      JOIN users us ON us.id = u.user_id
      LEFT JOIN fivem_player_links fpl ON fpl.steam_id = us.steam_id
      LEFT JOIN driver_licenses dl
        ON lower(dl.citizen_id) = lower(COALESCE(NULLIF(fpl.citizen_id, ''), us.preferred_citizen_id))
      JOIN departments d ON d.id = u.department_id
      LEFT JOIN sub_departments sd ON sd.id = u.sub_department_id
      WHERE cu.call_id = ?
    `);

    for (const call of calls) {
      call.assigned_units = getUnits.all(call.id);
      hydrateRequestedDepartments(call);
    }
    return calls;
  },
  create({
    department_id,
    title,
    priority,
    location,
    description,
    job_code,
    status,
    created_by,
    postal,
    position_x,
    position_y,
    position_z,
    requested_department_ids,
    pursuit_mode_enabled,
    pursuit_primary_unit_id,
    pursuit_updated_at,
  }) {
    const normalizedRequestedDepartmentIds = normalizeRequestedDepartmentIdsWithFallback(
      requested_department_ids,
      department_id
    );
    const info = db.prepare(
      `INSERT INTO calls (
        department_id, title, priority, location, description, job_code, status, created_by, postal, position_x, position_y, position_z, requested_department_ids_json, pursuit_mode_enabled, pursuit_primary_unit_id, pursuit_updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      department_id,
      title,
      priority || '3',
      location || '',
      description || '',
      job_code || '',
      status || 'active',
      created_by,
      String(postal || '').trim(),
      Number.isFinite(Number(position_x)) ? Number(position_x) : null,
      Number.isFinite(Number(position_y)) ? Number(position_y) : null,
      Number.isFinite(Number(position_z)) ? Number(position_z) : null,
      JSON.stringify(normalizedRequestedDepartmentIds),
      pursuit_mode_enabled ? 1 : 0,
      Number.isFinite(Number(pursuit_primary_unit_id)) ? Math.trunc(Number(pursuit_primary_unit_id)) : null,
      String(pursuit_updated_at || '').trim() || null
    );
    return this.findById(info.lastInsertRowid);
  },
  update(id, fields) {
    const allowed = [
      'title',
      'priority',
      'location',
      'description',
      'job_code',
      'status',
      'postal',
      'position_x',
      'position_y',
      'position_z',
      'was_ever_assigned',
      'requested_department_ids_json',
      'pursuit_mode_enabled',
      'pursuit_primary_unit_id',
      'pursuit_updated_at',
    ];
    const existing = this.findById(id) || null;
    const normalizedFields = { ...(fields || {}) };
    if (normalizedFields.requested_department_ids !== undefined && normalizedFields.requested_department_ids_json === undefined) {
      normalizedFields.requested_department_ids_json = normalizedFields.requested_department_ids;
    }

    const updates = [];
    const values = [];
    for (const key of allowed) {
      if (normalizedFields[key] !== undefined) {
        updates.push(`${key} = ?`);
        if (key === 'postal') {
          values.push(String(normalizedFields[key] || '').trim());
        } else if (key === 'position_x' || key === 'position_y' || key === 'position_z') {
          values.push(Number.isFinite(Number(normalizedFields[key])) ? Number(normalizedFields[key]) : null);
        } else if (key === 'was_ever_assigned') {
          values.push(normalizedFields[key] ? 1 : 0);
        } else if (key === 'pursuit_mode_enabled') {
          values.push(normalizedFields[key] ? 1 : 0);
        } else if (key === 'pursuit_primary_unit_id') {
          values.push(Number.isFinite(Number(normalizedFields[key])) ? Math.trunc(Number(normalizedFields[key])) : null);
        } else if (key === 'pursuit_updated_at') {
          values.push(String(normalizedFields[key] || '').trim() || null);
        } else if (key === 'requested_department_ids_json') {
          const normalizedRequestedDepartmentIds = normalizeRequestedDepartmentIdsWithFallback(
            normalizedFields[key],
            existing?.department_id
          );
          values.push(JSON.stringify(normalizedRequestedDepartmentIds));
        } else {
          values.push(normalizedFields[key]);
        }
      }
    }
    if (updates.length === 0) return;
    updates.push("updated_at = datetime('now')");
    values.push(id);
    db.prepare(`UPDATE calls SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  },
  assignUnit(callId, unitId) {
    const info = db.prepare('INSERT OR IGNORE INTO call_units (call_id, unit_id) VALUES (?, ?)').run(callId, unitId);
    return Number(info?.changes || 0);
  },
  unassignUnit(callId, unitId) {
    const info = db.prepare('DELETE FROM call_units WHERE call_id = ? AND unit_id = ?').run(callId, unitId);
    return Number(info?.changes || 0);
  },
  getAssignedCallForUnit(unitId) {
    const call = db.prepare(`
      SELECT c.* FROM calls c
      JOIN call_units cu ON cu.call_id = c.id
      WHERE cu.unit_id = ? AND c.status != 'closed'
      ORDER BY c.created_at DESC
      LIMIT 1
    `).get(unitId);
    return hydrateRequestedDepartments(call);
  },
  autoCloseStaleUnassigned({ staleMinutes = 10, limit = 100 } = {}) {
    const minutes = Number.isFinite(Number(staleMinutes))
      ? Math.max(1, Math.trunc(Number(staleMinutes)))
      : 10;
    const maxRows = Number.isFinite(Number(limit))
      ? Math.max(1, Math.trunc(Number(limit)))
      : 100;

    const staleCallRows = db.prepare(`
      SELECT c.id
      FROM calls c
      LEFT JOIN call_units cu ON cu.call_id = c.id
      WHERE c.status != 'closed'
        AND COALESCE(c.was_ever_assigned, 0) = 0
        AND cu.call_id IS NULL
        AND c.created_at <= datetime('now', ?)
      ORDER BY c.created_at ASC
      LIMIT ?
    `).all(`-${minutes} minutes`, maxRows);

    if (!Array.isArray(staleCallRows) || staleCallRows.length === 0) {
      return [];
    }

    const closeStmt = db.prepare(`
      UPDATE calls
      SET status = 'closed', updated_at = datetime('now')
      WHERE id = ? AND status != 'closed'
    `);

    const closedCallIds = [];
    const tx = db.transaction(() => {
      for (const row of staleCallRows) {
        const callId = Number(row?.id || 0);
        if (!callId) continue;
        const info = closeStmt.run(callId);
        if (Number(info?.changes || 0) > 0) {
          closedCallIds.push(callId);
        }
      }
    });
    tx();

    if (closedCallIds.length === 0) return [];

    const closedCalls = [];
    for (const callId of closedCallIds) {
      const call = this.findById(callId);
      if (call) closedCalls.push(call);
    }
    return closedCalls;
  },
};

const PURSUIT_OUTCOME_CODES = new Set([
  'arrest',
  'vehicle_stopped',
  'suspect_fled',
  'lost_visual',
  'cancelled_supervisor',
  'cancelled_safety',
  'other',
]);

function normalizePursuitOutcomeCode(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (PURSUIT_OUTCOME_CODES.has(normalized)) return normalized;
  return 'other';
}

function normalizePursuitInvolvedUnits(value) {
  const source = Array.isArray(value) ? value : parseJsonArrayValue(value);
  const out = [];
  const seen = new Set();

  for (const entry of source) {
    if (!entry || typeof entry !== 'object') continue;
    const id = Number(entry.id);
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      callsign: String(entry.callsign || '').trim().slice(0, 32),
      user_name: String(entry.user_name || '').trim().slice(0, 120),
      department_id: Number.isFinite(Number(entry.department_id)) ? Math.trunc(Number(entry.department_id)) : null,
      department_short_name: String(entry.department_short_name || '').trim().slice(0, 20),
      status: String(entry.status || '').trim().toLowerCase().slice(0, 24),
    });
  }

  return out;
}

function hydratePursuitOutcomeRow(row) {
  if (!row) return row;
  return {
    ...row,
    outcome_code: normalizePursuitOutcomeCode(row.outcome_code),
    involved_units: normalizePursuitInvolvedUnits(row.involved_units_json),
  };
}

// --- Pursuit Outcomes ---
const PursuitOutcomes = {
  findById(id) {
    const row = db.prepare(`
      SELECT po.*,
             us.steam_name AS creator_name
      FROM pursuit_outcomes po
      LEFT JOIN users us ON us.id = po.created_by_user_id
      WHERE po.id = ?
    `).get(id);
    return hydratePursuitOutcomeRow(row);
  },
  listByCallId(callId, limit = 25) {
    const parsedCallId = Number(callId);
    if (!Number.isInteger(parsedCallId) || parsedCallId <= 0) return [];
    const safeLimit = Math.min(200, Math.max(1, parseInt(limit, 10) || 25));
    return db.prepare(`
      SELECT po.*,
             us.steam_name AS creator_name
      FROM pursuit_outcomes po
      LEFT JOIN users us ON us.id = po.created_by_user_id
      WHERE po.call_id = ?
      ORDER BY po.created_at DESC, po.id DESC
      LIMIT ?
    `).all(parsedCallId, safeLimit).map(hydratePursuitOutcomeRow);
  },
  create(fields = {}) {
    const callId = Number(fields.call_id);
    const departmentId = Number(fields.department_id);
    if (!Number.isInteger(callId) || callId <= 0) throw new Error('call_id is required');
    if (!Number.isInteger(departmentId) || departmentId <= 0) throw new Error('department_id is required');

    const info = db.prepare(`
      INSERT INTO pursuit_outcomes (
        call_id,
        department_id,
        primary_unit_id,
        outcome_code,
        termination_location,
        summary,
        involved_units_json,
        created_by_user_id,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      callId,
      departmentId,
      Number.isFinite(Number(fields.primary_unit_id)) ? Math.trunc(Number(fields.primary_unit_id)) : null,
      normalizePursuitOutcomeCode(fields.outcome_code),
      String(fields.termination_location || '').trim().slice(0, 200),
      String(fields.summary || '').trim().slice(0, 2000),
      JSON.stringify(normalizePursuitInvolvedUnits(fields.involved_units)),
      Number.isFinite(Number(fields.created_by_user_id)) ? Math.trunc(Number(fields.created_by_user_id)) : null
    );

    return this.findById(info.lastInsertRowid);
  },
};

// --- Traffic Stops ---
const TrafficStops = {
  findById(id) {
    return db.prepare(`
      SELECT ts.*,
             us.steam_name AS creator_name,
             u.callsign AS unit_callsign,
             d.name AS department_name,
             d.short_name AS department_short_name,
             d.color AS department_color
      FROM traffic_stops ts
      LEFT JOIN users us ON us.id = ts.created_by_user_id
      LEFT JOIN units u ON u.id = ts.unit_id
      LEFT JOIN departments d ON d.id = ts.department_id
      WHERE ts.id = ?
    `).get(id);
  },
  listByDepartment(departmentId, limit = 100, offset = 0) {
    const safeLimit = Math.min(500, Math.max(1, parseInt(limit, 10) || 100));
    const safeOffset = Math.max(0, parseInt(offset, 10) || 0);
    return db.prepare(`
      SELECT ts.*,
             us.steam_name AS creator_name,
             u.callsign AS unit_callsign
      FROM traffic_stops ts
      LEFT JOIN users us ON us.id = ts.created_by_user_id
      LEFT JOIN units u ON u.id = ts.unit_id
      WHERE ts.department_id = ?
      ORDER BY ts.created_at DESC, ts.id DESC
      LIMIT ? OFFSET ?
    `).all(departmentId, safeLimit, safeOffset);
  },
  listByCallId(callId) {
    const parsedId = Number(callId);
    if (!Number.isInteger(parsedId) || parsedId <= 0) return [];
    return db.prepare(`
      SELECT ts.*,
             us.steam_name AS creator_name,
             u.callsign AS unit_callsign
      FROM traffic_stops ts
      LEFT JOIN users us ON us.id = ts.created_by_user_id
      LEFT JOIN units u ON u.id = ts.unit_id
      WHERE ts.call_id = ?
      ORDER BY ts.created_at DESC, ts.id DESC
    `).all(parsedId);
  },
  create(fields = {}) {
    const info = db.prepare(`
      INSERT INTO traffic_stops (
        department_id,
        call_id,
        unit_id,
        created_by_user_id,
        location,
        postal,
        plate,
        reason,
        outcome,
        notes,
        position_x,
        position_y,
        position_z,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      Number.isFinite(Number(fields.department_id)) ? Math.trunc(Number(fields.department_id)) : null,
      Number.isFinite(Number(fields.call_id)) ? Math.trunc(Number(fields.call_id)) : null,
      Number.isFinite(Number(fields.unit_id)) ? Math.trunc(Number(fields.unit_id)) : null,
      Number.isFinite(Number(fields.created_by_user_id)) ? Math.trunc(Number(fields.created_by_user_id)) : null,
      String(fields.location || '').trim(),
      String(fields.postal || '').trim(),
      String(fields.plate || '').trim().toUpperCase(),
      String(fields.reason || '').trim(),
      String(fields.outcome || '').trim(),
      String(fields.notes || '').trim(),
      Number.isFinite(Number(fields.position_x)) ? Number(fields.position_x) : null,
      Number.isFinite(Number(fields.position_y)) ? Number(fields.position_y) : null,
      Number.isFinite(Number(fields.position_z)) ? Number(fields.position_z) : null
    );
    return this.findById(info.lastInsertRowid);
  },
  update(id, fields = {}) {
    const allowed = [
      'department_id',
      'call_id',
      'unit_id',
      'location',
      'postal',
      'plate',
      'reason',
      'outcome',
      'notes',
      'position_x',
      'position_y',
      'position_z',
    ];
    const updates = [];
    const values = [];
    for (const key of allowed) {
      if (fields[key] === undefined) continue;
      updates.push(`${key} = ?`);
      if (key === 'plate') {
        values.push(String(fields[key] || '').trim().toUpperCase());
      } else if (['department_id', 'call_id', 'unit_id'].includes(key)) {
        values.push(Number.isFinite(Number(fields[key])) ? Math.trunc(Number(fields[key])) : null);
      } else if (['position_x', 'position_y', 'position_z'].includes(key)) {
        values.push(Number.isFinite(Number(fields[key])) ? Number(fields[key]) : null);
      } else {
        values.push(String(fields[key] || '').trim());
      }
    }
    if (updates.length === 0) return this.findById(id);
    updates.push("updated_at = datetime('now')");
    values.push(id);
    db.prepare(`UPDATE traffic_stops SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    return this.findById(id);
  },
};

function normalizeEvidenceEntityType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'criminal_record' || normalized === 'warrant') return normalized;
  return '';
}

function hydrateEvidenceItemRow(row) {
  if (!row) return row;
  return {
    ...row,
    metadata: parseJsonObjectValue(row.metadata_json),
  };
}

// --- Evidence Items ---
const EvidenceItems = {
  findById(id) {
    const row = db.prepare(`
      SELECT ei.*,
             us.steam_name AS creator_name
      FROM evidence_items ei
      LEFT JOIN users us ON us.id = ei.created_by_user_id
      WHERE ei.id = ?
    `).get(id);
    return hydrateEvidenceItemRow(row);
  },
  listByEntity(entityType, entityId) {
    const normalizedType = normalizeEvidenceEntityType(entityType);
    const parsedId = Number(entityId);
    if (!normalizedType || !Number.isInteger(parsedId) || parsedId <= 0) return [];
    return db.prepare(`
      SELECT ei.*,
             us.steam_name AS creator_name
      FROM evidence_items ei
      LEFT JOIN users us ON us.id = ei.created_by_user_id
      WHERE ei.entity_type = ? AND ei.entity_id = ?
      ORDER BY ei.created_at DESC, ei.id DESC
    `).all(normalizedType, parsedId).map(hydrateEvidenceItemRow);
  },
  listByDepartment(departmentId, { entityType = '', query = '', limit = 100 } = {}) {
    const parsedDeptId = Number(departmentId);
    if (!Number.isInteger(parsedDeptId) || parsedDeptId <= 0) return [];

    const normalizedType = normalizeEvidenceEntityType(entityType);
    const hasEntityTypeFilter = String(entityType || '').trim().length > 0 && !!normalizedType;
    const search = String(query || '').trim().toLowerCase();
    const safeLimit = Math.min(200, Math.max(1, parseInt(limit, 10) || 100));

    const clauses = ['ei.department_id = ?'];
    const params = [parsedDeptId];

    if (hasEntityTypeFilter) {
      clauses.push('ei.entity_type = ?');
      params.push(normalizedType);
    }

    if (search) {
      const q = `%${search}%`;
      clauses.push(`(
        lower(ei.title) LIKE ?
        OR lower(ei.case_number) LIKE ?
        OR lower(ei.description) LIKE ?
        OR lower(ei.chain_status) LIKE ?
        OR lower(COALESCE(cr.title, w.title, '')) LIKE ?
        OR lower(COALESCE(cr.citizen_id, w.citizen_id, '')) LIKE ?
        OR lower(COALESCE(w.subject_name, '')) LIKE ?
      )`);
      params.push(q, q, q, q, q, q, q);
    }

    params.push(safeLimit);

    return db.prepare(`
      SELECT ei.*,
             us.steam_name AS creator_name,
             cr.title AS criminal_record_title,
             cr.citizen_id AS criminal_record_citizen_id,
             w.title AS warrant_title,
             w.subject_name AS warrant_subject_name,
             w.citizen_id AS warrant_citizen_id
      FROM evidence_items ei
      LEFT JOIN users us ON us.id = ei.created_by_user_id
      LEFT JOIN criminal_records cr ON ei.entity_type = 'criminal_record' AND cr.id = ei.entity_id
      LEFT JOIN warrants w ON ei.entity_type = 'warrant' AND w.id = ei.entity_id
      WHERE ${clauses.join(' AND ')}
      ORDER BY ei.updated_at DESC, ei.id DESC
      LIMIT ?
    `).all(...params).map((row) => {
      const item = hydrateEvidenceItemRow(row);
      return {
        ...item,
        parent_title: item.criminal_record_title || item.warrant_title || '',
        parent_subject_name: item.warrant_subject_name || '',
        parent_citizen_id: item.criminal_record_citizen_id || item.warrant_citizen_id || '',
      };
    });
  },
  create(fields = {}) {
    const entityType = normalizeEvidenceEntityType(fields.entity_type);
    const entityId = Number(fields.entity_id);
    if (!entityType) throw new Error('entity_type is required');
    if (!Number.isInteger(entityId) || entityId <= 0) throw new Error('entity_id is required');

    const info = db.prepare(`
      INSERT INTO evidence_items (
        entity_type,
        entity_id,
        department_id,
        case_number,
        title,
        description,
        photo_url,
        chain_status,
        metadata_json,
        created_by_user_id,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      entityType,
      entityId,
      Number.isFinite(Number(fields.department_id)) ? Math.trunc(Number(fields.department_id)) : null,
      String(fields.case_number || '').trim(),
      String(fields.title || '').trim(),
      String(fields.description || '').trim(),
      String(fields.photo_url || '').trim(),
      String(fields.chain_status || 'logged').trim().toLowerCase().slice(0, 32) || 'logged',
      JSON.stringify(parseJsonObjectValue(fields.metadata)),
      Number.isFinite(Number(fields.created_by_user_id)) ? Math.trunc(Number(fields.created_by_user_id)) : null
    );
    return this.findById(info.lastInsertRowid);
  },
  delete(id) {
    const info = db.prepare('DELETE FROM evidence_items WHERE id = ?').run(id);
    return Number(info?.changes || 0);
  },
};

// --- Shift Notes ---
const ShiftNotes = {
  listByDepartment(departmentId, { userId = null, limit = 50 } = {}) {
    const parsedDeptId = Number(departmentId);
    if (!Number.isInteger(parsedDeptId) || parsedDeptId <= 0) return [];
    const safeLimit = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const params = [parsedDeptId];
    let userFilter = '';
    if (Number.isInteger(Number(userId)) && Number(userId) > 0) {
      userFilter = 'AND sn.user_id = ?';
      params.push(Math.trunc(Number(userId)));
    }
    params.push(safeLimit);
    return db.prepare(`
      SELECT sn.*,
             us.steam_name AS author_name,
             u.callsign AS unit_callsign
      FROM shift_notes sn
      LEFT JOIN users us ON us.id = sn.user_id
      LEFT JOIN units u ON u.id = sn.unit_id
      WHERE sn.department_id = ? ${userFilter}
      ORDER BY sn.created_at DESC, sn.id DESC
      LIMIT ?
    `).all(...params);
  },
  create(fields = {}) {
    const note = String(fields.note || '').trim();
    if (!note) throw new Error('note is required');
    const info = db.prepare(`
      INSERT INTO shift_notes (
        department_id,
        user_id,
        unit_id,
        note,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      Number.isFinite(Number(fields.department_id)) ? Math.trunc(Number(fields.department_id)) : null,
      Number.isFinite(Number(fields.user_id)) ? Math.trunc(Number(fields.user_id)) : null,
      Number.isFinite(Number(fields.unit_id)) ? Math.trunc(Number(fields.unit_id)) : null,
      note
    );
    return db.prepare(`
      SELECT sn.*,
             us.steam_name AS author_name,
             u.callsign AS unit_callsign
      FROM shift_notes sn
      LEFT JOIN users us ON us.id = sn.user_id
      LEFT JOIN units u ON u.id = sn.unit_id
      WHERE sn.id = ?
    `).get(info.lastInsertRowid);
  },
  delete(id) {
    const info = db.prepare('DELETE FROM shift_notes WHERE id = ?').run(id);
    return Number(info?.changes || 0);
  },
};

// --- BOLOs ---
const Bolos = {
  listByDepartment(departmentId, status = 'active') {
    return db.prepare(`
      SELECT b.*, us.steam_name as creator_name
      FROM bolos b
      LEFT JOIN users us ON us.id = b.created_by
      WHERE b.department_id = ? AND b.status = ?
      ORDER BY b.created_at DESC
    `).all(departmentId, status);
  },
  listByDepartmentIds(departmentIds = [], status = 'active') {
    const ids = Array.isArray(departmentIds)
      ? Array.from(new Set(
        departmentIds
          .map(id => Number(id))
          .filter(id => Number.isInteger(id) && id > 0)
      ))
      : [];
    if (ids.length === 0) return [];

    const placeholders = ids.map(() => '?').join(', ');
    return db.prepare(`
      SELECT b.*, us.steam_name as creator_name
      FROM bolos b
      LEFT JOIN users us ON us.id = b.created_by
      WHERE b.department_id IN (${placeholders}) AND b.status = ?
      ORDER BY b.created_at DESC
    `).all(...ids, status);
  },
  listActiveVehicleByPlate(plateKey = '', departmentIds = []) {
    const normalizedPlate = normalizePlateKey(plateKey);
    if (!normalizedPlate) return [];

    const ids = Array.isArray(departmentIds)
      ? Array.from(new Set(
        departmentIds
          .map(id => Number(id))
          .filter(id => Number.isInteger(id) && id > 0)
      ))
      : [];
    const scoped = ids.length > 0;
    const departmentFilter = scoped ? `AND b.department_id IN (${ids.map(() => '?').join(', ')})` : '';

    const rows = db.prepare(`
      SELECT b.*, us.steam_name as creator_name
      FROM bolos b
      LEFT JOIN users us ON us.id = b.created_by
      WHERE b.type = 'vehicle' AND b.status = 'active' ${departmentFilter}
      ORDER BY b.created_at DESC
    `).all(...ids);

    const matches = [];
    for (const bolo of rows) {
      let details = {};
      try {
        details = typeof bolo.details_json === 'string'
          ? JSON.parse(bolo.details_json || '{}')
          : (bolo.details_json || {});
      } catch {
        details = {};
      }

      const detailPlate = normalizePlateKey(details?.plate || details?.registration_plate || details?.rego || '');
      const titlePlate = normalizePlateKey(bolo?.title || '');
      const descriptionPlate = normalizePlateKey(bolo?.description || '');
      const titleHasPlate = titlePlate.includes(normalizedPlate);
      const descriptionHasPlate = descriptionPlate.includes(normalizedPlate);
      if (detailPlate === normalizedPlate || titleHasPlate || descriptionHasPlate) {
        matches.push(bolo);
      }
    }

    return matches;
  },
  findById(id) {
    return db.prepare(`
      SELECT b.*, us.steam_name as creator_name
      FROM bolos b
      LEFT JOIN users us ON us.id = b.created_by
      WHERE b.id = ?
    `).get(id);
  },
  create({ department_id, type, title, description, details_json, created_by }) {
    const info = db.prepare(
      'INSERT INTO bolos (department_id, type, title, description, details_json, created_by) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(department_id, type, title, description || '', details_json || '{}', created_by);
    return this.findById(info.lastInsertRowid);
  },
  updateStatus(id, status) {
    db.prepare('UPDATE bolos SET status = ? WHERE id = ?').run(status, id);
  },
};

// --- Warrants ---
const Warrants = {
  listByDepartment(departmentId, status = 'active') {
    return db.prepare(`
      SELECT w.*, us.steam_name as creator_name
      FROM warrants w
      LEFT JOIN users us ON us.id = w.created_by
      WHERE w.department_id = ? AND w.status = ?
      ORDER BY w.created_at DESC
    `).all(departmentId, status);
  },
  listByDepartmentIds(departmentIds = [], status = 'active') {
    const ids = Array.isArray(departmentIds)
      ? Array.from(new Set(
        departmentIds
          .map(id => Number(id))
          .filter(id => Number.isInteger(id) && id > 0)
      ))
      : [];
    if (ids.length === 0) return [];

    const placeholders = ids.map(() => '?').join(', ');
    return db.prepare(`
      SELECT w.*, us.steam_name as creator_name
      FROM warrants w
      LEFT JOIN users us ON us.id = w.created_by
      WHERE w.department_id IN (${placeholders}) AND w.status = ?
      ORDER BY w.created_at DESC
    `).all(...ids, status);
  },
  findById(id) {
    return db.prepare(`
      SELECT w.*, us.steam_name as creator_name
      FROM warrants w
      LEFT JOIN users us ON us.id = w.created_by
      WHERE w.id = ?
    `).get(id);
  },
  findByCitizenId(citizenId, status = 'active') {
    const normalized = String(citizenId || '').trim();
    if (!normalized) return [];
    return db.prepare(`
      SELECT w.*, us.steam_name as creator_name
      FROM warrants w
      LEFT JOIN users us ON us.id = w.created_by
      WHERE w.citizen_id = ? AND w.status = ?
      ORDER BY w.created_at DESC
    `).all(normalized, status);
  },
  create({ department_id, citizen_id, subject_name, title, description, details_json, created_by }) {
    const normalizedCitizenId = String(citizen_id || '').trim();
    const normalizedSubjectName = String(subject_name || '').trim();
    const info = db.prepare(
      'INSERT INTO warrants (department_id, citizen_id, subject_name, title, description, details_json, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(department_id, normalizedCitizenId, normalizedSubjectName, title, description || '', details_json || '{}', created_by);
    return this.findById(info.lastInsertRowid);
  },
  updateStatus(id, status) {
    db.prepare('UPDATE warrants SET status = ? WHERE id = ?').run(status, id);
  },
};

// --- Warrant community Discord messages ---
const WarrantCommunityMessages = {
  findByWarrantId(warrantId) {
    const id = Number(warrantId);
    if (!Number.isInteger(id) || id <= 0) return null;
    return db.prepare('SELECT * FROM warrant_community_messages WHERE warrant_id = ?').get(id);
  },
  upsert({ warrant_id, discord_message_id, webhook_url, status = 'posted', last_error = '' }) {
    const warrantId = Number(warrant_id);
    if (!Number.isInteger(warrantId) || warrantId <= 0) return null;
    const messageId = String(discord_message_id || '').trim();
    const webhook = String(webhook_url || '').trim();
    const normalizedStatus = ['posted', 'deleted', 'delete_failed'].includes(String(status || '').trim())
      ? String(status || '').trim()
      : 'posted';
    db.prepare(`
      INSERT INTO warrant_community_messages (
        warrant_id, discord_message_id, webhook_url, status, last_error, posted_at, deleted_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, datetime('now'), NULL, datetime('now'), datetime('now'))
      ON CONFLICT(warrant_id) DO UPDATE SET
        discord_message_id = excluded.discord_message_id,
        webhook_url = excluded.webhook_url,
        status = excluded.status,
        last_error = excluded.last_error,
        posted_at = CASE
          WHEN excluded.status = 'posted' THEN datetime('now')
          ELSE warrant_community_messages.posted_at
        END,
        deleted_at = CASE
          WHEN excluded.status = 'posted' THEN NULL
          ELSE warrant_community_messages.deleted_at
        END,
        updated_at = datetime('now')
    `).run(
      warrantId,
      messageId,
      webhook,
      normalizedStatus,
      String(last_error || '').slice(0, 500)
    );
    return this.findByWarrantId(warrantId);
  },
  markDeleted(warrantId) {
    const id = Number(warrantId);
    if (!Number.isInteger(id) || id <= 0) return null;
    db.prepare(`
      UPDATE warrant_community_messages
      SET status = 'deleted', last_error = '', deleted_at = datetime('now'), updated_at = datetime('now')
      WHERE warrant_id = ?
    `).run(id);
    return this.findByWarrantId(id);
  },
  markDeleteFailed(warrantId, error) {
    const id = Number(warrantId);
    if (!Number.isInteger(id) || id <= 0) return null;
    db.prepare(`
      UPDATE warrant_community_messages
      SET status = 'delete_failed', last_error = ?, updated_at = datetime('now')
      WHERE warrant_id = ?
    `).run(String(error || '').slice(0, 500), id);
    return this.findByWarrantId(id);
  },
};

// --- Offence Catalog ---
const OffenceCatalog = {
  list(activeOnly = false) {
    const filter = activeOnly ? 'WHERE is_active = 1' : '';
    return db.prepare(`
      SELECT *
      FROM offence_catalog
      ${filter}
      ORDER BY
        CASE category
          WHEN 'infringement' THEN 1
          WHEN 'summary' THEN 2
          WHEN 'indictment' THEN 3
          ELSE 9
        END,
        sort_order ASC,
        title ASC,
        id ASC
    `).all();
  },
  findById(id) {
    return db.prepare('SELECT * FROM offence_catalog WHERE id = ?').get(id);
  },
  findByIds(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return [];
    const numericIds = Array.from(new Set(
      ids
        .map(id => Number(id))
        .filter(id => Number.isInteger(id) && id > 0)
    ));
    if (numericIds.length === 0) return [];
    const placeholders = numericIds.map(() => '?').join(', ');
    return db.prepare(`SELECT * FROM offence_catalog WHERE id IN (${placeholders})`).all(...numericIds);
  },
  create({ category, code, title, description, fine_amount, jail_minutes, sort_order, is_active }) {
    const normalizedCode = String(code || '').trim().toUpperCase();
    const info = db.prepare(`
      INSERT INTO offence_catalog (
        category, code, title, description, fine_amount, jail_minutes, sort_order, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      normalizeOffenceCategory(category),
      normalizedCode,
      String(title || '').trim(),
      String(description || '').trim(),
      Math.max(0, Number(fine_amount || 0)),
      Number.isFinite(Number(jail_minutes)) ? Math.max(0, Math.trunc(Number(jail_minutes))) : 0,
      Number.isFinite(Number(sort_order)) ? Math.trunc(Number(sort_order)) : 0,
      is_active === undefined ? 1 : (is_active ? 1 : 0)
    );
    return this.findById(info.lastInsertRowid);
  },
  update(id, fields) {
    const allowed = ['category', 'code', 'title', 'description', 'fine_amount', 'jail_minutes', 'sort_order', 'is_active'];
    const updates = [];
    const values = [];
    for (const key of allowed) {
      if (fields[key] !== undefined) {
        updates.push(`${key} = ?`);
        if (key === 'category') {
          values.push(normalizeOffenceCategory(fields[key]));
        } else if (key === 'code') {
          values.push(String(fields[key] || '').trim().toUpperCase());
        } else if (key === 'title') {
          values.push(String(fields[key] || '').trim());
        } else if (key === 'description') {
          values.push(String(fields[key] || '').trim());
        } else if (key === 'fine_amount') {
          values.push(Math.max(0, Number(fields[key] || 0)));
        } else if (key === 'jail_minutes') {
          values.push(Number.isFinite(Number(fields[key])) ? Math.max(0, Math.trunc(Number(fields[key]))) : 0);
        } else if (key === 'sort_order') {
          values.push(Number.isFinite(Number(fields[key])) ? Math.trunc(Number(fields[key])) : 0);
        } else if (key === 'is_active') {
          values.push(fields[key] ? 1 : 0);
        } else {
          values.push(fields[key]);
        }
      }
    }
    if (updates.length === 0) return;
    updates.push("updated_at = datetime('now')");
    values.push(id);
    db.prepare(`UPDATE offence_catalog SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  },
  delete(id) {
    db.prepare('DELETE FROM offence_catalog WHERE id = ?').run(id);
  },
  clearAll() {
    const tx = db.transaction(() => {
      const info = db.prepare('DELETE FROM offence_catalog').run();
      db.prepare("DELETE FROM sqlite_sequence WHERE name = 'offence_catalog'").run();
      return Number(info?.changes || 0);
    });
    return tx();
  },
};

// --- Criminal Records ---
const CriminalRecords = {
  findByCitizenId(citizenId) {
    return db.prepare(
      'SELECT * FROM criminal_records WHERE citizen_id = ? ORDER BY created_at DESC'
    ).all(citizenId);
  },
  countByCitizenId(citizenId) {
    const normalized = String(citizenId || '').trim();
    if (!normalized) return 0;
    const row = db.prepare('SELECT COUNT(*) AS count FROM criminal_records WHERE citizen_id = ?').get(normalized);
    return Number(row?.count || 0);
  },
  countByCitizenIds(citizenIds = []) {
    const ids = Array.isArray(citizenIds)
      ? Array.from(new Set(
        citizenIds
          .map((id) => String(id || '').trim())
          .filter(Boolean)
      ))
      : [];
    if (ids.length === 0) return {};

    const placeholders = ids.map(() => '?').join(', ');
    const rows = db.prepare(`
      SELECT citizen_id, COUNT(*) AS count
      FROM criminal_records
      WHERE citizen_id IN (${placeholders})
      GROUP BY citizen_id
    `).all(...ids);

    const out = {};
    for (const row of rows) {
      const key = String(row?.citizen_id || '').trim();
      if (!key) continue;
      out[key] = Number(row?.count || 0);
    }
    return out;
  },
  findById(id) {
    return db.prepare('SELECT * FROM criminal_records WHERE id = ?').get(id);
  },
  create({
    citizen_id,
    type,
    title,
    description,
    fine_amount,
    offence_items_json,
    officer_name,
    officer_callsign,
    department_id,
    jail_minutes,
  }) {
    const info = db.prepare(
      'INSERT INTO criminal_records (citizen_id, type, title, description, fine_amount, offence_items_json, officer_name, officer_callsign, department_id, jail_minutes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      citizen_id,
      type,
      title,
      description || '',
      fine_amount || 0,
      String(offence_items_json || '[]'),
      officer_name || '',
      officer_callsign || '',
      department_id,
      Number.isFinite(Number(jail_minutes)) ? Math.max(0, Math.trunc(Number(jail_minutes))) : 0
    );
    return this.findById(info.lastInsertRowid);
  },
  update(id, fields) {
    const allowed = ['type', 'title', 'description', 'fine_amount', 'offence_items_json', 'jail_minutes'];
    const updates = [];
    const values = [];
    for (const key of allowed) {
      if (fields[key] !== undefined) {
        updates.push(`${key} = ?`);
        if (key === 'offence_items_json') {
          values.push(String(fields[key] || '[]'));
        } else if (key === 'jail_minutes') {
          values.push(Math.max(0, Math.trunc(Number(fields[key] || 0))));
        } else {
          values.push(fields[key]);
        }
      }
    }
    if (updates.length === 0) return;
    values.push(id);
    db.prepare(`UPDATE criminal_records SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  },
  delete(id) {
    db.prepare('DELETE FROM criminal_records WHERE id = ?').run(id);
  },
  list(limit = 50, offset = 0) {
    return db.prepare(
      'SELECT * FROM criminal_records ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).all(limit, offset);
  },
};

const DRIVER_LICENSE_STATUSES = new Set(['valid', 'suspended', 'disqualified', 'expired']);
const VEHICLE_REGISTRATION_STATUSES = new Set(['valid', 'suspended', 'revoked', 'expired']);
const PATIENT_TRIAGE_CATEGORIES = new Set(['undetermined', 'immediate', 'urgent', 'delayed', 'minor', 'deceased']);
const PATIENT_MCI_TAGS = new Set(['', 'green', 'yellow', 'red', 'black']);

function parseJsonArrayValue(value) {
  if (Array.isArray(value)) return value;
  const text = String(value || '').trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonObjectValue(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  const text = String(value || '').trim();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeStringArray(value, { uppercase = false, maxLength = 64 } = {}) {
  const source = Array.isArray(value) ? value : parseJsonArrayValue(value);
  const seen = new Set();
  const out = [];
  for (const entry of source) {
    let text = String(entry || '').trim();
    if (!text) continue;
    if (uppercase) text = text.toUpperCase();
    if (text.length > maxLength) {
      text = text.slice(0, maxLength);
    }
    if (seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

function normalizeDateOnly(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const parsed = Date.parse(text);
  if (Number.isNaN(parsed)) return '';
  return new Date(parsed).toISOString().slice(0, 10);
}

function normalizeStatus(value, allowedStatuses, fallback) {
  const normalized = String(value || '').trim().toLowerCase();
  if (allowedStatuses.has(normalized)) return normalized;
  return fallback;
}

function normalizeNumber(value, { min = null, max = null, fallback = 0 } = {}) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  let out = num;
  if (Number.isFinite(min)) out = Math.max(min, out);
  if (Number.isFinite(max)) out = Math.min(max, out);
  return out;
}

function normalizePlateKey(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function hydrateDriverLicenseRow(row) {
  if (!row) return row;
  return {
    ...row,
    license_classes: normalizeStringArray(row.license_classes_json, { uppercase: true, maxLength: 10 }),
    conditions: normalizeStringArray(row.conditions_json, { uppercase: false, maxLength: 80 }),
  };
}

function hydrateVehicleRegistrationRow(row) {
  if (!row) return row;
  return { ...row };
}

function normalizeTriageCategory(value) {
  return normalizeStatus(value, PATIENT_TRIAGE_CATEGORIES, 'undetermined');
}

function normalizePatientBodyMarks(value) {
  const source = parseJsonArrayValue(value).slice(0, 100);
  const cleaned = [];

  for (const entry of source) {
    if (!entry || typeof entry !== 'object') continue;
    const view = String(entry.view || '').trim().toLowerCase() === 'back' ? 'back' : 'front';
    const x = normalizeNumber(entry.x, { min: 0, max: 100, fallback: 50 });
    const y = normalizeNumber(entry.y, { min: 0, max: 100, fallback: 50 });
    const type = String(entry.type || '').trim().slice(0, 40);
    const severity = String(entry.severity || '').trim().toLowerCase().slice(0, 20);
    const note = String(entry.note || '').trim().slice(0, 160);
    const id = String(entry.id || `${Date.now()}_${cleaned.length}`).trim().slice(0, 80);
    if (!type && !note) continue;
    cleaned.push({
      id,
      view,
      x: Number(x.toFixed(2)),
      y: Number(y.toFixed(2)),
      type,
      severity,
      note,
    });
  }

  return cleaned;
}

function normalizePatientTreatmentLog(value) {
  const source = parseJsonArrayValue(value).slice(0, 100);
  const out = [];

  for (let i = 0; i < source.length; i += 1) {
    const entry = source[i];
    if (!entry || typeof entry !== 'object') continue;

    const id = String(entry.id || `${Date.now()}_${i}`).trim().slice(0, 80);
    const category = String(entry.category || '').trim().toLowerCase().slice(0, 32) || 'treatment';
    const name = String(entry.name || entry.medication || entry.procedure || '').trim().slice(0, 120);
    const dose = String(entry.dose || '').trim().slice(0, 80);
    const route = String(entry.route || '').trim().slice(0, 40);
    const status = String(entry.status || '').trim().toLowerCase().slice(0, 24) || 'completed';
    const timestamp = String(entry.timestamp || entry.time || '').trim().slice(0, 40);
    const notes = String(entry.notes || entry.note || '').trim().slice(0, 200);

    if (!name && !notes) continue;
    out.push({
      id,
      category,
      name,
      dose,
      route,
      status,
      timestamp,
      notes,
    });
  }

  return out;
}

function normalizePatientTransport(value) {
  const source = parseJsonObjectValue(value);
  const etaSource = source.eta_minutes;
  const bedSource = source.bed_availability;
  const etaNum = Number(etaSource);
  const bedNum = Number(bedSource);

  return {
    destination: String(source.destination || '').trim().slice(0, 120),
    eta_minutes: Number.isFinite(etaNum) ? Math.max(0, Math.min(999, Math.trunc(etaNum))) : null,
    bed_availability: Number.isFinite(bedNum) ? Math.max(0, Math.min(999, Math.trunc(bedNum))) : null,
    status: String(source.status || '').trim().toLowerCase().slice(0, 32),
    unit_callsign: String(source.unit_callsign || '').trim().slice(0, 32),
    notes: String(source.notes || '').trim().slice(0, 200),
    updated_at: String(source.updated_at || '').trim().slice(0, 40),
  };
}

function normalizePatientMciTag(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (PATIENT_MCI_TAGS.has(normalized)) return normalized;
  return '';
}

function hydratePatientAnalysisRow(row) {
  if (!row) return row;
  return {
    ...row,
    pain_score: normalizeNumber(row.pain_score, { min: 0, max: 10, fallback: 0 }),
    triage_category: normalizeTriageCategory(row.triage_category),
    questionnaire: parseJsonObjectValue(row.questionnaire_json),
    vitals: parseJsonObjectValue(row.vitals_json),
    body_marks: normalizePatientBodyMarks(row.body_marks_json),
    treatment_log: normalizePatientTreatmentLog(row.treatment_log_json),
    transport: normalizePatientTransport(row.transport_json),
    mci_incident_key: String(row.mci_incident_key || '').trim(),
    mci_tag: normalizePatientMciTag(row.mci_tag),
  };
}

// --- Paramedic Patient Analyses ---
const PatientAnalyses = {
  findById(id) {
    return hydratePatientAnalysisRow(db.prepare('SELECT * FROM patient_analyses WHERE id = ?').get(id));
  },
  listByCitizenId(citizenId, limit = 30) {
    const normalized = String(citizenId || '').trim();
    if (!normalized) return [];
    const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 30));
    return db.prepare(`
      SELECT * FROM patient_analyses
      WHERE citizen_id = ?
      ORDER BY updated_at DESC, id DESC
      LIMIT ?
    `).all(normalized, safeLimit).map(hydratePatientAnalysisRow);
  },
  countByCitizenIds(citizenIds = []) {
    const ids = Array.isArray(citizenIds)
      ? Array.from(new Set(
        citizenIds
          .map((id) => String(id || '').trim())
          .filter(Boolean)
      ))
      : [];
    if (ids.length === 0) return {};

    const placeholders = ids.map(() => '?').join(', ');
    const rows = db.prepare(`
      SELECT citizen_id, COUNT(*) AS count, MAX(updated_at) AS last_updated_at
      FROM patient_analyses
      WHERE citizen_id IN (${placeholders})
      GROUP BY citizen_id
    `).all(...ids);

    const out = {};
    for (const row of rows) {
      const key = String(row?.citizen_id || '').trim();
      if (!key) continue;
      out[key] = {
        count: Number(row?.count || 0),
        last_updated_at: row?.last_updated_at || null,
      };
    }
    return out;
  },
  create({
    citizen_id,
    patient_name,
    department_id,
    triage_category,
    chief_complaint,
    pain_score,
    questionnaire,
    vitals,
    body_marks,
    notes,
    treatment_log,
    transport,
    mci_incident_key,
    mci_tag,
    created_by_user_id,
    updated_by_user_id,
  }) {
    const normalizedCitizenId = String(citizen_id || '').trim();
    if (!normalizedCitizenId) {
      throw new Error('citizen_id is required');
    }

    const info = db.prepare(`
      INSERT INTO patient_analyses (
        citizen_id,
        patient_name,
        department_id,
        triage_category,
        chief_complaint,
        pain_score,
        questionnaire_json,
        vitals_json,
        body_marks_json,
        treatment_log_json,
        transport_json,
        mci_incident_key,
        mci_tag,
        notes,
        created_by_user_id,
        updated_by_user_id,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      normalizedCitizenId,
      String(patient_name || '').trim(),
      Number.isFinite(Number(department_id)) ? Math.trunc(Number(department_id)) : null,
      normalizeTriageCategory(triage_category),
      String(chief_complaint || '').trim(),
      normalizeNumber(pain_score, { min: 0, max: 10, fallback: 0 }),
      JSON.stringify(parseJsonObjectValue(questionnaire)),
      JSON.stringify(parseJsonObjectValue(vitals)),
      JSON.stringify(normalizePatientBodyMarks(body_marks)),
      JSON.stringify(normalizePatientTreatmentLog(treatment_log)),
      JSON.stringify(normalizePatientTransport(transport)),
      String(mci_incident_key || '').trim().slice(0, 80),
      normalizePatientMciTag(mci_tag),
      String(notes || '').trim(),
      created_by_user_id || null,
      updated_by_user_id || null
    );

    return this.findById(info.lastInsertRowid);
  },
  update(id, fields = {}) {
    const updates = [];
    const values = [];

    if (fields.patient_name !== undefined) {
      updates.push('patient_name = ?');
      values.push(String(fields.patient_name || '').trim());
    }
    if (fields.department_id !== undefined) {
      updates.push('department_id = ?');
      values.push(Number.isFinite(Number(fields.department_id)) ? Math.trunc(Number(fields.department_id)) : null);
    }
    if (fields.triage_category !== undefined) {
      updates.push('triage_category = ?');
      values.push(normalizeTriageCategory(fields.triage_category));
    }
    if (fields.chief_complaint !== undefined) {
      updates.push('chief_complaint = ?');
      values.push(String(fields.chief_complaint || '').trim());
    }
    if (fields.pain_score !== undefined) {
      updates.push('pain_score = ?');
      values.push(normalizeNumber(fields.pain_score, { min: 0, max: 10, fallback: 0 }));
    }
    if (fields.questionnaire !== undefined || fields.questionnaire_json !== undefined) {
      updates.push('questionnaire_json = ?');
      const source = fields.questionnaire !== undefined ? fields.questionnaire : fields.questionnaire_json;
      values.push(JSON.stringify(parseJsonObjectValue(source)));
    }
    if (fields.vitals !== undefined || fields.vitals_json !== undefined) {
      updates.push('vitals_json = ?');
      const source = fields.vitals !== undefined ? fields.vitals : fields.vitals_json;
      values.push(JSON.stringify(parseJsonObjectValue(source)));
    }
    if (fields.body_marks !== undefined || fields.body_marks_json !== undefined) {
      updates.push('body_marks_json = ?');
      const source = fields.body_marks !== undefined ? fields.body_marks : fields.body_marks_json;
      values.push(JSON.stringify(normalizePatientBodyMarks(source)));
    }
    if (fields.treatment_log !== undefined || fields.treatment_log_json !== undefined) {
      updates.push('treatment_log_json = ?');
      const source = fields.treatment_log !== undefined ? fields.treatment_log : fields.treatment_log_json;
      values.push(JSON.stringify(normalizePatientTreatmentLog(source)));
    }
    if (fields.transport !== undefined || fields.transport_json !== undefined) {
      updates.push('transport_json = ?');
      const source = fields.transport !== undefined ? fields.transport : fields.transport_json;
      values.push(JSON.stringify(normalizePatientTransport(source)));
    }
    if (fields.mci_incident_key !== undefined) {
      updates.push('mci_incident_key = ?');
      values.push(String(fields.mci_incident_key || '').trim().slice(0, 80));
    }
    if (fields.mci_tag !== undefined) {
      updates.push('mci_tag = ?');
      values.push(normalizePatientMciTag(fields.mci_tag));
    }
    if (fields.notes !== undefined) {
      updates.push('notes = ?');
      values.push(String(fields.notes || '').trim());
    }
    if (fields.updated_by_user_id !== undefined) {
      updates.push('updated_by_user_id = ?');
      values.push(fields.updated_by_user_id || null);
    }

    if (updates.length === 0) return this.findById(id);
    updates.push("updated_at = datetime('now')");
    values.push(id);

    db.prepare(`UPDATE patient_analyses SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    return this.findById(id);
  },
};

// --- Driver Licenses ---
const DriverLicenses = {
  findById(id) {
    return hydrateDriverLicenseRow(db.prepare('SELECT * FROM driver_licenses WHERE id = ?').get(id));
  },
  findByCitizenId(citizenId) {
    const normalized = String(citizenId || '').trim();
    if (!normalized) return null;
    return hydrateDriverLicenseRow(db.prepare('SELECT * FROM driver_licenses WHERE lower(citizen_id) = lower(?)').get(normalized));
  },
  search(query, limit = 50) {
    const text = String(query || '').trim().toLowerCase();
    if (!text) return [];
    const tokens = Array.from(new Set(text.split(/\s+/).filter(Boolean))).slice(0, 6);
    if (tokens.length === 0) return [];
    const safeLimit = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const tokenClauses = [];
    const params = [];

    for (const token of tokens) {
      const q = `%${token}%`;
      const normalizedToken = token.replace(/[^a-z0-9]/g, '');
      const qNormalized = normalizedToken ? `%${normalizedToken}%` : q;

      tokenClauses.push(`(
        lower(citizen_id) LIKE ?
        OR lower(full_name) LIKE ?
        OR lower(license_number) LIKE ?
        OR replace(replace(lower(license_number), ' ', ''), '-', '') LIKE ?
      )`);

      params.push(q, q, q, qNormalized);
    }

    return db.prepare(`
      SELECT * FROM driver_licenses
      WHERE ${tokenClauses.join(' AND ')}
      ORDER BY updated_at DESC
      LIMIT ?
    `).all(...params, safeLimit).map(hydrateDriverLicenseRow);
  },
  upsertByCitizenId({
    citizen_id,
    full_name,
    date_of_birth,
    gender,
    license_number,
    license_classes,
    conditions,
    mugshot_url,
    status,
    expiry_at,
    created_by_user_id,
    updated_by_user_id,
  }) {
    const normalizedCitizenId = String(citizen_id || '').trim();
    if (!normalizedCitizenId) {
      throw new Error('citizen_id is required');
    }

    const normalizedClasses = normalizeStringArray(license_classes, { uppercase: true, maxLength: 10 });
    const normalizedConditions = normalizeStringArray(conditions, { uppercase: false, maxLength: 80 });
    const normalizedStatus = normalizeStatus(status, DRIVER_LICENSE_STATUSES, 'valid');
    const normalizedDob = normalizeDateOnly(date_of_birth);
    const normalizedExpiry = normalizeDateOnly(expiry_at);

    db.prepare(`
      INSERT INTO driver_licenses (
        citizen_id, full_name, date_of_birth, gender, license_number, license_classes_json,
        conditions_json, mugshot_url, status, expiry_at, created_by_user_id, updated_by_user_id,
        issued_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))
      ON CONFLICT(citizen_id) DO UPDATE SET
        full_name = excluded.full_name,
        date_of_birth = excluded.date_of_birth,
        gender = excluded.gender,
        license_number = excluded.license_number,
        license_classes_json = excluded.license_classes_json,
        conditions_json = excluded.conditions_json,
        mugshot_url = excluded.mugshot_url,
        status = excluded.status,
        expiry_at = excluded.expiry_at,
        issued_at = datetime('now'),
        updated_by_user_id = excluded.updated_by_user_id,
        updated_at = datetime('now')
    `).run(
      normalizedCitizenId,
      String(full_name || '').trim(),
      normalizedDob,
      String(gender || '').trim(),
      String(license_number || '').trim(),
      JSON.stringify(normalizedClasses),
      JSON.stringify(normalizedConditions),
      String(mugshot_url || '').trim(),
      normalizedStatus,
      normalizedExpiry || null,
      created_by_user_id || null,
      updated_by_user_id || null
    );

    return this.findByCitizenId(normalizedCitizenId);
  },
  update(id, fields = {}) {
    const updates = [];
    const values = [];

    if (fields.full_name !== undefined) {
      updates.push('full_name = ?');
      values.push(String(fields.full_name || '').trim());
    }
    if (fields.date_of_birth !== undefined) {
      updates.push('date_of_birth = ?');
      values.push(normalizeDateOnly(fields.date_of_birth));
    }
    if (fields.gender !== undefined) {
      updates.push('gender = ?');
      values.push(String(fields.gender || '').trim());
    }
    if (fields.license_number !== undefined) {
      updates.push('license_number = ?');
      values.push(String(fields.license_number || '').trim());
    }
    if (fields.license_classes !== undefined || fields.license_classes_json !== undefined) {
      updates.push('license_classes_json = ?');
      values.push(JSON.stringify(normalizeStringArray(
        fields.license_classes !== undefined ? fields.license_classes : fields.license_classes_json,
        { uppercase: true, maxLength: 10 }
      )));
    }
    if (fields.conditions !== undefined || fields.conditions_json !== undefined) {
      updates.push('conditions_json = ?');
      values.push(JSON.stringify(normalizeStringArray(
        fields.conditions !== undefined ? fields.conditions : fields.conditions_json,
        { uppercase: false, maxLength: 80 }
      )));
    }
    if (fields.mugshot_url !== undefined) {
      updates.push('mugshot_url = ?');
      values.push(String(fields.mugshot_url || '').trim());
    }
    if (fields.status !== undefined) {
      updates.push('status = ?');
      values.push(normalizeStatus(fields.status, DRIVER_LICENSE_STATUSES, 'valid'));
    }
    if (fields.expiry_at !== undefined) {
      const normalizedExpiry = normalizeDateOnly(fields.expiry_at);
      updates.push('expiry_at = ?');
      values.push(normalizedExpiry || null);
    }
    if (fields.updated_by_user_id !== undefined) {
      updates.push('updated_by_user_id = ?');
      values.push(fields.updated_by_user_id || null);
    }

    if (updates.length === 0) return this.findById(id);
    updates.push("updated_at = datetime('now')");
    values.push(id);
    db.prepare(`UPDATE driver_licenses SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    return this.findById(id);
  },
  markExpiredDue() {
    const info = db.prepare(`
      UPDATE driver_licenses
      SET status = 'expired', updated_at = datetime('now')
      WHERE status != 'expired'
        AND expiry_at IS NOT NULL
        AND trim(expiry_at) != ''
        AND date(expiry_at) < date('now')
    `).run();
    return Number(info?.changes || 0);
  },
  clearAll() {
    const info = db.prepare('DELETE FROM driver_licenses').run();
    return Number(info?.changes || 0);
  },
};

// --- Vehicle Registrations ---
const VehicleRegistrations = {
  findById(id) {
    return hydrateVehicleRegistrationRow(db.prepare('SELECT * FROM vehicle_registrations WHERE id = ?').get(id));
  },
  findByPlate(plate) {
    const normalized = normalizePlateKey(plate);
    if (!normalized) return null;
    return hydrateVehicleRegistrationRow(
      db.prepare('SELECT * FROM vehicle_registrations WHERE plate_normalized = ?').get(normalized)
    );
  },
  listByCitizenId(citizenId) {
    const normalized = String(citizenId || '').trim();
    if (!normalized) return [];
    return db.prepare(`
      SELECT * FROM vehicle_registrations
      WHERE lower(citizen_id) = lower(?)
      ORDER BY updated_at DESC
    `).all(normalized).map(hydrateVehicleRegistrationRow);
  },
  search(query, limit = 50) {
    const text = String(query || '').trim().toLowerCase();
    if (!text) return [];
    const tokens = Array.from(new Set(text.split(/\s+/).filter(Boolean))).slice(0, 6);
    if (tokens.length === 0) return [];
    const safeLimit = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const tokenClauses = [];
    const params = [];

    for (const token of tokens) {
      const q = `%${token}%`;
      const normalizedToken = normalizePlateKey(token);
      const qNormalized = normalizedToken ? `%${normalizedToken}%` : q;

      tokenClauses.push(`(
        lower(plate) LIKE ?
        OR lower(owner_name) LIKE ?
        OR lower(vehicle_model) LIKE ?
        OR lower(citizen_id) LIKE ?
        OR plate_normalized LIKE ?
      )`);

      params.push(q, q, q, q, qNormalized);
    }

    return db.prepare(`
      SELECT * FROM vehicle_registrations
      WHERE ${tokenClauses.join(' AND ')}
      ORDER BY updated_at DESC
      LIMIT ?
    `).all(...params, safeLimit).map(hydrateVehicleRegistrationRow);
  },
  upsertByPlate({
    plate,
    citizen_id,
    owner_name,
    vehicle_model,
    vehicle_colour,
    status,
    expiry_at,
    duration_days,
    created_by_user_id,
    updated_by_user_id,
  }) {
    const normalizedPlate = normalizePlateKey(plate);
    if (!normalizedPlate) {
      throw new Error('plate is required');
    }

    const normalizedStatus = normalizeStatus(status, VEHICLE_REGISTRATION_STATUSES, 'valid');
    const normalizedExpiry = normalizeDateOnly(expiry_at);
    const normalizedDurationDays = Number.isFinite(Number(duration_days))
      ? Math.max(1, Math.trunc(Number(duration_days)))
      : 365;

    db.prepare(`
      INSERT INTO vehicle_registrations (
        plate, plate_normalized, citizen_id, owner_name, vehicle_model, vehicle_colour, status,
        expiry_at, duration_days, created_by_user_id, updated_by_user_id,
        issued_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))
      ON CONFLICT(plate_normalized) DO UPDATE SET
        plate = excluded.plate,
        citizen_id = excluded.citizen_id,
        owner_name = excluded.owner_name,
        vehicle_model = excluded.vehicle_model,
        vehicle_colour = excluded.vehicle_colour,
        status = excluded.status,
        expiry_at = excluded.expiry_at,
        duration_days = excluded.duration_days,
        issued_at = datetime('now'),
        updated_by_user_id = excluded.updated_by_user_id,
        updated_at = datetime('now')
    `).run(
      String(plate || '').trim(),
      normalizedPlate,
      String(citizen_id || '').trim(),
      String(owner_name || '').trim(),
      String(vehicle_model || '').trim(),
      String(vehicle_colour || '').trim(),
      normalizedStatus,
      normalizedExpiry || null,
      normalizedDurationDays,
      created_by_user_id || null,
      updated_by_user_id || null
    );

    return this.findByPlate(normalizedPlate);
  },
  update(id, fields = {}) {
    const updates = [];
    const values = [];

    if (fields.plate !== undefined) {
      updates.push('plate = ?');
      values.push(String(fields.plate || '').trim());
      updates.push('plate_normalized = ?');
      values.push(normalizePlateKey(fields.plate));
    }
    if (fields.citizen_id !== undefined) {
      updates.push('citizen_id = ?');
      values.push(String(fields.citizen_id || '').trim());
    }
    if (fields.owner_name !== undefined) {
      updates.push('owner_name = ?');
      values.push(String(fields.owner_name || '').trim());
    }
    if (fields.vehicle_model !== undefined) {
      updates.push('vehicle_model = ?');
      values.push(String(fields.vehicle_model || '').trim());
    }
    if (fields.vehicle_colour !== undefined) {
      updates.push('vehicle_colour = ?');
      values.push(String(fields.vehicle_colour || '').trim());
    }
    if (fields.status !== undefined) {
      updates.push('status = ?');
      values.push(normalizeStatus(fields.status, VEHICLE_REGISTRATION_STATUSES, 'valid'));
    }
    if (fields.expiry_at !== undefined) {
      const normalizedExpiry = normalizeDateOnly(fields.expiry_at);
      updates.push('expiry_at = ?');
      values.push(normalizedExpiry || null);
    }
    if (fields.duration_days !== undefined) {
      const normalizedDurationDays = Number.isFinite(Number(fields.duration_days))
        ? Math.max(1, Math.trunc(Number(fields.duration_days)))
        : 365;
      updates.push('duration_days = ?');
      values.push(normalizedDurationDays);
    }
    if (fields.updated_by_user_id !== undefined) {
      updates.push('updated_by_user_id = ?');
      values.push(fields.updated_by_user_id || null);
    }

    if (updates.length === 0) return this.findById(id);
    updates.push("updated_at = datetime('now')");
    values.push(id);
    db.prepare(`UPDATE vehicle_registrations SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    return this.findById(id);
  },
  markExpiredDue() {
    const info = db.prepare(`
      UPDATE vehicle_registrations
      SET status = 'expired', updated_at = datetime('now')
      WHERE status != 'expired'
        AND expiry_at IS NOT NULL
        AND trim(expiry_at) != ''
        AND date(expiry_at) < date('now')
    `).run();
    return Number(info?.changes || 0);
  },
  clearAll() {
    const info = db.prepare('DELETE FROM vehicle_registrations').run();
    return Number(info?.changes || 0);
  },
};

// --- FiveM player links ---
const FiveMPlayerLinks = {
  upsert({ steam_id, game_id, citizen_id, player_name, position_x, position_y, position_z, heading, speed }) {
    db.prepare(`
      INSERT INTO fivem_player_links (
        steam_id, game_id, citizen_id, player_name, position_x, position_y, position_z, heading, speed, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(steam_id) DO UPDATE SET
        game_id = excluded.game_id,
        citizen_id = excluded.citizen_id,
        player_name = excluded.player_name,
        position_x = excluded.position_x,
        position_y = excluded.position_y,
        position_z = excluded.position_z,
        heading = excluded.heading,
        speed = excluded.speed,
        updated_at = datetime('now')
    `).run(
      steam_id,
      game_id || '',
      citizen_id || '',
      player_name || '',
      Number(position_x || 0),
      Number(position_y || 0),
      Number(position_z || 0),
      Number(heading || 0),
      Number(speed || 0)
    );
    return this.findBySteamId(steam_id);
  },
  removeBySteamId(steamId) {
    db.prepare('DELETE FROM fivem_player_links WHERE steam_id = ?').run(steamId);
  },
  findBySteamId(steamId) {
    return db.prepare('SELECT * FROM fivem_player_links WHERE steam_id = ?').get(steamId);
  },
  findByCitizenId(citizenId) {
    return db.prepare('SELECT * FROM fivem_player_links WHERE lower(citizen_id) = lower(?)').get(String(citizenId || '').trim());
  },
  list() {
    return db.prepare('SELECT * FROM fivem_player_links ORDER BY updated_at DESC').all();
  },
};

// --- FiveM fine jobs ---
const FiveMFineJobs = {
  create({ citizen_id, amount, reason, issued_by_user_id, source_record_id }) {
    const info = db.prepare(`
      INSERT INTO fivem_fine_jobs (
        citizen_id, amount, reason, issued_by_user_id, source_record_id, status, error, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'pending', '', datetime('now'), datetime('now'))
    `).run(citizen_id, Number(amount || 0), reason || '', issued_by_user_id || null, source_record_id || null);
    return this.findById(info.lastInsertRowid);
  },
  findById(id) {
    return db.prepare('SELECT * FROM fivem_fine_jobs WHERE id = ?').get(id);
  },
  listPending(limit = 25) {
    return db.prepare(`
      SELECT * FROM fivem_fine_jobs
      WHERE status = 'pending'
      ORDER BY created_at ASC
      LIMIT ?
    `).all(limit);
  },
  markSent(id) {
    db.prepare(`
      UPDATE fivem_fine_jobs
      SET status = 'sent', error = '', sent_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).run(id);
  },
  markFailed(id, error) {
    db.prepare(`
      UPDATE fivem_fine_jobs
      SET status = 'failed', error = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(String(error || '').slice(0, 500), id);
  },
  markPending(id) {
    db.prepare(`
      UPDATE fivem_fine_jobs
      SET status = 'pending', error = '', updated_at = datetime('now')
      WHERE id = ?
    `).run(id);
  },
  markCancelled(id, error = 'Cancelled by admin') {
    db.prepare(`
      UPDATE fivem_fine_jobs
      SET
        status = CASE WHEN status = 'pending' OR status = 'failed' THEN 'cancelled' ELSE status END,
        error = CASE
          WHEN status = 'pending' OR status = 'failed' THEN ?
          ELSE error
        END,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(String(error || 'Cancelled by admin').slice(0, 500), id);
  },
  cancelPendingTestJobs(error = 'Cleared queued test fine jobs') {
    const info = db.prepare(`
      UPDATE fivem_fine_jobs
      SET status = 'cancelled', error = ?, updated_at = datetime('now')
      WHERE source_record_id IS NULL AND status = 'pending'
    `).run(String(error || 'Cleared queued test fine jobs').slice(0, 500));
    return info.changes || 0;
  },
  updatePendingBySourceRecordId(sourceRecordId, { amount, reason }) {
    db.prepare(`
      UPDATE fivem_fine_jobs
      SET amount = ?, reason = ?, updated_at = datetime('now')
      WHERE source_record_id = ? AND status = 'pending'
    `).run(Number(amount || 0), String(reason || ''), sourceRecordId);
  },
  detachSourceRecord(sourceRecordId, errorMessage = 'Source record deleted') {
    const info = db.prepare(`
      UPDATE fivem_fine_jobs
      SET
        status = CASE WHEN status = 'pending' THEN 'cancelled' ELSE status END,
        error = CASE
          WHEN status = 'pending' AND (error IS NULL OR error = '') THEN ?
          ELSE error
        END,
        source_record_id = NULL,
        updated_at = datetime('now')
      WHERE source_record_id = ?
    `).run(String(errorMessage || 'Source record deleted'), sourceRecordId);
    return info.changes || 0;
  },
  listRecent(limit = 100) {
    return db.prepare('SELECT * FROM fivem_fine_jobs ORDER BY created_at DESC LIMIT ?').all(limit);
  },
};

// --- FiveM jail jobs ---
const FiveMJailJobs = {
  create({ citizen_id, jail_minutes, reason, issued_by_user_id, source_record_id }) {
    const info = db.prepare(`
      INSERT INTO fivem_jail_jobs (
        citizen_id, jail_minutes, reason, issued_by_user_id, source_record_id, status, error, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'pending', '', datetime('now'), datetime('now'))
    `).run(
      String(citizen_id || '').trim(),
      Math.max(0, Math.trunc(Number(jail_minutes || 0))),
      String(reason || '').trim(),
      issued_by_user_id || null,
      source_record_id || null
    );
    return this.findById(info.lastInsertRowid);
  },
  findById(id) {
    return db.prepare('SELECT * FROM fivem_jail_jobs WHERE id = ?').get(id);
  },
  listPending(limit = 25) {
    return db.prepare(`
      SELECT * FROM fivem_jail_jobs
      WHERE status = 'pending'
      ORDER BY created_at ASC
      LIMIT ?
    `).all(limit);
  },
  findPendingBySourceRecordId(sourceRecordId) {
    return db.prepare(`
      SELECT * FROM fivem_jail_jobs
      WHERE source_record_id = ? AND status = 'pending'
      ORDER BY created_at DESC
      LIMIT 1
    `).get(sourceRecordId);
  },
  upsertPendingBySourceRecordId(sourceRecordId, { citizen_id, jail_minutes, reason, issued_by_user_id }) {
    const pending = this.findPendingBySourceRecordId(sourceRecordId);
    if (pending) {
      db.prepare(`
        UPDATE fivem_jail_jobs
        SET citizen_id = ?, jail_minutes = ?, reason = ?, issued_by_user_id = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(
        String(citizen_id || pending.citizen_id || '').trim(),
        Math.max(0, Math.trunc(Number(jail_minutes || 0))),
        String(reason || ''),
        issued_by_user_id || null,
        pending.id
      );
      return this.findById(pending.id);
    }
    return this.create({
      citizen_id,
      jail_minutes,
      reason,
      issued_by_user_id,
      source_record_id: sourceRecordId,
    });
  },
  markSent(id) {
    db.prepare(`
      UPDATE fivem_jail_jobs
      SET status = 'sent', error = '', sent_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).run(id);
  },
  markFailed(id, error) {
    db.prepare(`
      UPDATE fivem_jail_jobs
      SET status = 'failed', error = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(String(error || '').slice(0, 500), id);
  },
  markPending(id) {
    db.prepare(`
      UPDATE fivem_jail_jobs
      SET status = 'pending', error = '', updated_at = datetime('now')
      WHERE id = ?
    `).run(id);
  },
  markCancelled(id, error = 'Cancelled by admin') {
    db.prepare(`
      UPDATE fivem_jail_jobs
      SET
        status = CASE WHEN status = 'pending' OR status = 'failed' THEN 'cancelled' ELSE status END,
        error = CASE
          WHEN status = 'pending' OR status = 'failed' THEN ?
          ELSE error
        END,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(String(error || 'Cancelled by admin').slice(0, 500), id);
  },
  cancelPendingTestJobs(error = 'Cleared queued test jail jobs') {
    const info = db.prepare(`
      UPDATE fivem_jail_jobs
      SET status = 'cancelled', error = ?, updated_at = datetime('now')
      WHERE source_record_id IS NULL AND status = 'pending'
    `).run(String(error || 'Cleared queued test jail jobs').slice(0, 500));
    return info.changes || 0;
  },
  updatePendingBySourceRecordId(sourceRecordId, { jail_minutes, reason }) {
    db.prepare(`
      UPDATE fivem_jail_jobs
      SET jail_minutes = ?, reason = ?, updated_at = datetime('now')
      WHERE source_record_id = ? AND status = 'pending'
    `).run(
      Math.max(0, Math.trunc(Number(jail_minutes || 0))),
      String(reason || ''),
      sourceRecordId
    );
  },
  detachSourceRecord(sourceRecordId, errorMessage = 'Source record deleted') {
    const info = db.prepare(`
      UPDATE fivem_jail_jobs
      SET
        status = CASE WHEN status = 'pending' THEN 'cancelled' ELSE status END,
        error = CASE
          WHEN status = 'pending' AND (error IS NULL OR error = '') THEN ?
          ELSE error
        END,
        source_record_id = NULL,
        updated_at = datetime('now')
      WHERE source_record_id = ?
    `).run(String(errorMessage || 'Source record deleted'), sourceRecordId);
    return info.changes || 0;
  },
  listRecent(limit = 100) {
    return db.prepare('SELECT * FROM fivem_jail_jobs ORDER BY created_at DESC LIMIT ?').all(limit);
  },
};

// --- FiveM job sync jobs ---
const FiveMJobSyncJobs = {
  createOrReplacePending({
    user_id,
    steam_id,
    discord_id,
    citizen_id,
    job_name,
    job_grade,
    source_type,
    source_id,
  }) {
    const normalizedJobName = String(job_name || '').trim();
    const normalizedSourceType = ['department', 'sub_department', 'fallback', 'none'].includes(String(source_type || '').trim())
      ? String(source_type || '').trim()
      : 'none';
    const normalizedGradeRaw = Number(job_grade);
    const normalizedGrade = Number.isFinite(normalizedGradeRaw) ? Math.max(0, Math.trunc(normalizedGradeRaw)) : 0;
    const normalizedSourceId = source_id ? Number(source_id) : null;

    const tx = db.transaction(() => {
      const pending = db.prepare(`
        SELECT id FROM fivem_job_sync_jobs
        WHERE user_id = ? AND status = 'pending'
        ORDER BY created_at DESC
        LIMIT 1
      `).get(user_id);

      if (pending) {
        db.prepare(`
          UPDATE fivem_job_sync_jobs
          SET
            steam_id = ?,
            discord_id = ?,
            citizen_id = ?,
            job_name = ?,
            job_grade = ?,
            source_type = ?,
            source_id = ?,
            error = '',
            updated_at = datetime('now')
          WHERE id = ?
        `).run(
          String(steam_id || '').trim(),
          String(discord_id || '').trim(),
          String(citizen_id || '').trim(),
          normalizedJobName,
          normalizedGrade,
          normalizedSourceType,
          normalizedSourceId,
          pending.id
        );
        return this.findById(pending.id);
      }

      const info = db.prepare(`
        INSERT INTO fivem_job_sync_jobs (
          user_id, steam_id, discord_id, citizen_id, job_name, job_grade, source_type, source_id,
          status, error, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', '', datetime('now'), datetime('now'))
      `).run(
        user_id,
        String(steam_id || '').trim(),
        String(discord_id || '').trim(),
        String(citizen_id || '').trim(),
        normalizedJobName,
        normalizedGrade,
        normalizedSourceType,
        normalizedSourceId
      );
      return this.findById(info.lastInsertRowid);
    });

    return tx();
  },
  findById(id) {
    return db.prepare('SELECT * FROM fivem_job_sync_jobs WHERE id = ?').get(id);
  },
  findLatestByUserId(userId) {
    return db.prepare(`
      SELECT * FROM fivem_job_sync_jobs
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(userId);
  },
  listDistinctCitizenIdsByUserId(userId, limit = 50) {
    const parsedUserId = Number(userId);
    const parsedLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.trunc(Number(limit))) : 50;
    if (!Number.isInteger(parsedUserId) || parsedUserId <= 0) return [];
    return db.prepare(`
      SELECT
        MIN(citizen_id) AS citizen_id,
        MAX(created_at) AS last_seen_at
      FROM fivem_job_sync_jobs
      WHERE user_id = ?
        AND TRIM(COALESCE(citizen_id, '')) <> ''
      GROUP BY lower(citizen_id)
      ORDER BY last_seen_at DESC
      LIMIT ?
    `).all(parsedUserId, parsedLimit);
  },
  listPending(limit = 25) {
    return db.prepare(`
      SELECT * FROM fivem_job_sync_jobs
      WHERE status = 'pending'
      ORDER BY created_at ASC
      LIMIT ?
    `).all(limit);
  },
  markSent(id) {
    db.prepare(`
      UPDATE fivem_job_sync_jobs
      SET status = 'sent', error = '', sent_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).run(id);
  },
  markFailed(id, error) {
    db.prepare(`
      UPDATE fivem_job_sync_jobs
      SET status = 'failed', error = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(String(error || '').slice(0, 500), id);
  },
  markPending(id) {
    db.prepare(`
      UPDATE fivem_job_sync_jobs
      SET status = 'pending', error = '', updated_at = datetime('now')
      WHERE id = ?
    `).run(id);
  },
  listRecent(limit = 100) {
    return db.prepare('SELECT * FROM fivem_job_sync_jobs ORDER BY created_at DESC LIMIT ?').all(limit);
  },
};

// --- Settings ---
const Settings = {
  get(key) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : null;
  },
  set(key, value) {
    db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?'
    ).run(key, value, value);
  },
  getAll() {
    return db.prepare('SELECT * FROM settings').all().reduce((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {});
  },
};

// --- Audit Log ---
const AuditLog = {
  add({ user_id, action, details }) {
    db.prepare(
      'INSERT INTO audit_log (user_id, action, details) VALUES (?, ?, ?)'
    ).run(user_id || null, action, typeof details === 'object' ? JSON.stringify(details) : (details || ''));
  },
  countByUserActionsSince(userId, { since = null, actions = [] } = {}) {
    const parsedUserId = Number(userId);
    if (!Number.isInteger(parsedUserId) || parsedUserId <= 0) return {};
    const normalizedActions = Array.isArray(actions)
      ? Array.from(new Set(
        actions
          .map((action) => String(action || '').trim())
          .filter(Boolean)
      ))
      : [];
    if (normalizedActions.length === 0) return {};

    const params = [parsedUserId];
    let sinceFilter = '';
    const normalizedSince = String(since || '').trim();
    if (normalizedSince) {
      sinceFilter = 'AND created_at >= ?';
      params.push(normalizedSince);
    }

    const placeholders = normalizedActions.map(() => '?').join(', ');
    params.push(...normalizedActions);
    const rows = db.prepare(`
      SELECT action, COUNT(*) AS count
      FROM audit_log
      WHERE user_id = ? ${sinceFilter}
        AND action IN (${placeholders})
      GROUP BY action
    `).all(...params);

    return rows.reduce((acc, row) => {
      const key = String(row?.action || '').trim();
      if (!key) return acc;
      acc[key] = Number(row?.count || 0);
      return acc;
    }, {});
  },
  list(limit = 100, offset = 0) {
    return db.prepare(`
      SELECT al.*, us.steam_name as user_name
      FROM audit_log al
      LEFT JOIN users us ON us.id = al.user_id
      ORDER BY al.created_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);
  },
};

// --- Announcements ---
const Announcements = {
  listActive() {
    return db.prepare(`
      SELECT a.*, us.steam_name as creator_name
      FROM announcements a
      LEFT JOIN users us ON us.id = a.created_by
      WHERE a.expires_at IS NULL OR a.expires_at > datetime('now')
      ORDER BY a.created_at DESC
    `).all();
  },
  list() {
    return db.prepare(`
      SELECT a.*, us.steam_name as creator_name
      FROM announcements a
      LEFT JOIN users us ON us.id = a.created_by
      ORDER BY a.created_at DESC
    `).all();
  },
  create({ title, content, created_by, expires_at }) {
    const info = db.prepare(
      'INSERT INTO announcements (title, content, created_by, expires_at) VALUES (?, ?, ?, ?)'
    ).run(title, content || '', created_by, expires_at || null);
    return db.prepare('SELECT * FROM announcements WHERE id = ?').get(info.lastInsertRowid);
  },
  delete(id) {
    db.prepare('DELETE FROM announcements WHERE id = ?').run(id);
  },
};

// --- Field Mapping Categories ---
const FieldMappingCategories = {
  list(entityType = 'person') {
    return db.prepare(
      'SELECT * FROM field_mapping_categories WHERE entity_type = ? ORDER BY sort_order ASC, id ASC'
    ).all(entityType);
  },
  findById(id) {
    return db.prepare('SELECT * FROM field_mapping_categories WHERE id = ?').get(id);
  },
  create({ name, entity_type = 'person', sort_order = 0 }) {
    const info = db.prepare(
      'INSERT INTO field_mapping_categories (name, entity_type, sort_order) VALUES (?, ?, ?)'
    ).run(name, entity_type, sort_order);
    return this.findById(info.lastInsertRowid);
  },
  update(id, { name, sort_order }) {
    const updates = [];
    const values = [];
    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (sort_order !== undefined) { updates.push('sort_order = ?'); values.push(sort_order); }
    if (updates.length === 0) return;
    values.push(id);
    db.prepare(`UPDATE field_mapping_categories SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  },
  delete(id) {
    db.prepare('DELETE FROM field_mapping_categories WHERE id = ?').run(id);
  },
};

// --- Field Mappings ---
const FieldMappings = {
  listByCategory(categoryId) {
    return db.prepare(
      'SELECT * FROM field_mappings WHERE category_id = ? ORDER BY sort_order ASC, id ASC'
    ).all(categoryId);
  },
  listAll(entityType = 'person') {
    return db.prepare(`
      SELECT fm.*, fmc.name as category_name, fmc.sort_order as category_sort_order
      FROM field_mappings fm
      JOIN field_mapping_categories fmc ON fmc.id = fm.category_id
      WHERE fmc.entity_type = ?
      ORDER BY fmc.sort_order ASC, fmc.id ASC, fm.sort_order ASC, fm.id ASC
    `).all(entityType);
  },
  findById(id) {
    return db.prepare('SELECT * FROM field_mappings WHERE id = ?').get(id);
  },
  create({
    category_id,
    label,
    table_name,
    column_name,
    is_json = 0,
    json_key = '',
    character_join_column = '',
    sort_order = 0,
    is_search_column = 0,
    field_key = '',
    field_type = 'text',
    preview_width = 1,
    friendly_values_json = '',
  }) {
    const info = db.prepare(`
      INSERT INTO field_mappings
        (
          category_id, label, table_name, column_name, is_json, json_key,
          character_join_column, sort_order, is_search_column, field_key, field_type, preview_width, friendly_values_json
        )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      category_id,
      label,
      table_name,
      column_name,
      is_json ? 1 : 0,
      json_key,
      character_join_column,
      sort_order,
      is_search_column ? 1 : 0,
      field_key,
      field_type,
      preview_width,
      String(friendly_values_json || '').trim()
    );
    return this.findById(info.lastInsertRowid);
  },
  update(id, fields) {
    const allowed = [
      'category_id',
      'label',
      'table_name',
      'column_name',
      'is_json',
      'json_key',
      'character_join_column',
      'sort_order',
      'is_search_column',
      'field_key',
      'field_type',
      'preview_width',
      'friendly_values_json',
    ];
    const updates = [];
    const values = [];
    for (const key of allowed) {
      if (fields[key] !== undefined) {
        updates.push(`${key} = ?`);
        let val = fields[key];
        if (key === 'is_json' || key === 'is_search_column') val = val ? 1 : 0;
        if (key === 'category_id') val = Number(val) || 0;
        if (key === 'preview_width') {
          const parsed = Number(val);
          val = Number.isFinite(parsed) ? Math.max(1, Math.trunc(parsed)) : 1;
        }
        values.push(val);
      }
    }
    if (updates.length === 0) return;
    values.push(id);
    db.prepare(`UPDATE field_mappings SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  },
  delete(id) {
    db.prepare('DELETE FROM field_mappings WHERE id = ?').run(id);
  },
};

module.exports = {
  initDb,
  getDb: () => db,
  Users,
  UserCitizenLinks,
  Departments,
  UserDepartments,
  SubDepartments,
  UserSubDepartments,
  DiscordRoleMappings,
  Units,
  Calls,
  PursuitOutcomes,
  TrafficStops,
  EvidenceItems,
  ShiftNotes,
  Bolos,
  Warrants,
  WarrantCommunityMessages,
  OffenceCatalog,
  CriminalRecords,
  PatientAnalyses,
  DriverLicenses,
  VehicleRegistrations,
  FiveMPlayerLinks,
  FiveMFineJobs,
  FiveMJailJobs,
  FiveMJobSyncJobs,
  Settings,
  AuditLog,
  Announcements,
  FieldMappingCategories,
  FieldMappings,
};
