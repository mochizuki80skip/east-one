/**
 * 個別機能訓練・整体の時間割（純粋関数・DB非依存）。
 *
 *  - 時間枠ごとに同時に入れる人数 = min(枠の定員, 担当できる出勤者数)
 *  - 利用者は到着順（送迎の順番）に早い枠から入れる
 *  - 同じ枠で 1 人のスタッフが 2 人を担当しない / その利用者の前回の担当を避ける / 担当数を平準化する
 *  - 手で固定した割り当て（locked）は尊重する
 */
import { inc, pickBest, SAME_AS_LAST_PENALTY, TODAY_LOAD_WEIGHT } from "./pick";

export type TrainingHistory = {
  /** 利用者 -> 前回の担当 */
  lastStaff: Map<number, number>;
  /** 直近期間の担当回数 */
  counts: Map<number, number>;
};

export type TrainingAssignment = { slot: string | null; staffId: number | null };

export function planTraining(opts: {
  clientIds: number[];
  slots: string[];
  capacity: number;
  staff: { id: number; sortOrder: number }[];
  history: TrainingHistory;
  locked?: Map<number, TrainingAssignment>;
}): { result: Map<number, TrainingAssignment>; overflow: number[] } {
  const { clientIds, slots, history } = opts;
  const staff = [...opts.staff].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  const perSlot = Math.max(1, staff.length > 0 ? Math.min(opts.capacity, staff.length) : opts.capacity);
  const result = new Map<number, TrainingAssignment>();
  const usedInSlot = new Map<string, Set<number>>();
  const countInSlot = new Map<string, number>();
  const todayLoad = new Map<number, number>();
  const overflow: number[] = [];

  for (const [cid, a] of opts.locked ?? []) {
    if (!clientIds.includes(cid) || !a.slot) continue;
    result.set(cid, a);
    inc(countInSlot, a.slot);
    if (a.staffId != null) {
      usedInSlot.set(a.slot, (usedInSlot.get(a.slot) ?? new Set()).add(a.staffId));
      inc(todayLoad, a.staffId);
    }
  }

  for (const cid of clientIds) {
    if (result.has(cid)) continue;
    const slot = slots.find((s) => (countInSlot.get(s) ?? 0) < perSlot);
    if (!slot) {
      overflow.push(cid);
      result.set(cid, { slot: null, staffId: null });
      continue;
    }
    inc(countInSlot, slot);
    const used = usedInSlot.get(slot) ?? new Set<number>();
    const best = pickBest(
      staff.filter((s) => !used.has(s.id)),
      (s) =>
        (history.lastStaff.get(cid) === s.id ? SAME_AS_LAST_PENALTY : 0) +
        (todayLoad.get(s.id) ?? 0) * TODAY_LOAD_WEIGHT +
        (history.counts.get(s.id) ?? 0),
    );
    if (best) {
      used.add(best.id);
      usedInSlot.set(slot, used);
      inc(todayLoad, best.id);
    }
    result.set(cid, { slot, staffId: best?.id ?? null });
  }
  return { result, overflow };
}
