import { getDb } from "./db";
import type {
  Client,
  Course,
  MonthlyReport,
  Schedule,
  ScheduleClient,
  ScheduleCourse,
  ScheduleDetail,
  Staff,
} from "./types";
import type { AssignHistory } from "./assign";
import { emptyHistory } from "./assign";

// ---------- スタッフ ----------
export function listStaff(activeOnly = false): Staff[] {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM staff ${activeOnly ? "WHERE active = 1" : ""} ORDER BY sort_order, id`)
    .all() as Staff[];
}

export function upsertStaff(s: Omit<Staff, "id"> & { id?: number }) {
  const db = getDb();
  if (s.id) {
    db.prepare(
      `UPDATE staff SET name=@name, can_drive=@can_drive, can_seitai=@can_seitai, active=@active, sort_order=@sort_order WHERE id=@id`,
    ).run(s);
  } else {
    db.prepare(
      `INSERT INTO staff (name, can_drive, can_seitai, active, sort_order) VALUES (@name, @can_drive, @can_seitai, @active, @sort_order)`,
    ).run(s);
  }
}

export function deleteStaff(id: number) {
  getDb().prepare(`DELETE FROM staff WHERE id = ?`).run(id);
}

// ---------- 送迎コース ----------
export function listCourses(activeOnly = false): Course[] {
  return getDb()
    .prepare(`SELECT * FROM courses ${activeOnly ? "WHERE active = 1" : ""} ORDER BY kind DESC, slot, sort_order, id`)
    .all() as Course[];
}

export function upsertCourse(c: Omit<Course, "id"> & { id?: number }) {
  const db = getDb();
  if (c.id) {
    db.prepare(`UPDATE courses SET name=@name, kind=@kind, slot=@slot, sort_order=@sort_order, active=@active WHERE id=@id`).run(c);
  } else {
    db.prepare(`INSERT INTO courses (name, kind, slot, sort_order, active) VALUES (@name, @kind, @slot, @sort_order, @active)`).run(c);
  }
}

export function deleteCourse(id: number) {
  getDb().prepare(`DELETE FROM courses WHERE id = ?`).run(id);
}

// ---------- 利用者 ----------
export function listClients(activeOnly = false): Client[] {
  return getDb()
    .prepare(`SELECT * FROM clients ${activeOnly ? "WHERE active = 1" : ""} ORDER BY id`)
    .all() as Client[];
}

export function getClient(id: number): Client | undefined {
  return getDb().prepare(`SELECT * FROM clients WHERE id = ?`).get(id) as Client | undefined;
}

export function upsertClient(c: Omit<Client, "id"> & { id?: number }) {
  const db = getDb();
  if (c.id) {
    db.prepare(
      `UPDATE clients SET name=@name, care_level=@care_level, area=@area, needs_seitai=@needs_seitai,
       pickup_course_id=@pickup_course_id, dropoff_course_id=@dropoff_course_id, default_weekdays=@default_weekdays,
       active=@active, note=@note WHERE id=@id`,
    ).run(c);
  } else {
    db.prepare(
      `INSERT INTO clients (name, care_level, area, needs_seitai, pickup_course_id, dropoff_course_id, default_weekdays, active, note)
       VALUES (@name, @care_level, @area, @needs_seitai, @pickup_course_id, @dropoff_course_id, @default_weekdays, @active, @note)`,
    ).run(c);
  }
}

export function deleteClient(id: number) {
  getDb().prepare(`DELETE FROM clients WHERE id = ?`).run(id);
}

// ---------- 日々のスケジュール ----------
export function getSchedule(date: string): Schedule | undefined {
  return getDb().prepare(`SELECT * FROM schedules WHERE date = ?`).get(date) as Schedule | undefined;
}

export function listScheduleDates(ym: string): string[] {
  return (getDb().prepare(`SELECT date FROM schedules WHERE date LIKE ? ORDER BY date`).all(`${ym}-%`) as { date: string }[]).map(
    (r) => r.date,
  );
}

/**
 * 指定日のスケジュール詳細。未保存の日はマスタから初期値（曜日パターンで出席者、既定コース）を組み立てる。
 */
export function getScheduleDetail(date: string): ScheduleDetail {
  const db = getDb();
  const sched = getSchedule(date);
  if (sched) {
    const staffIds = (db.prepare(`SELECT staff_id FROM schedule_staff WHERE schedule_id = ?`).all(sched.id) as { staff_id: number }[]).map(
      (r) => r.staff_id,
    );
    const courses = db
      .prepare(`SELECT course_id, staff_id FROM schedule_courses WHERE schedule_id = ?`)
      .all(sched.id) as ScheduleCourse[];
    const clients = db
      .prepare(
        `SELECT client_id, status, pickup_course_id, dropoff_course_id, seitai, seitai_staff_id, note
         FROM schedule_clients WHERE schedule_id = ?`,
      )
      .all(sched.id) as ScheduleClient[];
    return { date, memo: sched.memo, saved: true, staffIds, courses, clients };
  }
  const weekday = new Date(`${date}T00:00:00`).getDay();
  const clients: ScheduleClient[] = listClients(true).map((c) => {
    const days = c.default_weekdays
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map(Number);
    const present = days.includes(weekday);
    return {
      client_id: c.id,
      status: present ? "present" : "absent",
      pickup_course_id: c.pickup_course_id,
      dropoff_course_id: c.dropoff_course_id,
      seitai: c.needs_seitai,
      seitai_staff_id: null,
      note: "",
    };
  });
  const courses: ScheduleCourse[] = listCourses(true).map((c) => ({ course_id: c.id, staff_id: null }));
  return { date, memo: "", saved: false, staffIds: [], courses, clients };
}

export function saveScheduleDetail(d: ScheduleDetail) {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO schedules (date, memo, updated_at) VALUES (?, ?, datetime('now','localtime'))
       ON CONFLICT(date) DO UPDATE SET memo = excluded.memo, updated_at = excluded.updated_at`,
    ).run(d.date, d.memo);
    const { id } = db.prepare(`SELECT id FROM schedules WHERE date = ?`).get(d.date) as { id: number };
    db.prepare(`DELETE FROM schedule_staff WHERE schedule_id = ?`).run(id);
    db.prepare(`DELETE FROM schedule_courses WHERE schedule_id = ?`).run(id);
    db.prepare(`DELETE FROM schedule_clients WHERE schedule_id = ?`).run(id);
    const insStaff = db.prepare(`INSERT INTO schedule_staff (schedule_id, staff_id) VALUES (?, ?)`);
    for (const sid of d.staffIds) insStaff.run(id, sid);
    const insCourse = db.prepare(`INSERT INTO schedule_courses (schedule_id, course_id, staff_id) VALUES (?, ?, ?)`);
    for (const c of d.courses) insCourse.run(id, c.course_id, c.staff_id);
    const insClient = db.prepare(
      `INSERT INTO schedule_clients (schedule_id, client_id, status, pickup_course_id, dropoff_course_id, seitai, seitai_staff_id, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const c of d.clients) {
      insClient.run(
        id,
        c.client_id,
        c.status,
        c.pickup_course_id,
        c.dropoff_course_id,
        c.seitai ? 1 : 0,
        c.status === "present" && c.seitai ? c.seitai_staff_id : null,
        c.note ?? "",
      );
    }
  });
  tx();
}

/**
 * 自動割り当て用の履歴: 指定日より前の直近スケジュールから
 * 「前回の担当」と「直近 N 日間の担当回数」を集計する。
 */
export function buildAssignHistory(date: string, lookbackDays = 14): AssignHistory {
  const db = getDb();
  const h = emptyHistory();
  const since = new Date(`${date}T00:00:00`);
  since.setDate(since.getDate() - lookbackDays);
  const sinceStr = since.toISOString().slice(0, 10);

  // 前回のコース担当（コースごとに最新の日付）
  const lastDrivers = db
    .prepare(
      `SELECT sc.course_id, sc.staff_id FROM schedule_courses sc
       JOIN schedules s ON s.id = sc.schedule_id
       WHERE s.date < ? AND sc.staff_id IS NOT NULL
         AND s.date = (SELECT MAX(s2.date) FROM schedules s2 JOIN schedule_courses sc2 ON sc2.schedule_id = s2.id
                       WHERE sc2.course_id = sc.course_id AND sc2.staff_id IS NOT NULL AND s2.date < ?)`,
    )
    .all(date, date) as { course_id: number; staff_id: number }[];
  for (const r of lastDrivers) h.lastCourseDriver.set(r.course_id, r.staff_id);

  const driveCounts = db
    .prepare(
      `SELECT sc.staff_id, COUNT(*) AS n FROM schedule_courses sc JOIN schedules s ON s.id = sc.schedule_id
       WHERE s.date < ? AND s.date >= ? AND sc.staff_id IS NOT NULL GROUP BY sc.staff_id`,
    )
    .all(date, sinceStr) as { staff_id: number; n: number }[];
  for (const r of driveCounts) h.driveCounts.set(r.staff_id, r.n);

  const lastSeitai = db
    .prepare(
      `SELECT sc.client_id, sc.seitai_staff_id AS staff_id FROM schedule_clients sc
       JOIN schedules s ON s.id = sc.schedule_id
       WHERE s.date < ? AND sc.seitai_staff_id IS NOT NULL
         AND s.date = (SELECT MAX(s2.date) FROM schedules s2 JOIN schedule_clients sc2 ON sc2.schedule_id = s2.id
                       WHERE sc2.client_id = sc.client_id AND sc2.seitai_staff_id IS NOT NULL AND s2.date < ?)`,
    )
    .all(date, date) as { client_id: number; staff_id: number }[];
  for (const r of lastSeitai) h.lastSeitaiStaff.set(r.client_id, r.staff_id);

  const seitaiCounts = db
    .prepare(
      `SELECT sc.seitai_staff_id AS staff_id, COUNT(*) AS n FROM schedule_clients sc JOIN schedules s ON s.id = sc.schedule_id
       WHERE s.date < ? AND s.date >= ? AND sc.seitai_staff_id IS NOT NULL GROUP BY sc.seitai_staff_id`,
    )
    .all(date, sinceStr) as { staff_id: number; n: number }[];
  for (const r of seitaiCounts) h.seitaiCounts.set(r.staff_id, r.n);

  return h;
}

// ---------- 月次（利用者の日々の様子） ----------
export type DailyNote = {
  date: string;
  status: "present" | "absent";
  note: string;
  seitai_staff_name: string | null;
};

export function listClientDailyNotes(clientId: number, ym: string): DailyNote[] {
  return getDb()
    .prepare(
      `SELECT s.date, sc.status, sc.note, st.name AS seitai_staff_name
       FROM schedule_clients sc
       JOIN schedules s ON s.id = sc.schedule_id
       LEFT JOIN staff st ON st.id = sc.seitai_staff_id
       WHERE sc.client_id = ? AND s.date LIKE ?
       ORDER BY s.date`,
    )
    .all(clientId, `${ym}-%`) as DailyNote[];
}

export function getMonthlyReport(clientId: number, ym: string): MonthlyReport | undefined {
  return getDb().prepare(`SELECT * FROM monthly_reports WHERE client_id = ? AND ym = ?`).get(clientId, ym) as
    | MonthlyReport
    | undefined;
}

export function listMonthlyReports(ym: string): MonthlyReport[] {
  return getDb().prepare(`SELECT * FROM monthly_reports WHERE ym = ?`).all(ym) as MonthlyReport[];
}

export function saveMonthlyReport(clientId: number, ym: string, keywords: string, body: string) {
  getDb()
    .prepare(
      `INSERT INTO monthly_reports (client_id, ym, keywords, body, updated_at) VALUES (?, ?, ?, ?, datetime('now','localtime'))
       ON CONFLICT(client_id, ym) DO UPDATE SET keywords = excluded.keywords, body = excluded.body, updated_at = excluded.updated_at`,
    )
    .run(clientId, ym, keywords, body);
}

/** 月の出席・欠席の集計（日報連携の足がかり） */
export function monthAttendanceSummary(ym: string): { date: string; present: number; absent: number }[] {
  return getDb()
    .prepare(
      `SELECT s.date,
              SUM(CASE WHEN sc.status = 'present' THEN 1 ELSE 0 END) AS present,
              SUM(CASE WHEN sc.status = 'absent' THEN 1 ELSE 0 END) AS absent
       FROM schedules s LEFT JOIN schedule_clients sc ON sc.schedule_id = s.id
       WHERE s.date LIKE ? GROUP BY s.date ORDER BY s.date`,
    )
    .all(`${ym}-%`) as { date: string; present: number; absent: number }[];
}

export function counts() {
  const db = getDb();
  const one = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  return {
    staff: one(`SELECT COUNT(*) n FROM staff`),
    clients: one(`SELECT COUNT(*) n FROM clients`),
    courses: one(`SELECT COUNT(*) n FROM courses`),
    schedules: one(`SELECT COUNT(*) n FROM schedules`),
  };
}
