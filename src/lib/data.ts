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
import { api, ApiError, type BatchOp } from "./api";
import { mergeCells, type CellConflict, type CellMap } from "./merge";
import { DEFAULT_DAYS, DEFAULT_PATTERNS, joinList, normalizeDuties, normalizeSkills, shiftWorks, splitList, type RunKind, type Session } from "./constants";
import type { ImportedClient, ImportedStaff } from "./import";
import { cmKey, type ImportedCareManager } from "./caremanager-import";
import type { AddressEntry } from "./address-book";
import { hasPoint } from "./geo";
import { normalizeName } from "./import";
import { driverGroupOf, type TransportHistory } from "./transport";
import type { TrainingHistory } from "./timetable";
import type {
  CareManager,
  Client,
  ClientSlot,
  DailyAttendance,
  DailyDetail,
  DailyRun,
  MonthlyReport,
  Office,
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
/** 保存済みの項目（位置など、画面に無い項目）を残して上書きする */
async function merged<T extends object>(c: string, id: number | undefined, data: T): Promise<T> {
  if (!id) return data;
  const cur = (await api.get<T>(c, id))?.data;
  return cur ? { ...cur, ...data } : data;
}
export async function saveStore(s: Omit<Store, "id"> & { id?: number }): Promise<number> {
  const data = await merged("stores", s.id, s);
  // 住所が変わったら位置を調べ直す
  if ((data.address ?? "") !== (data.geo_address ?? "")) Object.assign(data, { lat: null, lng: null });
  const id = await saveOne("stores", s.id, data);
  if (data.address && !hasPoint(data)) await locateStore(id).catch(() => undefined);
  return id;
}
/** 店舗の住所から位置を調べて保存する（見つからなければ null のまま） */
export async function locateStore(id: number): Promise<Store | undefined> {
  const s = (await api.get<Store>("stores", id))?.data;
  if (!s?.address) return s;
  const r = await api.geocode(s.address);
  const next = { ...s, lat: r?.lat ?? null, lng: r?.lng ?? null, geo_address: s.address };
  await api.batch([put("stores", id, next)]);
  return next;
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
    const skills = st.role.includes("機能訓練指導員") ? "個別機能訓練" : st.role === "ドライバー" ? "運転" : "";
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

// ---------------- 居宅・ケアマネ ----------------
const officeKey = (name: string) => cmKey(name, "");
const byName = <T extends { name: string; id: number }>(a: T, b: T) => a.name.localeCompare(b.name, "ja") || a.id - b.id;

export async function listOffices(): Promise<Office[]> {
  return (await all<Office>("offices")).sort(byName);
}
export async function listCareManagers(): Promise<CareManager[]> {
  return (await all<CareManager>("care_managers")).sort((a, b) => a.office.localeCompare(b.office, "ja") || a.name.localeCompare(b.name, "ja") || a.id - b.id);
}

/**
 * 以前の「1 行にケアマネ 1 人（事業所名・電話・FAX をケアマネごとに入力）」のデータを、
 * 「居宅 → 所属のケアマネ」の形に移す。居宅が未登録のケアマネがいるときだけ動く（何度呼んでも同じ結果）。
 *  - 同じ事業所名のケアマネを 1 つの居宅にまとめ、電話・FAX は居宅へ移す
 */
export async function migrateCareManagers(): Promise<number> {
  const [offices, cms] = await Promise.all([listOffices(), listCareManagers()]);
  const officeIds = new Set(offices.map((o) => o.id));
  const orphans = cms.filter((c) => c.office_id == null || !officeIds.has(c.office_id));
  if (orphans.length === 0) return 0;
  const byKey = new Map(offices.map((o) => [officeKey(o.name), o]));
  // まだ無い居宅を作る
  const groups = new Map<string, CareManager[]>();
  for (const c of orphans) {
    const name = c.office.trim() || "事業所名なし";
    groups.set(name, [...(groups.get(name) ?? []), c]);
  }
  const toCreate = [...groups.keys()].filter((name) => !byKey.has(officeKey(name)));
  const created = await api.batch(
    toCreate.map((name) => {
      const list = groups.get(name)!;
      return put("offices", null, {
        name,
        phone: list.map((c) => c.phone).find(Boolean) ?? "",
        fax: list.map((c) => c.fax).find(Boolean) ?? "",
        address: "",
        note: "",
      });
    }),
  );
  toCreate.forEach((name, i) => byKey.set(officeKey(name), { id: Number(created[i].id), name } as Office));
  const ops: BatchOp[] = [];
  for (const [name, list] of groups) {
    const o = byKey.get(officeKey(name))!;
    const officePhone = list.map((c) => c.phone).find(Boolean) ?? "";
    for (const c of list) {
      // 居宅の電話と同じ番号はケアマネ側から外す（違う番号は直通として残す）
      ops.push(put("care_managers", c.id, { ...c, office_id: o.id, office: o.name, phone: c.phone === officePhone ? "" : c.phone, fax: "" }));
    }
  }
  await api.batch(ops);
  return orphans.length;
}

export async function saveOffice(o: Omit<Office, "id"> & { id?: number }): Promise<number> {
  const id = await saveOne("offices", o.id, o);
  // 居宅名を変えたら、所属のケアマネの表示用の居宅名も直す
  if (o.id) {
    const cms = (await listCareManagers()).filter((c) => c.office_id === o.id && c.office !== o.name);
    await api.batch(cms.map((c) => put("care_managers", c.id, { ...c, office: o.name })));
  }
  return id;
}
/** 居宅を削除する（所属のケアマネがいるときは削除しない） */
export async function deleteOffice(id: number): Promise<boolean> {
  if ((await listCareManagers()).some((c) => c.office_id === id)) return false;
  await api.batch([del("offices", id)]);
  return true;
}
export async function saveCareManager(c: Omit<CareManager, "id" | "office" | "fax"> & { id?: number }) {
  const office = c.office_id ? (await api.get<Office>("offices", c.office_id))?.data : undefined;
  return saveOne("care_managers", c.id, { fax: "", ...(await merged("care_managers", c.id, c)), office: office?.name ?? "" });
}
/**
 * ケアマネ一覧の取り込み（1 行にケアマネ 1 人。事業所名・電話・FAX は居宅として登録）。
 *  - 同じ名前の居宅が無ければ作る。居宅の電話・FAX が空欄なら取り込んだ値を入れる
 *  - 同じ居宅に同じ名前のケアマネがいれば、空欄でない項目だけ上書きする
 */
export async function importCareManagers(list: ImportedCareManager[]): Promise<{ created: number; updated: number; offices: number }> {
  await migrateCareManagers();
  const [offices, cms] = await Promise.all([listOffices(), listCareManagers()]);
  const byKey = new Map(offices.map((o) => [officeKey(o.name), o]));
  // 居宅
  const officeOps: BatchOp[] = [];
  const newNames: string[] = [];
  for (const cm of list) {
    const name = cm.office.trim() || "事業所名なし";
    const cur = byKey.get(officeKey(name));
    if (cur) {
      if ((!cur.phone && cm.phone) || (!cur.fax && cm.fax)) {
        const next = { ...cur, phone: cur.phone || cm.phone, fax: cur.fax || cm.fax };
        byKey.set(officeKey(name), next);
        officeOps.push(put("offices", cur.id, next));
      }
    } else if (!newNames.some((n) => officeKey(n) === officeKey(name))) newNames.push(name);
  }
  const created = await api.batch(
    newNames.map((name) => {
      const first = list.find((cm) => officeKey(cm.office.trim() || "事業所名なし") === officeKey(name))!;
      return put("offices", null, { name, phone: first.phone, fax: first.fax, address: "", note: "" });
    }),
  );
  newNames.forEach((name, i) => byKey.set(officeKey(name), { id: Number(created[i].id), name, phone: "", fax: "", address: "", note: "" }));
  await api.batch(officeOps);
  // ケアマネ
  const ops: BatchOp[] = [];
  let createdCm = 0;
  let updated = 0;
  for (const cm of list) {
    const o = byKey.get(officeKey(cm.office.trim() || "事業所名なし"))!;
    const cur = cms.find((c) => c.office_id === o.id && cmKey("", c.name) === cmKey("", cm.name));
    if (cur) {
      ops.push(put("care_managers", cur.id, { ...cur, note: cm.note || cur.note }));
      updated++;
    } else {
      ops.push(put("care_managers", null, { office_id: o.id, office: o.name, name: cm.name, phone: "", fax: "", note: cm.note }));
      createdCm++;
    }
  }
  await api.batch(ops);
  return { created: createdCm, updated, offices: newNames.length };
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
  const data = await merged("clients", c.id, c);
  if ((data.address ?? "") !== (data.geo_address ?? "")) Object.assign(data, { lat: null, lng: null });
  const id = await saveOne("clients", c.id, data);
  if (data.address && !hasPoint(data)) await locateClients([{ ...data, id } as ClientWithSlots]).catch(() => undefined);
  return id;
}

/**
 * 住所録の取り込み。名前が同じ利用者（空白・様を除いて比べる）の住所を更新する。
 * 緯度・経度が住所録にあればそのまま使い、無ければあとで住所から調べる。
 */
export async function importAddresses(storeId: number, list: AddressEntry[]): Promise<{ matched: number; unmatched: string[] }> {
  const clients = await listClientsWithSlots(storeId, { includeEnded: true });
  const byName = new Map(clients.map((c) => [normalizeName(c.name), c]));
  const ops: BatchOp[] = [];
  const unmatched: string[] = [];
  for (const e of list) {
    const c = byName.get(e.name);
    if (!c) {
      unmatched.push(e.name);
      continue;
    }
    const given = e.lat != null && e.lng != null;
    const same = c.address === e.address && hasPoint(c);
    ops.push(
      put("clients", c.id, {
        ...c,
        address: e.address,
        lat: given ? e.lat : same ? c.lat : null,
        lng: given ? e.lng : same ? c.lng : null,
        geo_address: given || same ? e.address : "",
      }),
    );
  }
  await api.batch(ops);
  return { matched: ops.length, unmatched };
}

/** 位置がまだ分からない利用者（住所あり）の一覧 */
export function clientsToLocate(clients: ClientWithSlots[]): ClientWithSlots[] {
  return clients.filter((c) => c.address && c.geo_address !== c.address);
}

/**
 * 利用者の住所から位置を調べて保存する（1 件ずつ。10 件ごとに保存）。
 * 見つからなかった方は geo_address だけ入れて、同じ住所で何度も調べないようにする。
 */
export async function locateClients(
  targets: ClientWithSlots[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ located: number; notFound: string[] }> {
  let pending: BatchOp[] = [];
  let located = 0;
  const notFound: string[] = [];
  for (let i = 0; i < targets.length; i++) {
    const c = targets[i];
    const r = await api.geocode(c.address);
    if (r) located++;
    else notFound.push(c.name);
    pending.push(put("clients", c.id, { ...c, lat: r?.lat ?? null, lng: r?.lng ?? null, geo_address: c.address }));
    if (pending.length >= 10 || i === targets.length - 1) {
      await api.batch(pending);
      pending = [];
    }
    onProgress?.(i + 1, targets.length);
  }
  return { located, notFound };
}
export async function deleteClient(id: number) {
  const monthly = await api.list("monthly", { prefix: `${id}:` });
  await api.batch([del("clients", id), ...monthly.map((d) => del("monthly", d.id))]);
}
/**
 * 曜日別出席リストの取り込み。
 *  - 同じ名前の利用者は介護度などを更新し、貼り付けた時間帯（午前・午後）の曜日枠を置き換える
 *    （午前だけ貼り付けたときは、午後の曜日枠はそのまま残す）
 *  - 貼り付けた時間帯に名前が無かった利用者は、その時間帯の曜日枠を外す（やめた曜日が残らないように）
 */
export async function importClients(
  storeId: number,
  list: ImportedClient[],
  sessions: Session[] = ["am", "pm"],
): Promise<{ created: number; updated: number; removed: number }> {
  const covered = new Set(sessions);
  const all = await listClientsWithSlots(storeId, { includeEnded: true });
  const existing = new Map(all.map((c) => [normalizeName(c.name), c]));
  const keepOther = (c: ClientWithSlots) => c.slots.filter((x) => !covered.has(x.session));
  const ops: BatchOp[] = [];
  let created = 0;
  let updated = 0;
  let removed = 0;
  const imported = new Set<number>();
  for (const ic of list) {
    const cur = existing.get(ic.name);
    if (cur) {
      imported.add(cur.id);
      ops.push(
        put("clients", cur.id, {
          ...cur,
          care_level: ic.care_level || cur.care_level,
          gender: ic.gender || cur.gender,
          age: ic.age ?? cur.age,
          new_flag: ic.new_flag || cur.new_flag,
          status: cur.status === "終了" ? "利用中" : cur.status,
          slots: sortSlots([...keepOther(cur), ...ic.slots.filter((x) => covered.has(x.session))]),
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
          slots: sortSlots(ic.slots),
        }),
      );
      created++;
    }
  }
  for (const c of all) {
    if (imported.has(c.id) || !c.slots.some((x) => covered.has(x.session))) continue;
    ops.push(put("clients", c.id, { ...c, slots: keepOther(c) }));
    removed++;
  }
  await api.batch(ops);
  return { created, updated, removed };
}
const sortSlots = (xs: { weekday: number; session: Session }[]) =>
  [...xs].sort((a, b) => a.weekday - b.weekday || a.session.localeCompare(b.session));

/** 曜日別利用者の枠から、その日の出席予定を作る（臨時利用・お休みの記録は呼び出し側で残す） */
export function scheduledAttendance(clients: ClientWithSlots[], date: string): DailyAttendance[] {
  const wd = new Date(`${date}T00:00:00`).getDay();
  return clients
    .filter((c) => c.status === "利用中")
    .flatMap((c) => c.slots.filter((s) => s.weekday === wd).map((s) => ({ client_id: c.id, session: s.session, status: "present" as const, reason: "", extra: 0, note: "" })));
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
/** 版つきで 1 件読む（版が無い古いデータは 0） */
async function getWithRev<T>(c: string, id: string): Promise<{ data: T | undefined; rev: number; updated_at: string }> {
  const d = await api.get<T>(c, id);
  return { data: d?.data, rev: d ? revOf(d.data) : 0, updated_at: d?.updated_at ?? "" };
}
const isConflict = (e: unknown, c?: string) => e instanceof ApiError && e.status === 409 && (!c || e.conflict?.c === c);
export const cellMapOf = (cells: Cell[]): CellMap => Object.fromEntries(cells.filter((c) => c.code).map((c) => [`${c.staff_id}|${c.date}`, c.code]));

/** シフト表（その店舗・その月）と、その月の希望休を、版つきで読む */
export async function getShiftMonth(storeId: number, staffIds: number[], ym: string): Promise<{ cells: Cell[]; requests: Cell[]; rev: number }> {
  const ids = new Set(staffIds);
  const [s, r] = await Promise.all([getWithRev<CellsDoc>("shifts", `${storeId}:${ym}`), getWithRev<CellsDoc>("shift_requests", ym)]);
  return { cells: toCells(s.data?.cells ?? {}), requests: toCells(r.data?.cells ?? {}).filter((c) => ids.has(c.staff_id)), rev: s.rev };
}
/** シフト表の版だけを読む（別の端末で保存されたかを確かめる） */
export async function getShiftRev(storeId: number, ym: string): Promise<number> {
  return (await getWithRev<CellsDoc>("shifts", `${storeId}:${ym}`)).rev;
}

export type ShiftSaveResult =
  | { status: "saved"; cells: CellMap; requests: CellMap; rev: number; fromOthers: number }
  | { status: "conflict"; conflicts: CellConflict[] };
/**
 * シフト表を保存する。サーバーの最新の内容を読み直し、この画面で変えたマスだけを重ねて保存する
 * （別の端末で別のマスを直していても消えない）。同じマスを両方で違う内容にしていたら conflict を返す
 * （prefer を付けて呼び直すと、こちら／向こうを優先して保存する）。
 */
export async function saveShiftMonth(
  storeId: number,
  ym: string,
  base: { cells: CellMap; requests: CellMap },
  mine: { cells: CellMap; requests: CellMap },
  prefer?: "mine" | "theirs",
): Promise<ShiftSaveResult> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const [s, r] = await Promise.all([getWithRev<CellsDoc>("shifts", `${storeId}:${ym}`), getWithRev<CellsDoc>("shift_requests", ym)]);
    const mc = mergeCells(base.cells, mine.cells, s.data?.cells ?? {}, prefer);
    if (mc.conflicts.length) return { status: "conflict", conflicts: mc.conflicts };
    const mr = mergeCells(base.requests, mine.requests, r.data?.cells ?? {}, "mine");
    try {
      const res = await api.batch([
        { ...put("shifts", `${storeId}:${ym}`, { cells: mc.merged }), rev: s.rev } as BatchOp,
        { ...put("shift_requests", ym, { cells: mr.merged }), rev: r.rev } as BatchOp,
      ]);
      return { status: "saved", cells: mc.merged, requests: mr.merged, rev: res[0]?.rev ?? s.rev + 1, fromOthers: mc.fromOthers };
    } catch (e) {
      if (!isConflict(e)) throw e; // 読み直してから保存するまでの間に別の端末が保存した → もう一度
    }
  }
  throw new Error("ほかの端末からの保存が続いているため保存できませんでした。少し待ってからもう一度保存してください。");
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
      rev: revOf(d),
      updated_at: dailyDoc.updated_at,
    };
  }
  // 未保存の日: 曜日別利用者枠から出席予定を作る
  const attendance = scheduledAttendance(clients, date);
  return { store_id: storeId, date, memo: "", saved: false, shifts, attendance, runs: [], training: [], duties: [], tasks: [], rev: 0, updated_at: "" };
}

export type DailySaveResult = { status: "saved"; rev: number } | { status: "conflict"; rev: number; updated_at: string | null };
/**
 * 日々のスケジュールを保存する。
 *  - detail.rev（画面を開いたときの版）のあとに別の端末でこの日が保存されていたら、保存せずに conflict を返す
 *    （向こうの版 rev を渡して呼び直すと、こちらの内容で上書きする）
 *  - その日の勤務の変更はシフト表へ反映する。シフト表は最新を読み直して、この画面で変えた人の分だけ重ねる
 */
export async function saveDaily(detail: DailyDetail, baseShifts: { staff_id: number; code: string }[], rev = detail.rev ?? 0): Promise<DailySaveResult> {
  const ym = detail.date.slice(0, 7);
  const baseCode = new Map(baseShifts.map((s) => [s.staff_id, s.code]));
  const doc = {
    memo: detail.memo,
    attendance: detail.attendance.map((a) => ({ ...a, reason: a.status === "absent" ? a.reason : "" })),
    // 空のグループ（車両・運転者も未定）は保存しない
    runs: detail.runs.filter((r) => r.riders.length > 0 || r.vehicle_id != null || r.driver_id != null).map((r) => ({ ...r, key: "" })),
    training: detail.training,
    duties: detail.duties,
    tasks: detail.tasks.filter((t) => t.task.trim()),
    updated_at: new Date().toISOString(),
  };
  for (let attempt = 0; attempt < 5; attempt++) {
    const shift = await getWithRev<CellsDoc>("shifts", `${detail.store_id}:${ym}`);
    const cells = { ...(shift.data?.cells ?? {}) };
    // その日の勤務の変更（急な休みなど）をシフト表へ。この画面で変えた人の分だけ
    for (const s of detail.shifts) {
      if (s.code === (baseCode.get(s.staff_id) ?? "")) continue;
      const k = `${s.staff_id}|${detail.date}`;
      if (s.code) cells[k] = s.code;
      else delete cells[k];
    }
    try {
      const res = await api.batch([
        { ...put("daily", `${detail.store_id}:${detail.date}`, doc), rev } as BatchOp,
        { ...put("shifts", `${detail.store_id}:${ym}`, { cells }), rev: shift.rev } as BatchOp,
      ]);
      return { status: "saved", rev: res[0]?.rev ?? rev + 1 };
    } catch (e) {
      if (isConflict(e, "daily")) return { status: "conflict", rev: (e as ApiError).conflict!.rev, updated_at: (e as ApiError).conflict!.updated_at };
      if (!isConflict(e, "shifts")) throw e; // シフト表だけが先に保存されていた → 読み直してもう一度
    }
  }
  throw new Error("ほかの端末からの保存が続いているため保存できませんでした。少し待ってからもう一度保存してください。");
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
  return d ? { id: 0, client_id: clientId, ym, ...d.data, updated_at: d.updated_at, rev: revOf(d.data) } : undefined;
}
export async function listMonthlyReports(ym: string): Promise<MonthlyReport[]> {
  return (await api.list<Omit<MonthlyReport, "id" | "client_id" | "ym">>("monthly", { suffix: `:${ym}` })).map((d) => ({
    id: 0,
    client_id: Number(d.id.split(":")[0]),
    ym,
    ...d.data,
    updated_at: d.updated_at,
    rev: revOf(d.data),
  }));
}
/**
 * 月次報告を保存する。rev は画面を開いたとき（または前回保存したとき）の版。
 * そのあと別のパソコン・端末で保存されていたら上書きせず、ApiError（status 409）になる。
 * 保存できたら新しい版を返す。
 */
export async function saveMonthlyReport(clientId: number, ym: string, keywords: string, body: string, rev: number): Promise<number> {
  const [r] = await api.batch([{ ...put("monthly", `${clientId}:${ym}`, { keywords, body }), rev } as BatchOp]);
  return r?.rev ?? rev + 1;
}
const revOf = (data: unknown) => Number((data as { _rev?: number } | null)?._rev ?? 0);

export async function counts() {
  const [stores, staff, clients] = await Promise.all([api.list("stores"), api.list("staff"), api.list("clients")]);
  return { stores: stores.length, staff: staff.length, clients: clients.length };
}
