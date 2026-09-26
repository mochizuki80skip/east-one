import { getDb } from "./db";
import { counts, upsertClient, upsertCourse, upsertStaff } from "./repo";

/** デモ用のサンプルデータ（空のDBにのみ投入） */
export function seedIfEmpty(): boolean {
  const c = counts();
  if (c.staff + c.clients + c.courses > 0) return false;
  const db = getDb();
  const tx = db.transaction(() => {
    const staff = [
      ["山田", 1, 1],
      ["佐藤", 1, 1],
      ["鈴木", 1, 0],
      ["高橋", 0, 1],
      ["田中", 1, 1],
      ["伊藤", 1, 0],
    ] as const;
    staff.forEach(([name, drive, seitai], i) =>
      upsertStaff({ name, can_drive: drive, can_seitai: seitai, active: 1, sort_order: i + 1 }),
    );
    const courses = [
      ["迎え 1便 A（北）", "pickup", 1, 1],
      ["迎え 1便 B（南）", "pickup", 1, 2],
      ["迎え 2便（東）", "pickup", 2, 3],
      ["送り 1便 A（北）", "dropoff", 1, 1],
      ["送り 1便 B（南）", "dropoff", 1, 2],
      ["送り 2便（東）", "dropoff", 2, 3],
    ] as const;
    courses.forEach(([name, kind, slot, order]) => upsertCourse({ name, kind, slot, sort_order: order, active: 1 }));
    const ids = (db.prepare(`SELECT id, name FROM courses`).all() as { id: number; name: string }[]).reduce<Record<string, number>>(
      (acc, r) => ((acc[r.name] = r.id), acc),
      {},
    );
    const clients = [
      ["東 一郎", "要介護1", "北", 1, "迎え 1便 A（北）", "送り 1便 A（北）", "1,3,5"],
      ["西 花子", "要支援2", "南", 1, "迎え 1便 B（南）", "送り 1便 B（南）", "1,3,5"],
      ["南 太郎", "要介護2", "東", 0, "迎え 2便（東）", "送り 2便（東）", "2,4,6"],
      ["北 幸子", "要支援1", "北", 1, "迎え 1便 A（北）", "送り 1便 A（北）", "1,2,3,4,5,6"],
      ["中村 清", "要介護3", "南", 1, "迎え 1便 B（南）", "送り 1便 B（南）", "2,4"],
      ["小林 良子", "要支援2", "東", 0, "迎え 2便（東）", "送り 2便（東）", "1,3,5"],
      ["加藤 正", "要介護1", "北", 1, "迎え 1便 A（北）", "送り 1便 A（北）", "2,4,6"],
      ["渡辺 みどり", "事業対象者", "", 0, null, null, "1,3,5"],
    ] as const;
    for (const [name, level, area, seitai, pick, drop, days] of clients) {
      upsertClient({
        name,
        care_level: level,
        area,
        needs_seitai: seitai,
        pickup_course_id: pick ? ids[pick] : null,
        dropoff_course_id: drop ? ids[drop] : null,
        default_weekdays: days,
        active: 1,
        note: "",
      });
    }
  });
  tx();
  return true;
}
