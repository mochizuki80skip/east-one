/**
 * 送迎の配車ボード（ドラッグで利用者をグループへ入れる）の操作。純粋関数。
 * グループ = その便の 1 台分（DailyRun）。車両はあとから選べる（vehicle_id = null のまま）。
 */
import { RUNS, type RunKind } from "./constants";
import { sortByDistance, type Point } from "./geo";
import type { DailyRun } from "./types";

const dirOf = (run: RunKind) => RUNS.find((r) => r.key === run)!.dir as "pickup" | "dropoff";
const renumber = (riders: DailyRun["riders"]) => riders.map((r, i) => ({ ...r, seq: i + 1 }));

/**
 * 利用者をその便のグループへ入れる（同じ便の別のグループや未割り当てから移す）。
 *  - toKey が null なら未割り当てに戻す
 *  - toKey が newRun.key ならグループを新しく作って入れる
 *  - index はグループ内の位置（省略で最後）
 */
export function placeRider(
  runs: DailyRun[],
  run: RunKind,
  clientId: number,
  toKey: string | null,
  index?: number,
  newRun?: { key: string },
): DailyRun[] {
  let next = runs.map((r) =>
    r.run === run && r.riders.some((x) => x.client_id === clientId) ? { ...r, riders: renumber(r.riders.filter((x) => x.client_id !== clientId)) } : r,
  );
  if (toKey == null) return next;
  if (newRun && toKey === newRun.key && !next.some((r) => r.key === toKey)) {
    next = [...next, { key: newRun.key, run, vehicle_id: null, driver_id: null, escort_id: null, depart_time: "", riders: [] }];
  }
  return next.map((r) => {
    if (r.key !== toKey) return r;
    const list = [...r.riders];
    const at = index == null || index < 0 || index > list.length ? list.length : index;
    list.splice(at, 0, { client_id: clientId, direction: dirOf(run), seq: 0 });
    return { ...r, riders: renumber(list) };
  });
}

/** グループの乗車順を、店舗から近い順・遠い順に並べ替える（位置が分からない方は最後） */
export function sortRunByDistance(run: DailyRun, pointOf: (clientId: number) => Point | null, origin: Point, order: "near" | "far"): DailyRun {
  return { ...run, riders: renumber(sortByDistance(run.riders, (x) => pointOf(x.client_id), origin, order)) };
}

/** グループを解散する（乗っていた方は未割り当てに戻る） */
export const removeGroup = (runs: DailyRun[], key: string) => runs.filter((r) => r.key !== key);
