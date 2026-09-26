/**
 * 送迎・整体の自動割り当てロジック（純粋関数・DB非依存）。
 *
 * 方針:
 *  - 前回と同じ担当を避ける（連続で同じスタッフが入らない）
 *  - 当日の負荷（担当数）を平準化する
 *  - 直近期間の担当回数が少ない人を優先する
 *  - 同じ時間帯（slot）の送迎コースを1人が2つ運転しない
 *  - 手動で固定した割り当て（locked）は尊重する
 */

export type AssignStaff = {
  id: number;
  name: string;
  can_drive: number;
  can_seitai: number;
  sort_order: number;
};

export type AssignCourse = {
  id: number;
  kind: "pickup" | "dropoff";
  slot: number;
  sort_order: number;
};

export type AssignHistory = {
  /** コースID -> 前回そのコースを運転したスタッフID */
  lastCourseDriver: Map<number, number>;
  /** スタッフID -> 直近期間の運転回数 */
  driveCounts: Map<number, number>;
  /** 利用者ID -> 前回整体を担当したスタッフID */
  lastSeitaiStaff: Map<number, number>;
  /** スタッフID -> 直近期間の整体回数 */
  seitaiCounts: Map<number, number>;
};

export function emptyHistory(): AssignHistory {
  return {
    lastCourseDriver: new Map(),
    driveCounts: new Map(),
    lastSeitaiStaff: new Map(),
    seitaiCounts: new Map(),
  };
}

const SAME_AS_LAST_PENALTY = 1000;
const TODAY_LOAD_WEIGHT = 10;
const DRIVE_LOAD_WEIGHT = 3;

function byOrder(a: AssignStaff, b: AssignStaff) {
  return a.sort_order - b.sort_order || a.id - b.id;
}

/**
 * 送迎コースに運転担当を割り当てる。
 * @param locked 手動で固定済みの割り当て（course_id -> staff_id）。
 * @returns course_id -> staff_id | null（担当可能者なし）
 */
export function assignCourses(
  courses: AssignCourse[],
  onDuty: AssignStaff[],
  history: AssignHistory,
  locked: Map<number, number> = new Map(),
): Map<number, number | null> {
  const result = new Map<number, number | null>();
  const todayLoad = new Map<number, number>();
  // (kind, slot) ごとに使用済みスタッフ
  const usedInSlot = new Map<string, Set<number>>();
  const slotKey = (c: AssignCourse) => `${c.kind}:${c.slot}`;
  const drivers = onDuty.filter((s) => s.can_drive).sort(byOrder);
  const sorted = [...courses].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);

  // 固定分を先に反映
  for (const c of sorted) {
    const fixed = locked.get(c.id);
    if (fixed != null && onDuty.some((s) => s.id === fixed)) {
      result.set(c.id, fixed);
      todayLoad.set(fixed, (todayLoad.get(fixed) ?? 0) + 1);
      const set = usedInSlot.get(slotKey(c)) ?? new Set<number>();
      set.add(fixed);
      usedInSlot.set(slotKey(c), set);
    }
  }

  for (const c of sorted) {
    if (result.has(c.id)) continue;
    const used = usedInSlot.get(slotKey(c)) ?? new Set<number>();
    const candidates = drivers.filter((s) => !used.has(s.id));
    if (candidates.length === 0) {
      result.set(c.id, null);
      continue;
    }
    let best: AssignStaff | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const s of candidates) {
      const same = history.lastCourseDriver.get(c.id) === s.id ? SAME_AS_LAST_PENALTY : 0;
      const load = (todayLoad.get(s.id) ?? 0) * TODAY_LOAD_WEIGHT;
      const recent = history.driveCounts.get(s.id) ?? 0;
      const score = same + load + recent;
      if (score < bestScore) {
        bestScore = score;
        best = s;
      }
    }
    const chosen = best!;
    result.set(c.id, chosen.id);
    todayLoad.set(chosen.id, (todayLoad.get(chosen.id) ?? 0) + 1);
    used.add(chosen.id);
    usedInSlot.set(slotKey(c), used);
  }
  return result;
}

/**
 * 整体の担当を割り当てる。
 * @param clientIds 当日整体を行う利用者ID（出席者のみ）
 * @param locked 手動固定（client_id -> staff_id）
 * @param driveLoad 当日の送迎担当数（送迎が少ない人を優先するため）
 * @returns client_id -> staff_id | null
 */
export function assignSeitai(
  clientIds: number[],
  onDuty: AssignStaff[],
  history: AssignHistory,
  locked: Map<number, number> = new Map(),
  /** スタッフID -> 当日の送迎担当数。送迎が多い人には整体を回しにくくする */
  driveLoad: Map<number, number> = new Map(),
): Map<number, number | null> {
  const result = new Map<number, number | null>();
  const todayLoad = new Map<number, number>();
  const therapists = onDuty.filter((s) => s.can_seitai).sort(byOrder);

  for (const clientId of clientIds) {
    const fixed = locked.get(clientId);
    if (fixed != null && onDuty.some((s) => s.id === fixed)) {
      result.set(clientId, fixed);
      todayLoad.set(fixed, (todayLoad.get(fixed) ?? 0) + 1);
    }
  }

  for (const clientId of clientIds) {
    if (result.has(clientId)) continue;
    if (therapists.length === 0) {
      result.set(clientId, null);
      continue;
    }
    let best: AssignStaff | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const s of therapists) {
      const same = history.lastSeitaiStaff.get(clientId) === s.id ? SAME_AS_LAST_PENALTY : 0;
      const load = (todayLoad.get(s.id) ?? 0) * TODAY_LOAD_WEIGHT;
      const drive = (driveLoad.get(s.id) ?? 0) * DRIVE_LOAD_WEIGHT;
      const recent = history.seitaiCounts.get(s.id) ?? 0;
      const score = same + load + drive + recent;
      if (score < bestScore) {
        bestScore = score;
        best = s;
      }
    }
    const chosen = best!;
    result.set(clientId, chosen.id);
    todayLoad.set(chosen.id, (todayLoad.get(chosen.id) ?? 0) + 1);
  }
  return result;
}
