import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

/** スキーマのバージョン。構造を変えたら上げて MIGRATIONS に追記する。 */
const SCHEMA_VERSION = 3;

const SCHEMA_V2 = `
CREATE TABLE stores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  contact_name TEXT NOT NULL DEFAULT '',
  capacity_am INTEGER NOT NULL DEFAULT 18,
  capacity_pm INTEGER NOT NULL DEFAULT 18,
  required_staff REAL NOT NULL DEFAULT 5,
  min_nurse INTEGER NOT NULL DEFAULT 1,
  min_trainer INTEGER NOT NULL DEFAULT 1,
  closed_weekdays TEXT NOT NULL DEFAULT '0',
  am_slots TEXT NOT NULL DEFAULT '9:45,10:00,10:10,10:25,10:35,10:50',
  pm_slots TEXT NOT NULL DEFAULT '14:05,14:20,14:45,14:55,15:10,15:20',
  slot_capacity INTEGER NOT NULL DEFAULT 5,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE staff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT '在籍',
  employment TEXT NOT NULL DEFAULT 'A',
  role TEXT NOT NULL DEFAULT '',
  skills TEXT NOT NULL DEFAULT '',
  days_per_week INTEGER NOT NULL DEFAULT 5,
  available_weekdays TEXT NOT NULL DEFAULT '1,2,3,4,5,6',
  note TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE staff_stores (
  staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  PRIMARY KEY (staff_id, store_id)
);

CREATE TABLE care_managers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  office TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  fax TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT ''
);

CREATE TABLE vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 4,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE vehicle_drivers (
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  PRIMARY KEY (vehicle_id, staff_id)
);

CREATE TABLE routes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
  morning_time TEXT NOT NULL DEFAULT '8:10',
  noon_time TEXT NOT NULL DEFAULT '11:00',
  evening_time TEXT NOT NULL DEFAULT '15:30',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kana TEXT NOT NULL DEFAULT '',
  care_level TEXT NOT NULL DEFAULT '',
  gender TEXT NOT NULL DEFAULT '',
  birth_date TEXT NOT NULL DEFAULT '',
  age INTEGER,
  care_manager_id INTEGER REFERENCES care_managers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT '利用中',
  new_flag TEXT NOT NULL DEFAULT '',
  start_date TEXT NOT NULL DEFAULT '',
  route_id INTEGER REFERENCES routes(id) ON DELETE SET NULL,
  route_order INTEGER NOT NULL DEFAULT 0,
  uses_transport INTEGER NOT NULL DEFAULT 1,
  needs_training INTEGER NOT NULL DEFAULT 1,
  address TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT ''
);

CREATE TABLE client_slots (
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  session TEXT NOT NULL CHECK (session IN ('am','pm')),
  PRIMARY KEY (client_id, weekday, session)
);

CREATE TABLE shift_requests (
  staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  code TEXT NOT NULL,
  PRIMARY KEY (staff_id, date)
);

CREATE TABLE shifts (
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  code TEXT NOT NULL,
  PRIMARY KEY (store_id, staff_id, date)
);
CREATE INDEX idx_shifts_date ON shifts(date);

CREATE TABLE daily (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  memo TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (store_id, date)
);

CREATE TABLE daily_attendance (
  daily_id INTEGER NOT NULL REFERENCES daily(id) ON DELETE CASCADE,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  session TEXT NOT NULL CHECK (session IN ('am','pm')),
  status TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present','absent')),
  reason TEXT NOT NULL DEFAULT '',
  extra INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (daily_id, client_id, session)
);

CREATE TABLE daily_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  daily_id INTEGER NOT NULL REFERENCES daily(id) ON DELETE CASCADE,
  run TEXT NOT NULL CHECK (run IN ('morning','noon','evening')),
  vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
  driver_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  escort_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  depart_time TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE daily_run_riders (
  run_id INTEGER NOT NULL REFERENCES daily_runs(id) ON DELETE CASCADE,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('pickup','dropoff')),
  seq INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (run_id, client_id, direction)
);

CREATE TABLE daily_training (
  daily_id INTEGER NOT NULL REFERENCES daily(id) ON DELETE CASCADE,
  session TEXT NOT NULL CHECK (session IN ('am','pm')),
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  slot_time TEXT NOT NULL DEFAULT '',
  staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  PRIMARY KEY (daily_id, session, client_id)
);

CREATE TABLE monthly_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  ym TEXT NOT NULL,
  keywords TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (client_id, ym)
);
`;

/** 旧バージョン（v1: 単一店舗の試作版）のテーブル。試作データは本番で使われていないため破棄する。 */
const V1_TABLES = [
  "schedule_clients",
  "schedule_courses",
  "schedule_staff",
  "schedules",
  "monthly_reports",
  "clients",
  "courses",
  "staff",
];

/**
 * v3: 送迎を 朝迎車 / 昼送車 / 昼迎車 / 帰り送車 の 4 便に分ける。
 *     旧「昼送迎」は、お送り分を昼送車、お迎え分を昼迎車（同じ車両・運転者）に分割する。
 *     体操・メディカルケア・FIT の担当と、スタッフごとの担当業務を追加。
 */
function migrateV3(db: Database.Database) {
  db.exec(`
    ALTER TABLE routes ADD COLUMN noon_pick_time TEXT NOT NULL DEFAULT '13:20';
    CREATE TABLE daily_runs_v3 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      daily_id INTEGER NOT NULL REFERENCES daily(id) ON DELETE CASCADE,
      run TEXT NOT NULL CHECK (run IN ('morning','noon_drop','noon_pick','evening')),
      vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
      driver_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
      escort_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
      depart_time TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO daily_runs_v3 (id, daily_id, run, vehicle_id, driver_id, escort_id, depart_time, sort_order)
      SELECT id, daily_id, CASE run WHEN 'noon' THEN 'noon_drop' ELSE run END, vehicle_id, driver_id, escort_id, depart_time, sort_order FROM daily_runs;
    CREATE TABLE daily_run_riders_v3 (
      run_id INTEGER NOT NULL REFERENCES daily_runs_v3(id) ON DELETE CASCADE,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      direction TEXT NOT NULL CHECK (direction IN ('pickup','dropoff')),
      seq INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (run_id, client_id, direction)
    );
    INSERT INTO daily_run_riders_v3 SELECT * FROM daily_run_riders;
  `);
  const noonRuns = db.prepare(`SELECT * FROM daily_runs WHERE run = 'noon'`).all() as {
    id: number;
    daily_id: number;
    vehicle_id: number | null;
    driver_id: number | null;
    escort_id: number | null;
    sort_order: number;
  }[];
  const ins = db.prepare(
    `INSERT INTO daily_runs_v3 (daily_id, run, vehicle_id, driver_id, escort_id, depart_time, sort_order) VALUES (?, 'noon_pick', ?, ?, ?, '', ?)`,
  );
  const move = db.prepare(`UPDATE daily_run_riders_v3 SET run_id = ? WHERE run_id = ? AND direction = 'pickup'`);
  for (const r of noonRuns) {
    const newId = Number(ins.run(r.daily_id, r.vehicle_id, r.driver_id, r.escort_id, r.sort_order).lastInsertRowid);
    move.run(newId, r.id);
  }
  db.exec(`
    DROP TABLE daily_run_riders;
    DROP TABLE daily_runs;
    ALTER TABLE daily_runs_v3 RENAME TO daily_runs;
    ALTER TABLE daily_run_riders_v3 RENAME TO daily_run_riders;
    CREATE TABLE daily_duties (
      daily_id INTEGER NOT NULL REFERENCES daily(id) ON DELETE CASCADE,
      session TEXT NOT NULL CHECK (session IN ('am','pm')),
      duty TEXT NOT NULL,
      staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
      PRIMARY KEY (daily_id, session, duty)
    );
    CREATE TABLE daily_tasks (
      daily_id INTEGER NOT NULL REFERENCES daily(id) ON DELETE CASCADE,
      staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
      task TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (daily_id, staff_id)
    );
  `);
}

function migrate(db: Database.Database) {
  const version = db.pragma("user_version", { simple: true }) as number;
  if (version >= SCHEMA_VERSION) return;
  db.pragma("foreign_keys = OFF");
  db.transaction(() => {
    if (version < 2) {
      for (const t of V1_TABLES) db.exec(`DROP TABLE IF EXISTS ${t}`);
      db.exec(SCHEMA_V2);
    }
    if (version < 3) migrateV3(db);
    db.pragma(`user_version = ${SCHEMA_VERSION}`);
  })();
  db.pragma("foreign_keys = ON");
}

declare global {
  var __eastOneDb: Database.Database | undefined;
}

export function getDb(): Database.Database {
  if (globalThis.__eastOneDb) return globalThis.__eastOneDb;
  const file = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "east-one.db");
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  migrate(db);
  db.pragma("foreign_keys = ON");
  globalThis.__eastOneDb = db;
  return db;
}
