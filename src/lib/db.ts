import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS staff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  can_drive INTEGER NOT NULL DEFAULT 1,
  can_seitai INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('pickup','dropoff')),
  slot INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  care_level TEXT NOT NULL DEFAULT '',
  area TEXT NOT NULL DEFAULT '',
  needs_seitai INTEGER NOT NULL DEFAULT 0,
  pickup_course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL,
  dropoff_course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL,
  default_weekdays TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  note TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE,
  memo TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS schedule_staff (
  schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  PRIMARY KEY (schedule_id, staff_id)
);
CREATE TABLE IF NOT EXISTS schedule_courses (
  schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  PRIMARY KEY (schedule_id, course_id)
);
CREATE TABLE IF NOT EXISTS schedule_clients (
  schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present','absent')),
  pickup_course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL,
  dropoff_course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL,
  seitai INTEGER NOT NULL DEFAULT 0,
  seitai_staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  note TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (schedule_id, client_id)
);
CREATE TABLE IF NOT EXISTS monthly_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  ym TEXT NOT NULL,
  keywords TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (client_id, ym)
);
CREATE INDEX IF NOT EXISTS idx_schedules_date ON schedules(date);
`;

declare global {
  var __eastOneDb: Database.Database | undefined;
}

export function getDb(): Database.Database {
  if (globalThis.__eastOneDb) return globalThis.__eastOneDb;
  const file = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "east-one.db");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  globalThis.__eastOneDb = db;
  return db;
}
