function tableExists(db, tableName) {
  try {
    const row = db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND lower(name) = lower(?)"
    ).get(tableName);
    return !!row;
  } catch {
    return false;
  }
}

function hasColumn(db, tableName, columnName) {
  try {
    const rows = db.prepare(`PRAGMA table_info(${tableName})`).all();
    return rows.some((row) =>
      String(row?.name || '').trim().toLowerCase() === String(columnName || '').trim().toLowerCase()
    );
  } catch {
    return false;
  }
}

exports.up = (db) => {
  if (!tableExists(db, 'incidents')) {
    db.exec(`
      CREATE TABLE incidents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        incident_number TEXT NOT NULL DEFAULT '',
        department_id INTEGER NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        summary TEXT NOT NULL DEFAULT '',
        location TEXT NOT NULL DEFAULT '',
        priority TEXT NOT NULL DEFAULT '2',
        status TEXT NOT NULL DEFAULT 'open',
        owner_user_id INTEGER,
        created_by_user_id INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }

  if (!hasColumn(db, 'incidents', 'incident_number')) {
    db.exec("ALTER TABLE incidents ADD COLUMN incident_number TEXT NOT NULL DEFAULT ''");
  }
  if (!hasColumn(db, 'incidents', 'summary')) {
    db.exec("ALTER TABLE incidents ADD COLUMN summary TEXT NOT NULL DEFAULT ''");
  }
  if (!hasColumn(db, 'incidents', 'location')) {
    db.exec("ALTER TABLE incidents ADD COLUMN location TEXT NOT NULL DEFAULT ''");
  }
  if (!hasColumn(db, 'incidents', 'priority')) {
    db.exec("ALTER TABLE incidents ADD COLUMN priority TEXT NOT NULL DEFAULT '2'");
  }
  if (!hasColumn(db, 'incidents', 'status')) {
    db.exec("ALTER TABLE incidents ADD COLUMN status TEXT NOT NULL DEFAULT 'open'");
  }
  if (!hasColumn(db, 'incidents', 'owner_user_id')) {
    db.exec("ALTER TABLE incidents ADD COLUMN owner_user_id INTEGER");
  }
  if (!hasColumn(db, 'incidents', 'created_by_user_id')) {
    db.exec("ALTER TABLE incidents ADD COLUMN created_by_user_id INTEGER");
  }
  if (!hasColumn(db, 'incidents', 'updated_at')) {
    db.exec("ALTER TABLE incidents ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'))");
  }

  if (!tableExists(db, 'incident_links')) {
    db.exec(`
      CREATE TABLE incident_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        incident_id INTEGER NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        created_by_user_id INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }

  if (!hasColumn(db, 'incident_links', 'updated_at')) {
    db.exec("ALTER TABLE incident_links ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'))");
  }

  db.exec('CREATE INDEX IF NOT EXISTS idx_incidents_department_id ON incidents(department_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_incidents_created_at ON incidents(created_at)');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_incidents_incident_number ON incidents(incident_number)');

  db.exec('CREATE INDEX IF NOT EXISTS idx_incident_links_incident_id ON incident_links(incident_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_incident_links_entity ON incident_links(entity_type, entity_id)');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_incident_links_unique ON incident_links(incident_id, entity_type, entity_id)');

  // Backfill incident numbers for any rows inserted before this migration completed.
  const rows = db.prepare("SELECT id FROM incidents WHERE COALESCE(incident_number, '') = ''").all();
  const updateStmt = db.prepare('UPDATE incidents SET incident_number = ?, updated_at = datetime(\'now\') WHERE id = ?');
  for (const row of rows) {
    const id = Number(row?.id || 0);
    if (!Number.isInteger(id) || id <= 0) continue;
    updateStmt.run(`INC-${String(id).padStart(6, '0')}`, id);
  }

  console.log('Migration 032 applied: added incidents and incident_links');
};
