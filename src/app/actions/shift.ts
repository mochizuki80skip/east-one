"use server";

import { revalidatePath } from "next/cache";
import { autoShift, checkShift, type DayCheck } from "@/lib/shift-auto";
import { getBusyElsewhere, getStore, listStaff, saveShiftMonth } from "@/lib/repo";
import { monthDates, isValidYm } from "@/lib/date";
import { splitList } from "@/lib/constants";

export type Cell = { staff_id: number; date: string; code: string };

function load(storeId: number, ym: string) {
  if (!isValidYm(ym)) throw new Error("invalid month");
  const store = getStore(storeId);
  if (!store) throw new Error("store not found");
  const staff = listStaff({ storeId, activeOnly: true });
  const dates = monthDates(ym);
  const rules = {
    required: store.required_staff,
    minNurse: store.min_nurse,
    minTrainer: store.min_trainer,
    closedWeekdays: splitList(store.closed_weekdays).map(Number),
  };
  return { store, staff, dates, rules };
}

/** 自動作成。mode=fill は入力済みのセルを残し、空欄だけ埋める。 */
export async function autoShiftAction(
  storeId: number,
  ym: string,
  cells: Cell[],
  requests: Cell[],
  mode: "fill" | "all",
): Promise<{ cells: Cell[]; checks: DayCheck[] }> {
  const { staff, dates, rules } = load(storeId, ym);
  const staffIds = staff.map((s) => s.id);
  const k = (c: Cell) => `${c.staff_id}|${c.date}`;
  const { grid, checks } = autoShift({
    dates,
    rules,
    staff: staff.map((s) => ({
      id: s.id,
      role: s.role,
      days_per_week: s.days_per_week,
      available_weekdays: splitList(s.available_weekdays).map(Number),
      sort_order: s.sort_order,
    })),
    requests: new Map(requests.filter((r) => r.code).map((r) => [k(r), r.code])),
    locked: mode === "fill" ? new Map(cells.filter((c) => c.code).map((c) => [k(c), c.code])) : new Map(),
    busyElsewhere: getBusyElsewhere(storeId, staffIds, dates[0], dates[dates.length - 1]),
  });
  const out: Cell[] = [];
  for (const [key, code] of grid) {
    const [sid, date] = key.split("|");
    out.push({ staff_id: Number(sid), date, code });
  }
  return { cells: out, checks };
}

export async function checkShiftAction(storeId: number, ym: string, cells: Cell[]): Promise<DayCheck[]> {
  const { staff, dates, rules } = load(storeId, ym);
  return checkShift(dates, staff, rules, new Map(cells.map((c) => [`${c.staff_id}|${c.date}`, c.code])));
}

export async function saveShiftAction(storeId: number, ym: string, cells: Cell[], requests: Cell[]) {
  const { staff, dates } = load(storeId, ym);
  const allowed = new Set(staff.map((s) => s.id));
  const inMonth = (c: Cell) => allowed.has(c.staff_id) && c.date >= dates[0] && c.date <= dates[dates.length - 1];
  saveShiftMonth(storeId, dates[0], dates[dates.length - 1], [...allowed], cells.filter(inMonth), requests.filter(inMonth));
  revalidatePath(`/s/${storeId}`, "layout");
  return { savedAt: new Date().toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo" }) };
}
