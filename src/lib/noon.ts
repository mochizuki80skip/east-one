/**
 * 昼送迎（昼送車＋昼迎車）を、車両ごとに 1 つのセルへまとめて表示するための整形。
 *   送り：〇〇→〇〇
 *   迎え：→〇〇→〇〇
 */
import type { DailyRun } from "./types";

export type NoonRow = {
  vehicle_id: number | null;
  driver_ids: number[];
  escort_ids: number[];
  drop_time: string;
  pick_time: string;
  /** 送り（昼送車）の乗車順の利用者 */
  drop: number[];
  /** 迎え（昼迎車）の乗車順の利用者 */
  pick: number[];
};

const byOrder = (r: DailyRun) => [...r.riders].sort((a, b) => a.seq - b.seq).map((x) => x.client_id);
const uniq = (xs: (number | null)[]) => [...new Set(xs.filter((x): x is number => x != null))];

/** 昼送車・昼迎車を車両ごとにまとめる（車両の並びは昼送車→昼迎車の順に出てきた順） */
export function noonRows(runs: DailyRun[]): NoonRow[] {
  const noon = runs.filter((r) => r.run === "noon_drop" || r.run === "noon_pick");
  const order: (number | null)[] = [];
  for (const r of [...noon.filter((r) => r.run === "noon_drop"), ...noon.filter((r) => r.run === "noon_pick")])
    if (!order.includes(r.vehicle_id)) order.push(r.vehicle_id);
  return order.map((vid) => {
    const mine = noon.filter((r) => r.vehicle_id === vid);
    const drops = mine.filter((r) => r.run === "noon_drop");
    const picks = mine.filter((r) => r.run === "noon_pick");
    return {
      vehicle_id: vid,
      driver_ids: uniq(mine.map((r) => r.driver_id)),
      escort_ids: uniq(mine.map((r) => r.escort_id)),
      drop_time: drops.map((r) => r.depart_time).find(Boolean) ?? "",
      pick_time: picks.map((r) => r.depart_time).find(Boolean) ?? "",
      drop: drops.flatMap(byOrder),
      pick: picks.flatMap(byOrder),
    };
  });
}

/** 「送り：A→B」「迎え：→C→D」の文字。いないときは「なし」 */
export function noonText(drop: string[], pick: string[]): { drop: string; pick: string } {
  return {
    drop: `送り：${drop.length ? drop.join("→") : "なし"}`,
    pick: `迎え：${pick.length ? `→${pick.join("→")}` : "なし"}`,
  };
}
