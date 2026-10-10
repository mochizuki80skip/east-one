"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  deleteCareManager,
  deleteClient,
  deleteRoute,
  deleteStaff,
  deleteStore,
  deleteVehicle,
  importClients,
  importStaff,
  saveCareManager,
  saveClient,
  saveRoute,
  saveStaff,
  saveStore,
  saveVehicle,
} from "@/lib/repo";
import { parseStaffSheet, parseWeeklyList } from "@/lib/import";
import { joinList, SKILLS, type Session } from "@/lib/constants";
import { seedSample } from "@/lib/seed";
import { flag, ids, num, optId, str } from "./form";

// ---------- 店舗 ----------
export async function saveStoreAction(fd: FormData) {
  const name = str(fd, "name");
  if (!name) return;
  const slots = (k: string) =>
    str(fd, k)
      .split(/[,、\s]+/)
      .map((s) => s.trim())
      .filter((s) => /^\d{1,2}:\d{2}$/.test(s))
      .join(",");
  const id = saveStore({
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
    closed_weekdays: joinList(ids(fd, "closed_weekdays")),
    am_slots: slots("am_slots"),
    pm_slots: slots("pm_slots"),
    slot_capacity: num(fd, "slot_capacity", 5),
    sort_order: num(fd, "sort_order"),
  });
  revalidatePath("/", "layout");
  if (!optId(fd, "id")) redirect(`/s/${id}/settings`);
}

export async function deleteStoreAction(fd: FormData) {
  const id = optId(fd, "id");
  if (id) deleteStore(id);
  revalidatePath("/", "layout");
  redirect("/");
}

// ---------- 車両・ルート ----------
export async function saveVehicleAction(fd: FormData) {
  const storeId = optId(fd, "store_id");
  const name = str(fd, "name");
  if (!storeId || !name) return;
  saveVehicle({
    id: optId(fd, "id") ?? undefined,
    store_id: storeId,
    name,
    capacity: num(fd, "capacity", 4),
    sort_order: num(fd, "sort_order"),
    active: flag(fd, "active"),
    driverIds: ids(fd, "driver_ids"),
  });
  revalidatePath(`/s/${storeId}/settings`);
}

export async function deleteVehicleAction(fd: FormData) {
  const storeId = optId(fd, "store_id");
  const id = optId(fd, "id");
  if (storeId && id) deleteVehicle(storeId, id);
  revalidatePath(`/s/${storeId}/settings`);
}

export async function saveRouteAction(fd: FormData) {
  const storeId = optId(fd, "store_id");
  const name = str(fd, "name");
  if (!storeId || !name) return;
  saveRoute({
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
  revalidatePath(`/s/${storeId}/settings`);
}

export async function deleteRouteAction(fd: FormData) {
  const storeId = optId(fd, "store_id");
  const id = optId(fd, "id");
  if (storeId && id) deleteRoute(storeId, id);
  revalidatePath(`/s/${storeId}/settings`);
}

// ---------- スタッフ ----------
export async function saveStaffAction(fd: FormData) {
  const name = str(fd, "name");
  if (!name) return;
  const skills = fd.getAll("skills").map(String).filter((s) => (SKILLS as readonly string[]).includes(s));
  saveStaff({
    id: optId(fd, "id") ?? undefined,
    name,
    status: str(fd, "status") || "在籍",
    employment: str(fd, "employment") || "A",
    role: str(fd, "role"),
    skills: joinList(skills),
    days_per_week: Math.min(7, Math.max(0, num(fd, "days_per_week", 5))),
    available_weekdays: joinList(ids(fd, "available_weekdays")),
    note: str(fd, "note"),
    sort_order: num(fd, "sort_order"),
    storeIds: ids(fd, "store_ids"),
  });
  revalidatePath("/staff");
  redirect(str(fd, "back") || "/staff");
}

export async function deleteStaffAction(fd: FormData) {
  const id = optId(fd, "id");
  if (id) deleteStaff(id);
  revalidatePath("/staff");
  redirect("/staff");
}

export async function importStaffAction(storeId: number, tsv: string) {
  const list = parseStaffSheet(tsv);
  const r = importStaff(storeId, list);
  revalidatePath("/staff");
  return { found: list.length, ...r };
}

// ---------- ケアマネ ----------
export async function saveCareManagerAction(fd: FormData) {
  const name = str(fd, "name");
  if (!name) return;
  saveCareManager({
    id: optId(fd, "id") ?? undefined,
    name,
    office: str(fd, "office"),
    phone: str(fd, "phone"),
    fax: str(fd, "fax"),
    note: str(fd, "note"),
  });
  revalidatePath("/caremanagers");
}

export async function deleteCareManagerAction(fd: FormData) {
  const id = optId(fd, "id");
  if (id) deleteCareManager(id);
  revalidatePath("/caremanagers");
}

// ---------- 利用者 ----------
export async function saveClientAction(fd: FormData) {
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
  saveClient({
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
  revalidatePath(`/s/${storeId}`, "layout");
  redirect(str(fd, "back") || `/s/${storeId}/clients`);
}

export async function deleteClientAction(fd: FormData) {
  const storeId = optId(fd, "store_id");
  const id = optId(fd, "id");
  if (id) deleteClient(id);
  revalidatePath(`/s/${storeId}`, "layout");
  redirect(`/s/${storeId}/clients`);
}

export async function importClientsAction(storeId: number, tsv: string) {
  const { clients, skipped } = parseWeeklyList(tsv);
  const r = importClients(storeId, clients);
  revalidatePath(`/s/${storeId}`, "layout");
  return { found: clients.length, skipped, ...r };
}

export async function seedAction() {
  const id = seedSample();
  revalidatePath("/", "layout");
  if (id) redirect(`/s/${id}/weekly`);
}
