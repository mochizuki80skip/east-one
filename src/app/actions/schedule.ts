"use server";

import { revalidatePath } from "next/cache";
import { assignCourses, assignSeitai } from "@/lib/assign";
import { buildAssignHistory, listCourses, listStaff, saveScheduleDetail } from "@/lib/repo";
import type { ScheduleDetail } from "@/lib/types";
import { isValidDate } from "@/lib/date";

export type AutoAssignOptions = {
  /** true のとき、既に担当が入っている枠は固定して残りだけ割り当てる */
  keepExisting: boolean;
};

/** ワンクリック自動割り当て。DB には保存せず、割り当て結果を返す（画面で微調整してから保存）。 */
export async function autoAssignAction(detail: ScheduleDetail, opts: AutoAssignOptions): Promise<ScheduleDetail> {
  if (!isValidDate(detail.date)) throw new Error("invalid date");
  const staffAll = listStaff(true);
  const onDuty = staffAll.filter((s) => detail.staffIds.includes(s.id));
  const courseMaster = listCourses(true);
  const history = buildAssignHistory(detail.date);

  const lockedCourses = new Map<number, number>();
  if (opts.keepExisting) for (const c of detail.courses) if (c.staff_id != null) lockedCourses.set(c.course_id, c.staff_id);

  const courseInputs = courseMaster
    .filter((c) => detail.courses.some((dc) => dc.course_id === c.id))
    .map((c) => ({ id: c.id, kind: c.kind, slot: c.slot, sort_order: c.sort_order }));
  const courseResult = assignCourses(courseInputs, onDuty, history, lockedCourses);

  const seitaiClients = detail.clients.filter((c) => c.status === "present" && c.seitai).map((c) => c.client_id);
  const lockedSeitai = new Map<number, number>();
  if (opts.keepExisting)
    for (const c of detail.clients) if (c.seitai_staff_id != null && seitaiClients.includes(c.client_id)) lockedSeitai.set(c.client_id, c.seitai_staff_id);
  const driveLoad = new Map<number, number>();
  for (const sid of courseResult.values()) if (sid != null) driveLoad.set(sid, (driveLoad.get(sid) ?? 0) + 1);
  const seitaiResult = assignSeitai(seitaiClients, onDuty, history, lockedSeitai, driveLoad);

  return {
    ...detail,
    courses: detail.courses.map((c) => ({ ...c, staff_id: courseResult.has(c.course_id) ? courseResult.get(c.course_id)! : c.staff_id })),
    clients: detail.clients.map((c) => ({
      ...c,
      seitai_staff_id:
        c.status === "present" && c.seitai ? (seitaiResult.get(c.client_id) ?? null) : null,
    })),
  };
}

export async function saveScheduleAction(detail: ScheduleDetail): Promise<{ ok: true; savedAt: string }> {
  if (!isValidDate(detail.date)) throw new Error("invalid date");
  saveScheduleDetail(detail);
  revalidatePath(`/schedule/${detail.date}`);
  revalidatePath("/monthly");
  return { ok: true, savedAt: new Date().toLocaleTimeString("ja-JP") };
}
