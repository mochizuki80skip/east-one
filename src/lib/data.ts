/**
 * データの読み書き（ブラウザ側）。PHP API の文書ストアの上に、店舗・スタッフ・利用者などの操作をまとめる。
 *
 * 文書の ID:
 *  stores / staff / care_managers / vehicles / routes / clients … 連番
 *  shifts         `${店舗ID}:${年月}`   { cells: { "スタッフID|日付": 記号 } }
 *  shift_requests `${年月}`             { cells: { "スタッフID|日付": 希望 } }（全店舗共通）
 *  daily          `${店舗ID}:${日付}`   その日のスケジュール
 *  monthly        `${利用者ID}:${年月}` 月次報告
 */
import { api, type BatchOp } from "./api";
import { DEFAULT_DAYS, DEFAULT_PATTERNS, joinList, normalizeDuties, normalizeSkills, shiftWorks, splitList, type RunKind, type Session } from "./constants";
import type { ImportedClient, ImportedStaff } from "./import";
import { normalizeName } from "./import";
import { driverGroupOf, type TransportHistory } from "./transport";
import type { TrainingHistory } from "./timetable";
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
import { addDays, monthDates } from "./date";

export type Cell = { staff_id: number; date: string; code: string };
export type ClientWithSlots = Client & { slots: { weekday: number; session: Session }[] };

const byOrder = <T extends { sort_order: number; id: number }>(a: T, b: T) => a.sort_order - b.sort_order || a.id - b.id;
const all = async <T>(c: string) => (await api.list<T>(c)).map((d) => d.data);
const put = (c: string, id: string | number | null | undefined, data: object): BatchOp => ({ op: "put", c, id: id ?? null, data });
const del = (c: string, id: string | number): BatchOp => ({ op: "delete", c, id });
const saveOne = async (c: string, id: number | undefined, data: object) => Number((await api.batch([put(c, id, data)]))[0].id);

// ---------------- 店舗 ----------------
export async function listStores(): Promise<Store[]> {
  return (await all<Store>("stores")).sort(byOrder);
}
export async function getStore(id: number): Promise<Store | undefined> {
  return (await api.get<Store>("stores", id))?.data;
}
export async function saveStore(s: Omit<Store, "id"> & { id?: number }): Promise<number> {
  return saveOne("stores", s.id, s);
}
/** 店舗と、その店舗の車両・ルート・利用者・シフト・スケジュール・月次報告を削除する */
export async function deleteStore(id: number) {
  const [vehicles, routes, clients, shifts, daily, monthly, staff] = await Promise.all([
    all<Vehicle>("vehicles"),
    all<Route>("routes"),
    all<Client>("clients"),
    api.list("shifts", { prefix: `${id}:` }),
    api.list("daily", { prefix: `${id}:` }),
    api.list("monthly"),
    all<Staff>("staff"),
  ]);
  const clientIds = new Set(clients.filter((c) => c.store_id === id).map((c) => String(c.id)));
  const ops: BatchOp[] = [
    del("stores", id),
    ...vehicles.filter((v) => v.store_id === id).map((v) => del("vehicles", v.id)),
    ...routes.filter((r) => r.store_id === id).map((r) => del("routes", r.id)),
    ...clients.filter((c) => c.store_id === id).map((c) => del("clients", c.id)),
    ...shifts.map((d) => del("shifts", d.id)),
    ...daily.map((d) => del("daily", d.id)),
    ...monthly.filter((d) => clientIds.has(d.id.split(":")[0])).map((d) => del("monthly", d.id)),
    ...staff
      .filter((s) => splitList(s.store_ids).includes(String(id)))
      .map((s) => put("staff", s.id, { ...s, store_ids: joinList(splitList(s.store_ids).filter((x) => x !== String(id))) })),
  ];
  await api.batch(ops);
}

// ---------------- スタッフ ----------------
/** 以前のスキル名（メディカルケア・FIT・入浴介助）を今の名前にそろえる */
const withSkills = (s: Staff): Staff => ({ ...s, skills: joinList(normalizeSkills(splitList(s.skills))) });

export async function listStaff(opts: { storeId?: number; activeOnly?: boolean } = {}): Promise<Staff[]> {
  return (await all<Staff>("staff"))
    .map(withSkills)
    .filter((s) => !opts.storeId || splitList(s.store_ids).includes(String(opts.storeId)))
    .filter((s) => !opts.activeOnly || s.status === "在籍")
    .sort(byOrder);
}
export async function getStaff(id: number): Promise<Staff | undefined> {
  const s = (await api.get<Staff>("staff", id))?.data;
  return s && withSkills(s);
}
export async function saveStaff(s: Omit<Staff, "id" | "store_ids"> & { id?: number; storeIds: number[] }): Promise<number> {
  const { storeIds, ...rest } = s;
  return saveOne("staff", s.id, { ...rest, store_ids: joinList([...new Set(storeIds)]) });
}
export async function deleteStaff(id: number) {
  const vehicles = await all<Vehicle>("vehicles");
  await api.batch([
    del("staff", id),
    ...vehicles
      .filter((v) => splitList(v.driver_ids).includes(String(id)))
      .map((v) => put("vehicles", v.id, { ...v, driver_ids: joinList(splitList(v.driver_ids).filter((x) => x !== String(id))) })),
  ]);
}
/** できることを一括で保存する（最新のデータを読み直し、できることだけ書き換える） */
export async function saveStaffSkills(changes: { id: number; skills: string[] }[]) {
  if (!changes.length) return;
  const byId = new Map((await all<Staff>("staff")).map((s) => [s.id, s]));
  await api.batch(
    changes
      .filter((c) => byId.has(c.id))
      .map((c) => put("staff", c.id, { ...byId.get(c.id)!, skills: joinList(normalizeSkills(c.skills)) })),
  );
}
export async function importStaff(storeId: number, list: ImportedStaff[]): Promise<{ created: number; linked: number }> {
  const staff = await all<Staff>("staff");
  const byName = new Map(staff.map((s) => [normalizeName(s.name), s]));
  let maxOrder = staff.reduce((m, s) => Math.max(m, s.sort_order), 0);
  const ops: BatchOp[] = [];
  let created = 0;
  let linked = 0;
  for (const st of list) {
    const cur = byName.get(st.name);
    if (cur) {
      const ids = splitList(cur.store_ids);
      if (!ids.includes(String(storeId))) {
        ops.push(put("staff", cur.id, { ...cur, store_ids: joinList([...ids, storeId]) }));
        linked++;
      }
      continue;
    }
    const skills = st.role.includes("機能訓練指導員") ? "個別機能訓練,整体" : st.role === "ドライバー" ? "運転" : "";
    // 勤務形態 A・B（常勤）は正社員、C・D（常勤以外）はパートとして仮に登録する（あとで変更可）
    const contract = st.employment === "A" || st.employment === "B" ? "正社員" : "パート";
    ops.push(
      put("staff", null, {
        name: st.name,
        status: "在籍",
        employment: st.employment,
        role: st.role,
        skills,
        contract,
        patterns: DEFAULT_PATTERNS[contract].join(","),
        days_per_week: DEFAULT_DAYS[contract],
        available_weekdays: "1,2,3,4,5,6",
        note: "",
        sort_order: ++maxOrder,
        store_ids: String(storeId),
      }),
    );
    created++;
    linked++;
  }
  await api.batch(ops);
  return { created, linked };
}

// ---------------- ケアマネ ----------------
export async function listCareManagers(): Promise<CareManager[]> {
  return (await all<CareManager>("care_managers")).sort((a, b) => a.office.localeCompare(b.office, "ja") || a.name.localeCompare(b.name, "ja") || a.id - b.id);
}
export async function saveCareManager(c: Omit<CareManager, "id"> & { id?: number }) {
  return saveOne("care_managers", c.id, c);
}
export async function deleteCareManager(id: number) {
  const clients = await all<ClientWithSlots>("clients");
  await api.batch([
    del("care_managers", id),
    ...clients.filter((c) => c.care_manager_id === id).map((c) => put("clients", c.id, { ...c, care_manager_id: null })),
  ]);
}

// ---------------- 車両・ルート ----------------
export async function listVehicles(storeId: number, activeOnly = false): Promise<Vehicle[]> {
  return (await all<Vehicle>("vehicles")).filter((v) => v.store_id === storeId && (!activeOnly || v.active)).sort(byOrder);
}
export async function saveVehicle(v: Omit<Vehicle, "id" | "driver_ids"> & { id?: number; driverIds: number[] }) {
  const { driverIds, ...rest } = v;
  return saveOne("vehicles", v.id, { ...rest, driver_ids: joinList([...new Set(driverIds)]) });
}
export async function deleteVehicle(id: number) {
  const routes = await all<Route>("routes");
  await api.batch([del("vehicles", id), ...routes.filter((r) => r.vehicle_id === id).map((r) => put("routes", r.id, { ...r, vehicle_id: null }))]);
}
export async function listRoutes(storeId: number): Promise<Route[]> {
  return (await all<Route>("routes")).filter((r) => r.store_id === storeId).sort(byOrder);
}
export async function saveRoute(r: Omit<Route, "id"> & { id?: number }) {
  return saveOne("routes", r.id, r);
}
export async function deleteRoute(id: number) {
  const clients = await all<ClientWithSlots>("clients");
  await api.batch([del("routes", id), ...clients.filter((c) => c.route_id === id).map((c) => put("clients", c.id, { ...c, route_id: null }))]);
}

// ---------------- 利用者 ----------------
export async function listClientsWithSlots(storeId: number, opts: { includeEnded?: boolean } = {}): Promise<ClientWithSlots[]> {
  return (await all<ClientWithSlots>("clients"))
    .filter((c) => c.store_id === storeId && (opts.includeEnded || c.status !== "終了"))
    .map((c) => ({ ...c, slots: c.slots ?? [] }))
    .sort((a, b) => (a.kana || a.name).localeCompare(b.kana || b.name, "ja") || a.id - b.id);
}
export async function listClients(storeId: number, opts: { includeEnded?: boolean } = {}): Promise<Client[]> {
  return listClientsWithSlots(storeId, opts);
}
export function slotsOf(clients: ClientWithSlots[]): ClientSlot[] {
  return clients.flatMap((c) => c.slots.map((s) => ({ client_id: c.id, weekday: s.weekday, session: s.session })));
}
export async function getClient(id: number): Promise<ClientWithSlots | undefined> {
  const d = (await api.get<ClientWithSlots>("clients", id))?.data;
  return d ? { ...d, slots: d.slots ?? [] } : undefined;
}
export async function saveClient(c: Omit<ClientWithSlots, "id"> & { id?: number }): Promise<number> {
  return saveOne("clients", c.id, c);
}
export async function deleteClient(id: number) {
  const monthly = await api.list("monthly", { prefix: `${id}:` });
  await api.batch([del("clients", id), ...monthly.map((d) => del("monthly", d.id))]);
}
/** 曜日別出席リストの取り込み。同じ名前の利用者は介護度などを更新し、曜日枠を置き換える。 */
export async function importClients(storeId: number, list: ImportedClient[]): Promise<{ created: number; updated: number }> {
  const existing = new Map((await listClientsWithSlots(storeId, { includeEnded: true })).map((c) => [normalizeName(c.name), c]));
  const ops: BatchOp[] = [];
  let created = 0;
  let updated = 0;
  for (const ic of list) {
    const cur = existing.get(ic.name);
    if (cur) {
      ops.push(
        put("clients", cur.id, {
          ...cur,
          care_level: ic.care_level || cur.care_level,
          gender: ic.gender || cur.gender,
          age: ic.age ?? cur.age,
          new_flag: ic.new_flag || cur.new_flag,
          status: cur.status === "終了" ? "利用中" : cur.status,
          slots: ic.slots,
        }),
      );
      updated++;
    } else {
      ops.push(
        put("clients", null, {
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
        }),
      );
      created++;
    }
  }
  await api.batch(ops);
  return { created, updated };
}

/** weekday|session -> 利用中の登録人数 */
export function slotCountsOf(clients: ClientWithSlots[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of clients) {
    if (c.status !== "利用中") continue;
    for (const s of c.slots) m.set(`${s.weekday}|${s.session}`, (m.get(`${s.weekday}|${s.session}`) ?? 0) + 1);
  }
  return m;
}

// ---------------- シフト ----------------
type CellsDoc = { cells: Record<string, string> };
const toCells = (m: Record<string, string>): Cell[] =>
  Object.entries(m).map(([k, code]) => {
    const [sid, date] = k.split("|");
    return { staff_id: Number(sid), date, code };
  });

export async function getShiftCells(storeId: number, ym: string): Promise<Cell[]> {
  return toCells((await api.get<CellsDoc>("shifts", `${storeId}:${ym}`))?.data.cells ?? {});
}
export async function getShiftRequests(staffIds: number[], ym: string): Promise<Cell[]> {
  const ids = new Set(staffIds);
  return toCells((await api.get<CellsDoc>("shift_requests", ym))?.data.cells ?? {}).filter((c) => ids.has(c.staff_id));
}
/** 他店舗で勤務が入っている日（`${staffId}|${date}`） */
export async function getBusyElsewhere(storeId: number, staffIds: number[], ym: string): Promise<Set<string>> {
  const ids = new Set(staffIds);
  const docs = await api.list<CellsDoc>("shifts", { suffix: `:${ym}` });
  const out = new Set<string>();
  for (const d of docs) {
    if (d.id === `${storeId}:${ym}`) continue;
    for (const c of toCells(d.data.cells)) {
      const w = shiftWorks(c.code);
      if (ids.has(c.staff_id) && (w.am || w.pm)) out.add(`${c.staff_id}|${c.date}`);
    }
  }
  return out;
}
export async function saveShiftMonth(storeId: number, ym: string, staffIds: number[], cells: Cell[], requests: Cell[]) {
  const ids = new Set(staffIds);
  const reqDoc = (await api.get<CellsDoc>("shift_requests", ym))?.data.cells ?? {};
  const mergedReq = Object.fromEntries(Object.entries(reqDoc).filter(([k]) => !ids.has(Number(k.split("|")[0]))));
  for (const r of requests) if (r.code && ids.has(r.staff_id)) mergedReq[`${r.staff_id}|${r.date}`] = r.code;
  const cellMap: Record<string, string> = {};
  for (const c of cells) if (c.code && ids.has(c.staff_id)) cellMap[`${c.staff_id}|${c.date}`] = c.code;
  await api.batch([put("shifts", `${storeId}:${ym}`, { cells: cellMap }), put("shift_requests", ym, { cells: mergedReq })]);
}

// ---------------- 日々のスケジュール ----------------
type DailyDoc = Omit<DailyDetail, "store_id" | "date" | "saved" | "shifts">;

export async function getDaily(storeId: number, date: string): Promise<DailyDetail> {
  const ym = date.slice(0, 7);
  const [staff, shiftDoc, dailyDoc, clients] = await Promise.all([
    listStaff({ storeId, activeOnly: true }),
    api.get<CellsDoc>("shifts", `${storeId}:${ym}`),
    api.get<DailyDoc>("daily", `${storeId}:${date}`),
    listClientsWithSlots(storeId, { includeEnded: true }),
  ]);
  const cells = shiftDoc?.data.cells ?? {};
  const shifts = staff.map((s) => ({ staff_id: s.id, code: cells[`${s.id}|${date}`] ?? "" }));
  const known = new Set(clients.map((c) => c.id));
  if (dailyDoc) {
    const d = dailyDoc.data;
    let n = 0;
    return {
      store_id: storeId,
      date,
      memo: d.memo ?? "",
      saved: true,
      shifts,
      attendance: (d.attendance ?? []).filter((a) => known.has(a.client_id)),
      runs: (d.runs ?? []).map((r) => ({ ...r, key: `r${n++}`, riders: r.riders.filter((x) => known.has(x.client_id)) })),
      training: (d.training ?? []).filter((t) => known.has(t.client_id)),
      duties: normalizeDuties(d.duties ?? []),
      tasks: d.tasks ?? [],
    };
  }
  // 未保存の日: 曜日別利用者枠から出席予定を作る
  const wd = new Date(`${date}T00:00:00`).getDay();
  const attendance = clients
    .filter((c) => c.status === "利用中")
    .flatMap((c) => c.slots.filter((s) => s.weekday === wd).map((s) => ({ client_id: c.id, session: s.session, status: "present" as const, reason: "", extra: 0, note: "" })));
  return { store_id: storeId, date, memo: "", saved: false, shifts, attendance, runs: [], training: [], duties: [], tasks: [] };
}

export async function saveDaily(detail: DailyDetail) {
  const ym = detail.date.slice(0, 7);
  const shiftDoc = (await api.get<CellsDoc>("shifts", `${detail.store_id}:${ym}`))?.data.cells ?? {};
  const cells = { ...shiftDoc };
  // その日のシフトをシフト表へ反映（急な休みなど）
  for (const s of detail.shifts) {
    const k = `${s.staff_id}|${detail.date}`;
    if (s.code) cells[k] = s.code;
    else delete cells[k];
  }
  const doc: DailyDoc & { updated_at: string } = {
    memo: detail.memo,
    attendance: detail.attendance.map((a) => ({ ...a, reason: a.status === "absent" ? a.reason : "" })),
    runs: detail.runs.map((r) => ({ ...r, key: "" })),
    training: detail.training,
    duties: detail.duties,
    tasks: detail.tasks.filter((t) => t.task.trim()),
    updated_at: new Date().toISOString(),
  };
  await api.batch([put("daily", `${detail.store_id}:${detail.date}`, doc), put("shifts", `${detail.store_id}:${ym}`, { cells })]);
}

async function dailyDocsBetween(storeId: number, from: string, to: string) {
  return (await api.list<DailyDoc>("daily", { from: `${storeId}:${from}`, to: `${storeId}:${to}` })).map((d) => ({
    date: d.id.split(":")[1],
    ...d.data,
  }));
}

/** 前回の運転者（朝・昼・帰り × 車両）と直近 2 週間の運転回数。過去 60 日分を見る。 */
export async function buildHistories(storeId: number, date: string): Promise<{ transport: TransportHistory; training: TrainingHistory }> {
  const docs = (await dailyDocsBetween(storeId, addDays(date, -60), addDays(date, -1))).sort((a, b) => (a.date < b.date ? 1 : -1));
  const since14 = addDays(date, -14);
  const lastDriver = new Map<string, number>();
  const driveCounts = new Map<number, number>();
  const lastStaff = new Map<number, number>();
  const counts = new Map<number, number>();
  for (const d of docs) {
    const counted = new Set<string>();
    for (const r of (d.runs ?? []) as DailyRun[]) {
      if (r.driver_id == null || r.vehicle_id == null) continue;
      const k = `${driverGroupOf(r.run as RunKind)}|${r.vehicle_id}`;
      if (!lastDriver.has(k)) lastDriver.set(k, r.driver_id);
      if (d.date >= since14 && !counted.has(k)) {
        counted.add(k);
        driveCounts.set(r.driver_id, (driveCounts.get(r.driver_id) ?? 0) + 1);
      }
    }
    for (const t of [...(d.training ?? [])].sort((a, b) => (a.session < b.session ? 1 : -1))) {
      if (t.staff_id == null) continue;
      if (!lastStaff.has(t.client_id)) lastStaff.set(t.client_id, t.staff_id);
      if (d.date >= since14) counts.set(t.staff_id, (counts.get(t.staff_id) ?? 0) + 1);
    }
  }
  return { transport: { lastDriver, driveCounts }, training: { lastStaff, counts } };
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

export async function listClientDailyNotes(client: Client, ym: string, staff: Staff[]): Promise<DailyNote[]> {
  const dates = monthDates(ym);
  const docs = await dailyDocsBetween(client.store_id, dates[0], dates[dates.length - 1]);
  const sname = new Map(staff.map((s) => [s.id, s.name]));
  const out: DailyNote[] = [];
  for (const d of docs.sort((a, b) => (a.date < b.date ? -1 : 1))) {
    for (const a of (d.attendance ?? []).filter((x) => x.client_id === client.id).sort((x, y) => (x.session < y.session ? -1 : 1))) {
      const t = (d.training ?? []).find((x) => x.client_id === client.id && x.session === a.session);
      out.push({ date: d.date, session: a.session, status: a.status, reason: a.reason, note: a.note, trainer: t?.staff_id != null ? (sname.get(t.staff_id) ?? null) : null });
    }
  }
  return out;
}

export async function monthAttendanceStats(storeId: number, ym: string): Promise<Map<number, { present: number; absent: number; notes: number }>> {
  const dates = monthDates(ym);
  const docs = await dailyDocsBetween(storeId, dates[0], dates[dates.length - 1]);
  const m = new Map<number, { present: number; absent: number; notes: number }>();
  for (const d of docs)
    for (const a of d.attendance ?? []) {
      const s = m.get(a.client_id) ?? { present: 0, absent: 0, notes: 0 };
      if (a.status === "present") s.present++;
      else s.absent++;
      if (a.note) s.notes++;
      m.set(a.client_id, s);
    }
  return m;
}

export async function getMonthlyReport(clientId: number, ym: string): Promise<MonthlyReport | undefined> {
  const d = await api.get<Omit<MonthlyReport, "id" | "client_id" | "ym">>("monthly", `${clientId}:${ym}`);
  return d ? { id: 0, client_id: clientId, ym, ...d.data, updated_at: d.updated_at } : undefined;
}
export async function listMonthlyReports(ym: string): Promise<MonthlyReport[]> {
  return (await api.list<Omit<MonthlyReport, "id" | "client_id" | "ym">>("monthly", { suffix: `:${ym}` })).map((d) => ({
    id: 0,
    client_id: Number(d.id.split(":")[0]),
    ym,
    ...d.data,
    updated_at: d.updated_at,
  }));
}
export async function saveMonthlyReport(clientId: number, ym: string, keywords: string, body: string) {
  await api.batch([put("monthly", `${clientId}:${ym}`, { keywords, body })]);
}

export async function counts() {
  const [stores, staff, clients] = await Promise.all([api.list("stores"), api.list("staff"), api.list("clients")]);
  return { stores: stores.length, staff: staff.length, clients: clients.length };
}
