exports.up = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS warrant_community_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      warrant_id INTEGER NOT NULL UNIQUE REFERENCES warrants(id) ON DELETE CASCADE,
      discord_message_id TEXT NOT NULL DEFAULT '',
      webhook_url TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'posted' CHECK(status IN ('posted', 'deleted', 'delete_failed')),
      last_error TEXT NOT NULL DEFAULT '',
      posted_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_warrant_community_messages_warrant ON warrant_community_messages(warrant_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_warrant_community_messages_status ON warrant_community_messages(status)');
};

