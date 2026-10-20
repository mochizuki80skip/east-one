/** 入力フォームの内容を読み取り、保存する（ブラウザ側） */
import { CONTRACTS, isTimeRange, joinList, SKILLS, splitList, type Session } from "./constants";
import {
  importClients,
  importStaff,
  saveCareManager,
  saveClient,
  saveRoute,
  saveStaff,
  saveStore,
  saveVehicle,
} from "./data";
import { parseStaffSheet, parseWeeklyList } from "./import";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string, dflt = 0) => {
  const raw = str(fd, k);
  const v = Number(raw);
  return raw !== "" && Number.isFinite(v) ? v : dflt;
};
const flag = (fd: FormData, k: string) => (fd.get(k) ? 1 : 0);
const optId = (fd: FormData, k: string) => {
  const v = Number(str(fd, k));
  return Number.isInteger(v) && v > 0 ? v : null;
};
const ids = (fd: FormData, k: string) =>
  fd
    .getAll(k)
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n));

export async function submitStore(fd: FormData): Promise<number | null> {
  const name = str(fd, "name");
  if (!name) return null;
  const slots = (k: string, dflt: string) =>
    fd.has(k)
      ? str(fd, k)
          .split(/[,、\s]+/)
          .map((s) => s.trim())
          .filter((s) => /^\d{1,2}:\d{2}$/.test(s))
          .join(",")
      : dflt;
  return saveStore({
    id: optId(fd, "id") ?? undefined,
    name,
    display_name: str(fd, "display_name"),
    phone: str(fd, "phone"),
    contact_name: str(fd, "contact_name"),
    capacity_am: num(fd, "capacity_am", 18),
    capacity_pm: num(fd, "capacity_pm", 18),
    required_staff: num(fd, "required_staff", 5),
    min_nurse: num(fd, "min_nurse", 1),
    min_trainer: num(fd, "min_trainer", 1),
    closed_weekdays: fd.has("closed_marker") ? joinList(ids(fd, "closed_weekdays")) : "0",
    am_slots: slots("am_slots", "9:45,10:00,10:10,10:25,10:35,10:50"),
    pm_slots: slots("pm_slots", "14:05,14:20,14:45,14:55,15:10,15:20"),
    slot_capacity: num(fd, "slot_capacity", 5),
    sort_order: num(fd, "sort_order"),
  });
}

export async function submitVehicle(fd: FormData) {
  const storeId = optId(fd, "store_id");
  const name = str(fd, "name");
  if (!storeId || !name) return;
  await saveVehicle({
    id: optId(fd, "id") ?? undefined,
    store_id: storeId,
    name,
    capacity: num(fd, "capacity", 4),
    sort_order: num(fd, "sort_order"),
    active: flag(fd, "active"),
    driverIds: ids(fd, "driver_ids"),
  });
}

export async function submitRoute(fd: FormData) {
  const storeId = optId(fd, "store_id");
  const name = str(fd, "name");
  if (!storeId || !name) return;
  await saveRoute({
    id: optId(fd, "id") ?? undefined,
    store_id: storeId,
    name,
    vehicle_id: optId(fd, "vehicle_id"),
    morning_time: str(fd, "morning_time"),
    noon_time: str(fd, "noon_time"),
    noon_pick_time: str(fd, "noon_pick_time"),
    evening_time: str(fd, "evening_time"),
    sort_order: num(fd, "sort_order"),
  });
}

/** スタッフを保存し、ID を返す */
export async function submitStaff(fd: FormData): Promise<number | undefined> {
  const name = str(fd, "name");
  if (!name) return;
  const skills = fd
    .getAll("skills")
    .map(String)
    .filter((s) => (SKILLS as readonly string[]).includes(s));
  return saveStaff({
    id: optId(fd, "id") ?? undefined,
    name,
    status: str(fd, "status") || "在籍",
    contract: (CONTRACTS as readonly string[]).includes(str(fd, "contract")) ? str(fd, "contract") : "",
    patterns: joinList([...new Set(splitList(str(fd, "patterns")).filter(isTimeRange))]),
    employment: str(fd, "employment") || "A",
    role: str(fd, "role"),
    skills: joinList(skills),
    days_per_week: Math.min(7, Math.max(0, num(fd, "days_per_week", 5))),
    available_weekdays: joinList(ids(fd, "available_weekdays")),
    note: str(fd, "note"),
    sort_order: num(fd, "sort_order"),
    storeIds: ids(fd, "store_ids"),
  });
}

export async function submitCareManager(fd: FormData) {
  const name = str(fd, "name");
  if (!name) return;
  await saveCareManager({
    id: optId(fd, "id") ?? undefined,
    name,
    office: str(fd, "office"),
    phone: str(fd, "phone"),
    fax: str(fd, "fax"),
    note: str(fd, "note"),
  });
}

export async function submitClient(fd: FormData) {
  const storeId = optId(fd, "store_id");
  const name = str(fd, "name");
  if (!storeId || !name) return;
  const slots = fd
    .getAll("slots")
    .map(String)
    .map((v) => {
      const [w, s] = v.split("|");
      return { weekday: Number(w), session: s as Session };
    })
    .filter((s) => s.weekday >= 0 && s.weekday <= 6 && (s.session === "am" || s.session === "pm"));
  const ageRaw = str(fd, "age");
  await saveClient({
    id: optId(fd, "id") ?? undefined,
    store_id: storeId,
    name,
    kana: str(fd, "kana"),
    care_level: str(fd, "care_level"),
    gender: str(fd, "gender"),
    birth_date: str(fd, "birth_date"),
    age: ageRaw ? Number(ageRaw) : null,
    care_manager_id: optId(fd, "care_manager_id"),
    status: str(fd, "status") || "利用中",
    new_flag: str(fd, "new_flag"),
    start_date: str(fd, "start_date"),
    route_id: optId(fd, "route_id"),
    route_order: num(fd, "route_order"),
    uses_transport: flag(fd, "uses_transport"),
    needs_training: flag(fd, "needs_training"),
    address: str(fd, "address"),
    note: str(fd, "note"),
    slots,
  });
}

export async function importClientsTsv(storeId: number, tsv: string, session?: Session) {
  const { clients, skipped, hint } = parseWeeklyList(tsv, session);
  if (clients.length === 0) return { found: 0, skipped, created: 0, updated: 0, hint };
  const r = await importClients(storeId, clients);
  return { found: clients.length, skipped, hint, ...r };
}

export async function importStaffTsv(storeId: number, tsv: string) {
  const list = parseStaffSheet(tsv);
  const r = await importStaff(storeId, list);
  return { found: list.length, ...r };
}
