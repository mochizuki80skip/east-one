/**
 * 日々の人員まわりの計算（純粋関数）。
 *  - 資格ごとの出勤人数（午前・午後）
 *  - 体操の担当の自動割り当て
 */
import { DUTIES, QUALIFICATIONS, shiftWorks, type Duty, type RunKind, type Session } from "./constants";
import { inc, pickBest, TODAY_LOAD_WEIGHT } from "./pick";

export type StaffLite = { id: number; name: string; role: string; skills: string[]; sortOrder?: number };
export type RunLite = { run: RunKind; driver_id: number | null; escort_id: number | null };
export type TrainingLite = { session: Session; slot_time: string; staff_id: number | null };
export type DutyLite = { session: Session; duty: Duty; staff_id: number | null };

// ---------------- 資格ごとの出勤人数 ----------------
export type QualificationRow = { qualification: string; am: string[]; pm: string[] };

export function qualificationSummary(staff: StaffLite[], codeOf: (id: number) => string | undefined): { rows: QualificationRow[]; am: number; pm: number } {
  const rows: QualificationRow[] = [];
  const quals: string[] = [...QUALIFICATIONS];
  const other = (role: string) => !quals.some((q) => role.includes(q));
  for (const q of [...quals, "その他"]) {
    const match = (s: StaffLite) => (q === "その他" ? other(s.role) : s.role.includes(q));
    const am = staff.filter((s) => match(s) && shiftWorks(codeOf(s.id)).am).map((s) => s.name);
    const pm = staff.filter((s) => match(s) && shiftWorks(codeOf(s.id)).pm).map((s) => s.name);
    if (am.length || pm.length || q !== "その他") rows.push({ qualification: q, am, pm });
  }
  return {
    rows,
    am: staff.filter((s) => shiftWorks(codeOf(s.id)).am).length,
    pm: staff.filter((s) => shiftWorks(codeOf(s.id)).pm).length,
  };
}

// ---------------- 体操 ----------------
/**
 * 午前・午後それぞれで担当を決める。
 *  - そのスキルを持つ出勤者から選ぶ（いなければ「体操」ができる人、それもいなければ未定）
 *  - 1 人で両方の担当を持てる人を優先（体操〜メディカルケアFIT は続けて行うため）
 *  - 午前は昼送車、午後は昼迎車の運転・添乗の人を避ける（時間が重なるため）
 *  - その日の担当数（訓練・送迎）が少ない人を優先
 */
export function planDuties(opts: {
  staff: StaffLite[];
  codeOf: (id: number) => string | undefined;
  runs: RunLite[];
  training: TrainingLite[];
  locked?: DutyLite[];
}): { duties: DutyLite[]; warnings: string[] } {
  const { staff, codeOf, runs, training } = opts;
  const load = new Map<number, number>();
  for (const t of training) if (t.staff_id != null) inc(load, t.staff_id);
  for (const r of runs) {
    if (r.driver_id != null) inc(load, r.driver_id);
    if (r.escort_id != null) inc(load, r.escort_id);
  }
  const duties: DutyLite[] = [];
  const warnings: string[] = [];
  for (const session of ["am", "pm"] as const) {
    const conflictRun: RunKind = session === "am" ? "noon_drop" : "noon_pick";
    const conflict = new Set(
      runs.filter((r) => r.run === conflictRun).flatMap((r) => [r.driver_id, r.escort_id]).filter((x): x is number => x != null),
    );
    const onDuty = staff
      .filter((s) => shiftWorks(codeOf(s.id))[session] && !conflict.has(s.id))
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id);
    const assigned = new Map<Duty, number | null>();
    for (const l of opts.locked ?? []) if (l.session === session && l.staff_id != null) assigned.set(l.duty, l.staff_id);

    const can = (s: StaffLite, d: Duty) => s.skills.includes(d);
    while (DUTIES.some((d) => !assigned.has(d))) {
      const open = DUTIES.filter((d) => !assigned.has(d));
      const best = pickBest(
        onDuty.filter((s) => open.some((d) => can(s, d))),
        (s) => -open.filter((d) => can(s, d)).length * 100 + (load.get(s.id) ?? 0) * TODAY_LOAD_WEIGHT,
      );
      if (!best) break;
      for (const d of open) if (can(best, d)) assigned.set(d, best.id);
      inc(load, best.id);
    }
    // スキルを持つ人がいない担当は、体操ができる人（同じ時間帯の担当者を優先）
    for (const d of DUTIES) {
      if (assigned.has(d)) continue;
      const fallback = assigned.get("体操") ?? pickBest(onDuty.filter((s) => can(s, "体操")), (s) => load.get(s.id) ?? 0)?.id ?? null;
      assigned.set(d, fallback);
      if (fallback == null) warnings.push(`${session === "am" ? "午前" : "午後"}: ${d}を担当できる出勤者がいません。`);
    }
    for (const d of DUTIES) duties.push({ session, duty: d, staff_id: assigned.get(d) ?? null });
  }
  return { duties, warnings };
}
