import type { DailyAttendance } from "./types";

const k = (a: Pick<DailyAttendance, "client_id" | "session">) => `${a.client_id}|${a.session}`;

/**
 * 保存済みの日の出席予定を、いまの曜日別利用者の枠に合わせる。
 *  - 枠にある方: 保存済みの記録（お休み・メモ）があればそのまま、無ければ「出席」で追加
 *  - 枠に無くなった方: 外す（臨時利用として入れた方は残す）
 */
export function syncAttendance(
  current: DailyAttendance[],
  scheduled: DailyAttendance[],
): { attendance: DailyAttendance[]; added: DailyAttendance[]; removed: DailyAttendance[] } {
  const cur = new Map(current.map((a) => [k(a), a]));
  const sch = new Set(scheduled.map(k));
  const added = scheduled.filter((a) => !cur.has(k(a)));
  const removed = current.filter((a) => !a.extra && !sch.has(k(a)));
  const attendance = [
    ...scheduled.map((a) => {
      const c = cur.get(k(a));
      return c ? { ...c, extra: 0 } : a;
    }),
    ...current.filter((a) => a.extra && !sch.has(k(a))),
  ];
  return { attendance, added, removed };
}
