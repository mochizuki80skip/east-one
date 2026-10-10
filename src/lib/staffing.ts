/**
 * 日々の人員まわりの計算（純粋関数）。
 *  - 資格ごとの出勤人数（午前・午後）
 *  - 時間帯ごとに空いているスタッフの割り出し
 *  - 体操・メディカルケア・FIT の担当の自動割り当て
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

// ---------------- 空いているスタッフ ----------------
export type FreeBlock = { key: string; label: string; session: Session; free: number[]; busy: number[] };

/**
 * 1 日を「送迎の便」「機能訓練・整体の時間枠」「体操・メディカルケア・FIT」の時間帯に区切り、
 * その時間帯に勤務していて何も担当していないスタッフを返す。
 * 時間帯の並び: 朝迎車 → 午前の訓練枠 → 午前の体操等 → 昼送車 → 昼迎車 → 午後の体操等 → 午後の訓練枠 → 帰り送車
 */
export function freeStaffBlocks(opts: {
  staff: StaffLite[];
  codeOf: (id: number) => string | undefined;
  slots: { am: string[]; pm: string[] };
  runs: RunLite[];
  training: TrainingLite[];
  duties: DutyLite[];
}): FreeBlock[] {
  const { staff, codeOf, slots, runs, training, duties } = opts;
  const blocks: { key: string; label: string; session: Session; busy: Set<number> }[] = [];
  const runBlock = (run: RunKind, label: string, session: Session) => {
    const busy = new Set<number>();
    for (const r of runs.filter((x) => x.run === run)) {
      if (r.driver_id != null) busy.add(r.driver_id);
      if (r.escort_id != null) busy.add(r.escort_id);
    }
    blocks.push({ key: run, label, session, busy });
  };
  const slotBlocks = (session: Session) => {
    for (const slot of slots[session]) {
      const busy = new Set(training.filter((t) => t.session === session && t.slot_time === slot && t.staff_id != null).map((t) => t.staff_id!));
      blocks.push({ key: `${session}-${slot}`, label: `${session === "am" ? "午前" : "午後"} ${slot}`, session, busy });
    }
  };
  const dutyBlock = (session: Session) => {
    const busy = new Set(duties.filter((d) => d.session === session && d.staff_id != null).map((d) => d.staff_id!));
    blocks.push({ key: `${session}-duty`, label: `${session === "am" ? "午前" : "午後"} 体操・メディカルケア・FIT`, session, busy });
  };

  runBlock("morning", "朝迎車", "am");
  slotBlocks("am");
  dutyBlock("am");
  runBlock("noon_drop", "昼送車", "am");
  runBlock("noon_pick", "昼迎車", "pm");
  dutyBlock("pm");
  slotBlocks("pm");
  runBlock("evening", "帰り送車", "pm");

  return blocks.map((b) => {
    const onDuty = staff.filter((s) => shiftWorks(codeOf(s.id))[b.session]).map((s) => s.id);
    return { key: b.key, label: b.label, session: b.session, free: onDuty.filter((id) => !b.busy.has(id)), busy: [...b.busy] };
  });
}

// ---------------- 体操・メディカルケア・FIT ----------------
/**
 * 午前・午後それぞれで担当を決める。
 *  - そのスキルを持つ出勤者から選ぶ（いなければ「体操」ができる人、それもいなければ未定）
 *  - 1 人で複数の担当を持てる人を優先（体操〜FIT は続けて行うため）
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
