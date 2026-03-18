import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import os from 'os'

const DATA_DIR = path.join(os.homedir(), '.bugpack', 'data')
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads')

fs.mkdirSync(DATA_DIR, { recursive: true })
fs.mkdirSync(UPLOADS_DIR, { recursive: true })

const db = new Database(path.join(DATA_DIR, 'bugpack.db'))

db.pragma('journal_mode = WAL')

db.exec(`
  CREATE TABLE IF NOT EXISTS bugs (
    id TEXT PRIMARY KEY,
    number INTEGER UNIQUE NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    priority TEXT NOT NULL DEFAULT 'medium',
    page_path TEXT NOT NULL DEFAULT '',
    device TEXT NOT NULL DEFAULT '',
    browser TEXT NOT NULL DEFAULT '',
    related_files TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS screenshots (
    id TEXT PRIMARY KEY,
    bug_id TEXT NOT NULL REFERENCES bugs(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL DEFAULT '',
    annotated INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    annotations TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_screenshots_bug_id ON screenshots(bug_id);

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`)

// Migration: add project_id
try {
  db.exec(`ALTER TABLE bugs ADD COLUMN project_id TEXT NOT NULL DEFAULT 'default'`)
} catch {
  // Column already exists, ignore
}

// Migration: make number unique per project
try {
  const hasOldUnique = db.prepare(
    `SELECT sql FROM sqlite_master WHERE type='table' AND name='bugs'`
  ).get() as any
  if (hasOldUnique?.sql?.includes('number INTEGER UNIQUE')) {
    // Disable FK to prevent cascade on DROP
    db.pragma('foreign_keys = OFF')
    db.exec(`
      CREATE TABLE IF NOT EXISTS bugs_new (
        id TEXT PRIMARY KEY,
        number INTEGER NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending',
        priority TEXT NOT NULL DEFAULT 'medium',
        page_path TEXT NOT NULL DEFAULT '',
        device TEXT NOT NULL DEFAULT '',
        browser TEXT NOT NULL DEFAULT '',
        related_files TEXT NOT NULL DEFAULT '[]',
        project_id TEXT NOT NULL DEFAULT 'default',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO bugs_new SELECT id, number, title, description, status, priority, page_path, device, browser, related_files, project_id, created_at, updated_at FROM bugs;
      DROP TABLE bugs;
      ALTER TABLE bugs_new RENAME TO bugs;
    `)
    db.pragma('foreign_keys = ON')
  }
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_bugs_project_number ON bugs(project_id, number)`)
} catch {
  // Already migrated, ignore
}

// Migration: add annotated_filename
try {
  db.exec(`ALTER TABLE screenshots ADD COLUMN annotated_filename TEXT NOT NULL DEFAULT ''`)
} catch {
  // Column already exists, ignore
}


export { db, DATA_DIR, UPLOADS_DIR }
