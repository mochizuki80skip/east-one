import { getDb } from "./db";
import type {
  CareManager,
  Client,
  ClientSlot,
  DailyDetail,
  DailyRun,
  MonthlyReport,
  Route,
  Staff,
  Store,
  Vehicle,
} from "./types";
import { joinList, splitList, type Session } from "./constants";
import type { ImportedClient, ImportedStaff } from "./import";
import { normalizeName } from "./import";
import type { TransportHistory } from "./transport";
import type { TrainingHistory } from "./timetable";

const db = () => getDb();

// ---------------- 店舗 ----------------
export function listStores(): Store[] {
  return db().prepare(`SELECT * FROM stores ORDER BY sort_order, id`).all() as Store[];
}
export function getStore(id: number): Store | undefined {
  return db().prepare(`SELECT * FROM stores WHERE id = ?`).get(id) as Store | undefined;
}
export function saveStore(s: Omit<Store, "id"> & { id?: number }): number {
  const cols = [
    "name",
    "display_name",
    "phone",
    "contact_name",
    "capacity_am",
    "capacity_pm",
    "required_staff",
    "min_nurse",
    "min_trainer",
    "closed_weekdays",
    "am_slots",
    "pm_slots",
    "slot_capacity",
    "sort_order",
  ] as const;
  if (s.id) {
    db().prepare(`UPDATE stores SET ${cols.map((c) => `${c}=@${c}`).join(",")} WHERE id=@id`).run(s);
    return s.id;
  }
  const r = db().prepare(`INSERT INTO stores (${cols.join(",")}) VALUES (${cols.map((c) => `@${c}`).join(",")})`).run(s);
  return Number(r.lastInsertRowid);
}
export function deleteStore(id: number) {
  db().prepare(`DELETE FROM stores WHERE id = ?`).run(id);
}

// ---------------- スタッフ ----------------
const STAFF_SELECT = `SELECT s.*, COALESCE((SELECT group_concat(store_id) FROM staff_stores ss WHERE ss.staff_id = s.id), '') AS store_ids FROM staff s`;

export function listStaff(opts: { storeId?: number; activeOnly?: boolean } = {}): Staff[] {
  const where: string[] = [];
  const args: unknown[] = [];
  if (opts.storeId) {
    where.push(`EXISTS (SELECT 1 FROM staff_stores ss WHERE ss.staff_id = s.id AND ss.store_id = ?)`);
    args.push(opts.storeId);
  }
  if (opts.activeOnly) where.push(`s.status = '在籍'`);
  return db()
    .prepare(`${STAFF_SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY s.sort_order, s.id`)
    .all(...args) as Staff[];
}
export function getStaff(id: number): Staff | undefined {
  return db().prepare(`${STAFF_SELECT} WHERE s.id = ?`).get(id) as Staff | undefined;
}
export function saveStaff(s: Omit<Staff, "id" | "store_ids"> & { id?: number; storeIds: number[] }): number {
  const d = db();
  return d.transaction(() => {
    const cols = ["name", "status", "employment", "role", "skills", "days_per_week", "available_weekdays", "note", "sort_order"] as const;
    const row = Object.fromEntries(cols.map((c) => [c, s[c]]));
    let id = s.id;
    if (id) d.prepare(`UPDATE staff SET ${cols.map((c) => `${c}=@${c}`).join(",")} WHERE id=@id`).run({ ...row, id });
    else id = Number(d.prepare(`INSERT INTO staff (${cols.join(",")}) VALUES (${cols.map((c) => `@${c}`).join(",")})`).run(row).lastInsertRowid);
    d.prepare(`DELETE FROM staff_stores WHERE staff_id = ?`).run(id);
    const ins = d.prepare(`INSERT INTO staff_stores (staff_id, store_id) VALUES (?, ?)`);
    for (const sid of new Set(s.storeIds)) ins.run(id, sid);
    return id;
  })();
}
export function deleteStaff(id: number) {
  db().prepare(`DELETE FROM staff WHERE id = ?`).run(id);
}
export function importStaff(storeId: number, list: ImportedStaff[]): { created: number; linked: number } {
  const d = db();
  let created = 0;
  let linked = 0;
  d.transaction(() => {
    const maxOrder = (d.prepare(`SELECT COALESCE(MAX(sort_order),0) n FROM staff`).get() as { n: number }).n;
    list.forEach((st, i) => {
      const existing = d.prepare(`SELECT id FROM staff WHERE name = ?`).get(st.name) as { id: number } | undefined;
      let id = existing?.id;
      if (!id) {
        const days = st.employment === "A" || st.employment === "B" ? 5 : 3;
        const skills = st.role.includes("機能訓練指導員") ? "個別機能訓練,整体" : st.role === "ドライバー" ? "運転" : "";
        id = Number(
          d
            .prepare(
              `INSERT INTO staff (name, status, employment, role, skills, days_per_week, sort_order) VALUES (?, '在籍', ?, ?, ?, ?, ?)`,
            )
            .run(st.name, st.employment, st.role, skills, days, maxOrder + i + 1).lastInsertRowid,
        );
        created++;
      }
      const r = d.prepare(`INSERT OR IGNORE INTO staff_stores (staff_id, store_id) VALUES (?, ?)`).run(id, storeId);
      if (r.changes) linked++;
    });
  })();
  return { created, linked };
}

// ---------------- ケアマネ ----------------
export function listCareManagers(): CareManager[] {
  return db().prepare(`SELECT * FROM care_managers ORDER BY office, name, id`).all() as CareManager[];
}
export function saveCareManager(c: Omit<CareManager, "id"> & { id?: number }) {
  if (c.id) db().prepare(`UPDATE care_managers SET name=@name, office=@office, phone=@phone, fax=@fax, note=@note WHERE id=@id`).run(c);
  else db().prepare(`INSERT INTO care_managers (name, office, phone, fax, note) VALUES (@name, @office, @phone, @fax, @note)`).run(c);
}
export function deleteCareManager(id: number) {
  db().prepare(`DELETE FROM care_managers WHERE id = ?`).run(id);
}

// ---------------- 車両・ルート ----------------
export function listVehicles(storeId: number, activeOnly = false): Vehicle[] {
  return db()
    .prepare(
      `SELECT v.*, COALESCE((SELECT group_concat(staff_id) FROM vehicle_drivers vd WHERE vd.vehicle_id = v.id), '') AS driver_ids
       FROM vehicles v WHERE v.store_id = ? ${activeOnly ? "AND v.active = 1" : ""} ORDER BY v.sort_order, v.id`,
    )
    .all(storeId) as Vehicle[];
}
export function saveVehicle(v: Omit<Vehicle, "id" | "driver_ids"> & { id?: number; driverIds: number[] }) {
  const d = db();
  d.transaction(() => {
    let id = v.id;
    const row = { store_id: v.store_id, name: v.name, capacity: v.capacity, sort_order: v.sort_order, active: v.active };
    if (id) d.prepare(`UPDATE vehicles SET name=@name, capacity=@capacity, sort_order=@sort_order, active=@active WHERE id=@id AND store_id=@store_id`).run({ ...row, id });
    else id = Number(d.prepare(`INSERT INTO vehicles (store_id, name, capacity, sort_order, active) VALUES (@store_id, @name, @capacity, @sort_order, @active)`).run(row).lastInsertRowid);
    d.prepare(`DELETE FROM vehicle_drivers WHERE vehicle_id = ?`).run(id);
    const ins = d.prepare(`INSERT INTO vehicle_drivers (vehicle_id, staff_id) VALUES (?, ?)`);
    for (const sid of new Set(v.driverIds)) ins.run(id, sid);
  })();
}
export function deleteVehicle(storeId: number, id: number) {
  db().prepare(`DELETE FROM vehicles WHERE id = ? AND store_id = ?`).run(id, storeId);
}
export function listRoutes(storeId: number): Route[] {
  return db().prepare(`SELECT * FROM routes WHERE store_id = ? ORDER BY sort_order, id`).all(storeId) as Route[];
}
export function saveRoute(r: Omit<Route, "id"> & { id?: number }) {
  if (r.id)
    db()
      .prepare(
        `UPDATE routes SET name=@name, vehicle_id=@vehicle_id, morning_time=@morning_time, noon_time=@noon_time, evening_time=@evening_time, sort_order=@sort_order WHERE id=@id AND store_id=@store_id`,
      )
      .run(r);
  else
    db()
      .prepare(
        `INSERT INTO routes (store_id, name, vehicle_id, morning_time, noon_time, evening_time, sort_order) VALUES (@store_id, @name, @vehicle_id, @morning_time, @noon_time, @evening_time, @sort_order)`,
      )
      .run(r);
}
export function deleteRoute(storeId: number, id: number) {
  db().prepare(`DELETE FROM routes WHERE id = ? AND store_id = ?`).run(id, storeId);
}

// ---------------- 利用者 ----------------
export function listClients(storeId: number, opts: { includeEnded?: boolean } = {}): Client[] {
  return db()
    .prepare(`SELECT * FROM clients WHERE store_id = ? ${opts.includeEnded ? "" : "AND status <> '終了'"} ORDER BY kana, name, id`)
    .all(storeId) as Client[];
}
export function getClient(id: number): Client | undefined {
  return db().prepare(`SELECT * FROM clients WHERE id = ?`).get(id) as Client | undefined;
}
export function listSlots(storeId: number): ClientSlot[] {
  return db()
    .prepare(`SELECT cs.* FROM client_slots cs JOIN clients c ON c.id = cs.client_id WHERE c.store_id = ? ORDER BY cs.weekday, cs.session`)
    .all(storeId) as ClientSlot[];
}
export function getClientSlots(clientId: number): ClientSlot[] {
  return db().prepare(`SELECT * FROM client_slots WHERE client_id = ?`).all(clientId) as ClientSlot[];
}

const CLIENT_COLS = [
  "store_id",
  "name",
  "kana",
  "care_level",
  "gender",
  "birth_date",
  "age",
  "care_manager_id",
  "status",
  "new_flag",
  "start_date",
  "route_id",
  "route_order",
  "uses_transport",
  "needs_training",
  "address",
  "note",
] as const;

export function saveClient(c: Omit<Client, "id"> & { id?: number; slots: { weekday: number; session: Session }[] }): number {
  const d = db();
  return d.transaction(() => {
    const row = Object.fromEntries(CLIENT_COLS.map((k) => [k, c[k]]));
    let id = c.id;
    if (id) d.prepare(`UPDATE clients SET ${CLIENT_COLS.map((k) => `${k}=@${k}`).join(",")} WHERE id=@id`).run({ ...row, id });
    else id = Number(d.prepare(`INSERT INTO clients (${CLIENT_COLS.join(",")}) VALUES (${CLIENT_COLS.map((k) => `@${k}`).join(",")})`).run(row).lastInsertRowid);
    d.prepare(`DELETE FROM client_slots WHERE client_id = ?`).run(id);
    const ins = d.prepare(`INSERT OR IGNORE INTO client_slots (client_id, weekday, session) VALUES (?, ?, ?)`);
    for (const s of c.slots) ins.run(id, s.weekday, s.session);
    return id;
  })();
}
export function deleteClient(id: number) {
  db().prepare(`DELETE FROM clients WHERE id = ?`).run(id);
}

/** 曜日別出席リストの取り込み。同じ名前の利用者は介護度などを更新し、曜日枠を置き換える。 */
export function importClients(storeId: number, list: ImportedClient[]): { created: number; updated: number } {
  const d = db();
  let created = 0;
  let updated = 0;
  const existing = new Map(listClients(storeId, { includeEnded: true }).map((c) => [normalizeName(c.name), c]));
  d.transaction(() => {
    for (const ic of list) {
      const cur = existing.get(ic.name);
      if (cur) {
        saveClient({
          ...cur,
          care_level: ic.care_level || cur.care_level,
          gender: ic.gender || cur.gender,
          age: ic.age ?? cur.age,
          new_flag: ic.new_flag || cur.new_flag,
          status: cur.status === "終了" ? "利用中" : cur.status,
          slots: ic.slots,
        });
        updated++;
      } else {
        saveClient({
          store_id: storeId,
          name: ic.name,
          kana: "",
          care_level: ic.care_level,
          gender: ic.gender,
          birth_date: "",
          age: ic.age,
          care_manager_id: null,
          status: "利用中",
          new_flag: ic.new_flag,
          start_date: "",
          route_id: null,
          route_order: 0,
          uses_transport: 1,
          needs_training: 1,
          address: "",
          note: "",
          slots: ic.slots,
        });
        created++;
      }
    }
  })();
  return { created, updated };
}

// ---------------- シフト ----------------
export function getShiftCells(storeId: number, from: string, to: string): { staff_id: number; date: string; code: string }[] {
  return db()
    .prepare(`SELECT staff_id, date, code FROM shifts WHERE store_id = ? AND date BETWEEN ? AND ?`)
    .all(storeId, from, to) as { staff_id: number; date: string; code: string }[];
}
export function getShiftRequests(staffIds: number[], from: string, to: string): { staff_id: number; date: string; code: string }[] {
  if (staffIds.length === 0) return [];
  return db()
    .prepare(`SELECT staff_id, date, code FROM shift_requests WHERE staff_id IN (${staffIds.map(() => "?").join(",")}) AND date BETWEEN ? AND ?`)
    .all(...staffIds, from, to) as { staff_id: number; date: string; code: string }[];
}
/** 他店舗で勤務が入っている日（`${staffId}|${date}`） */
export function getBusyElsewhere(storeId: number, staffIds: number[], from: string, to: string): Set<string> {
  if (staffIds.length === 0) return new Set();
  const rows = db()
    .prepare(
      `SELECT staff_id, date, code FROM shifts WHERE store_id <> ? AND staff_id IN (${staffIds.map(() => "?").join(",")}) AND date BETWEEN ? AND ?
       AND code NOT IN ('休','希休','有','日','他店')`,
    )
    .all(storeId, ...staffIds, from, to) as { staff_id: number; date: string }[];
  return new Set(rows.map((r) => `${r.staff_id}|${r.date}`));
}
export function saveShiftMonth(
  storeId: number,
  from: string,
  to: string,
  staffIds: number[],
  cells: { staff_id: number; date: string; code: string }[],
  requests: { staff_id: number; date: string; code: string }[],
) {
  const d = db();
  d.transaction(() => {
    d.prepare(`DELETE FROM shifts WHERE store_id = ? AND date BETWEEN ? AND ?`).run(storeId, from, to);
    const ins = d.prepare(`INSERT INTO shifts (store_id, staff_id, date, code) VALUES (?, ?, ?, ?)`);
    for (const c of cells) if (c.code) ins.run(storeId, c.staff_id, c.date, c.code);
    if (staffIds.length) {
      d.prepare(`DELETE FROM shift_requests WHERE staff_id IN (${staffIds.map(() => "?").join(",")}) AND date BETWEEN ? AND ?`).run(...staffIds, from, to);
      const insR = d.prepare(`INSERT INTO shift_requests (staff_id, date, code) VALUES (?, ?, ?)`);
      for (const r of requests) if (r.code) insR.run(r.staff_id, r.date, r.code);
    }
  })();
}

// ---------------- 日々のスケジュール ----------------
function weekdayOf(date: string) {
  return new Date(`${date}T00:00:00`).getDay();
}

export function getDaily(storeId: number, date: string): DailyDetail {
  const d = db();
  const staff = listStaff({ storeId, activeOnly: true });
  const shiftRows = d.prepare(`SELECT staff_id, code FROM shifts WHERE store_id = ? AND date = ?`).all(storeId, date) as {
    staff_id: number;
    code: string;
  }[];
  const shiftMap = new Map(shiftRows.map((r) => [r.staff_id, r.code]));
  const shifts = staff.map((s) => ({ staff_id: s.id, code: shiftMap.get(s.id) ?? "" }));

  const daily = d.prepare(`SELECT * FROM daily WHERE store_id = ? AND date = ?`).get(storeId, date) as
    | { id: number; memo: string }
    | undefined;
  if (daily) {
    const attendance = d
      .prepare(`SELECT client_id, session, status, reason, extra, note FROM daily_attendance WHERE daily_id = ?`)
      .all(daily.id) as DailyDetail["attendance"];
    const runRows = d.prepare(`SELECT * FROM daily_runs WHERE daily_id = ? ORDER BY sort_order, id`).all(daily.id) as (Omit<DailyRun, "key" | "riders"> & {
      id: number;
    })[];
    const riderStmt = d.prepare(`SELECT client_id, direction, seq FROM daily_run_riders WHERE run_id = ? ORDER BY direction DESC, seq`);
    const runs: DailyRun[] = runRows.map((r) => ({
      key: `r${r.id}`,
      run: r.run,
      vehicle_id: r.vehicle_id,
      driver_id: r.driver_id,
      escort_id: r.escort_id,
      depart_time: r.depart_time,
      riders: riderStmt.all(r.id) as DailyRun["riders"],
    }));
    const training = d.prepare(`SELECT session, client_id, slot_time, staff_id FROM daily_training WHERE daily_id = ?`).all(daily.id) as DailyDetail["training"];
    return { store_id: storeId, date, memo: daily.memo, saved: true, shifts, attendance, runs, training };
  }

  // 未保存の日: 曜日別利用者枠から出席予定を作る
  const wd = weekdayOf(date);
  const active = new Set(listClients(storeId).filter((c) => c.status === "利用中").map((c) => c.id));
  const attendance = listSlots(storeId)
    .filter((s) => s.weekday === wd && active.has(s.client_id))
    .map((s) => ({ client_id: s.client_id, session: s.session, status: "present" as const, reason: "", extra: 0, note: "" }));
  return { store_id: storeId, date, memo: "", saved: false, shifts, attendance, runs: [], training: [] };
}

export function saveDaily(detail: DailyDetail) {
  const d = db();
  d.transaction(() => {
    d.prepare(
      `INSERT INTO daily (store_id, date, memo, updated_at) VALUES (?, ?, ?, datetime('now','localtime'))
       ON CONFLICT(store_id, date) DO UPDATE SET memo = excluded.memo, updated_at = excluded.updated_at`,
    ).run(detail.store_id, detail.date, detail.memo);
    const { id } = d.prepare(`SELECT id FROM daily WHERE store_id = ? AND date = ?`).get(detail.store_id, detail.date) as { id: number };
    d.prepare(`DELETE FROM daily_attendance WHERE daily_id = ?`).run(id);
    d.prepare(`DELETE FROM daily_runs WHERE daily_id = ?`).run(id);
    d.prepare(`DELETE FROM daily_training WHERE daily_id = ?`).run(id);

    const insA = d.prepare(
      `INSERT OR REPLACE INTO daily_attendance (daily_id, client_id, session, status, reason, extra, note) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const a of detail.attendance) insA.run(id, a.client_id, a.session, a.status, a.status === "absent" ? a.reason : "", a.extra ? 1 : 0, a.note);

    const insRun = d.prepare(
      `INSERT INTO daily_runs (daily_id, run, vehicle_id, driver_id, escort_id, depart_time, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    const insRider = d.prepare(`INSERT OR IGNORE INTO daily_run_riders (run_id, client_id, direction, seq) VALUES (?, ?, ?, ?)`);
    detail.runs.forEach((r, i) => {
      const runId = Number(insRun.run(id, r.run, r.vehicle_id, r.driver_id, r.escort_id, r.depart_time, i).lastInsertRowid);
      for (const rd of r.riders) insRider.run(runId, rd.client_id, rd.direction, rd.seq);
    });

    const insT = d.prepare(`INSERT OR REPLACE INTO daily_training (daily_id, session, client_id, slot_time, staff_id) VALUES (?, ?, ?, ?, ?)`);
    for (const t of detail.training) insT.run(id, t.session, t.client_id, t.slot_time, t.staff_id);

    // その日のシフトをシフト表へ反映（急な休みなど）
    const upShift = d.prepare(
      `INSERT INTO shifts (store_id, staff_id, date, code) VALUES (?, ?, ?, ?) ON CONFLICT(store_id, staff_id, date) DO UPDATE SET code = excluded.code`,
    );
    const delShift = d.prepare(`DELETE FROM shifts WHERE store_id = ? AND staff_id = ? AND date = ?`);
    for (const s of detail.shifts) {
      if (s.code) upShift.run(detail.store_id, s.staff_id, detail.date, s.code);
      else delShift.run(detail.store_id, s.staff_id, detail.date);
    }
  })();
}

function sinceDate(date: string, days: number) {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 前回の運転者（便×車両ごと）と直近 2 週間の運転回数 */
export function buildTransportHistory(storeId: number, date: string): TransportHistory {
  const d = db();
  const lastDriver = new Map<string, number>();
  const rows = d
    .prepare(
      `SELECT r.run, r.vehicle_id, r.driver_id, dl.date FROM daily_runs r JOIN daily dl ON dl.id = r.daily_id
       WHERE dl.store_id = ? AND dl.date < ? AND r.driver_id IS NOT NULL AND r.vehicle_id IS NOT NULL ORDER BY dl.date DESC`,
    )
    .all(storeId, date) as { run: string; vehicle_id: number; driver_id: number }[];
  for (const r of rows) {
    const k = `${r.run}|${r.vehicle_id}`;
    if (!lastDriver.has(k)) lastDriver.set(k, r.driver_id);
  }
  const counts = d
    .prepare(
      `SELECT r.driver_id AS id, COUNT(*) AS n FROM daily_runs r JOIN daily dl ON dl.id = r.daily_id
       WHERE dl.store_id = ? AND dl.date < ? AND dl.date >= ? AND r.driver_id IS NOT NULL GROUP BY r.driver_id`,
    )
    .all(storeId, date, sinceDate(date, 14)) as { id: number; n: number }[];
  return { lastDriver, driveCounts: new Map(counts.map((c) => [c.id, c.n])) };
}

/** 利用者ごとの前回の機能訓練・整体の担当と、直近 2 週間の担当回数 */
export function buildTrainingHistory(storeId: number, date: string): TrainingHistory {
  const d = db();
  const lastStaff = new Map<number, number>();
  const rows = d
    .prepare(
      `SELECT t.client_id, t.staff_id FROM daily_training t JOIN daily dl ON dl.id = t.daily_id
       WHERE dl.store_id = ? AND dl.date < ? AND t.staff_id IS NOT NULL ORDER BY dl.date DESC, t.session DESC`,
    )
    .all(storeId, date) as { client_id: number; staff_id: number }[];
  for (const r of rows) if (!lastStaff.has(r.client_id)) lastStaff.set(r.client_id, r.staff_id);
  const counts = d
    .prepare(
      `SELECT t.staff_id AS id, COUNT(*) AS n FROM daily_training t JOIN daily dl ON dl.id = t.daily_id
       WHERE dl.store_id = ? AND dl.date < ? AND dl.date >= ? AND t.staff_id IS NOT NULL GROUP BY t.staff_id`,
    )
    .all(storeId, date, sinceDate(date, 14)) as { id: number; n: number }[];
  return { lastStaff, counts: new Map(counts.map((c) => [c.id, c.n])) };
}

// ---------------- 月次 ----------------
export type DailyNote = {
  date: string;
  session: Session;
  status: "present" | "absent";
  reason: string;
  note: string;
  trainer: string | null;
};

export function listClientDailyNotes(clientId: number, ym: string): DailyNote[] {
  return db()
    .prepare(
      `SELECT dl.date, a.session, a.status, a.reason, a.note,
              (SELECT st.name FROM daily_training t JOIN staff st ON st.id = t.staff_id
               WHERE t.daily_id = dl.id AND t.client_id = a.client_id AND t.session = a.session) AS trainer
       FROM daily_attendance a JOIN daily dl ON dl.id = a.daily_id
       WHERE a.client_id = ? AND dl.date LIKE ? ORDER BY dl.date, a.session`,
    )
    .all(clientId, `${ym}-%`) as DailyNote[];
}
export function getMonthlyReport(clientId: number, ym: string): MonthlyReport | undefined {
  return db().prepare(`SELECT * FROM monthly_reports WHERE client_id = ? AND ym = ?`).get(clientId, ym) as MonthlyReport | undefined;
}
export function listMonthlyReports(storeId: number, ym: string): MonthlyReport[] {
  return db()
    .prepare(`SELECT m.* FROM monthly_reports m JOIN clients c ON c.id = m.client_id WHERE c.store_id = ? AND m.ym = ?`)
    .all(storeId, ym) as MonthlyReport[];
}
export function saveMonthlyReport(clientId: number, ym: string, keywords: string, body: string) {
  db()
    .prepare(
      `INSERT INTO monthly_reports (client_id, ym, keywords, body, updated_at) VALUES (?, ?, ?, ?, datetime('now','localtime'))
       ON CONFLICT(client_id, ym) DO UPDATE SET keywords = excluded.keywords, body = excluded.body, updated_at = excluded.updated_at`,
    )
    .run(clientId, ym, keywords, body);
}
export function monthAttendanceStats(storeId: number, ym: string): Map<number, { present: number; absent: number; notes: number }> {
  const rows = db()
    .prepare(
      `SELECT a.client_id,
              SUM(CASE WHEN a.status='present' THEN 1 ELSE 0 END) AS present,
              SUM(CASE WHEN a.status='absent' THEN 1 ELSE 0 END) AS absent,
              SUM(CASE WHEN a.note <> '' THEN 1 ELSE 0 END) AS notes
       FROM daily_attendance a JOIN daily dl ON dl.id = a.daily_id
       WHERE dl.store_id = ? AND dl.date LIKE ? GROUP BY a.client_id`,
    )
    .all(storeId, `${ym}-%`) as { client_id: number; present: number; absent: number; notes: number }[];
  return new Map(rows.map((r) => [r.client_id, r]));
}

// ---------------- 曜日別の利用者数・空き枠 ----------------
/** weekday -> session -> 利用中の登録人数 */
export function slotCounts(storeId: number): Map<string, number> {
  const rows = db()
    .prepare(
      `SELECT cs.weekday, cs.session, COUNT(*) n FROM client_slots cs JOIN clients c ON c.id = cs.client_id
       WHERE c.store_id = ? AND c.status = '利用中' GROUP BY cs.weekday, cs.session`,
    )
    .all(storeId) as { weekday: number; session: string; n: number }[];
  return new Map(rows.map((r) => [`${r.weekday}|${r.session}`, r.n]));
}

export function counts() {
  const one = (sql: string) => (db().prepare(sql).get() as { n: number }).n;
  return {
    stores: one(`SELECT COUNT(*) n FROM stores`),
    staff: one(`SELECT COUNT(*) n FROM staff`),
    clients: one(`SELECT COUNT(*) n FROM clients`),
  };
}

export { splitList, joinList };
