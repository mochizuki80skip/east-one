/**
 * 月間シフトの自動作成（純粋関数・DB非依存）。
 *
 * ルール:
 *  - 定休曜日は全員「日」
 *  - 手入力済みのセル（locked）とシフト希望（希休・有・前有・後有）はそのまま使う
 *  - 他店舗で勤務が入っている日は「他店」
 *  - 各スタッフの週の勤務日数（days_per_week）を守る。常勤で日数を満たすには今日入る必要がある人は必ず入れる
 *  - 看護師・機能訓練指導員の最低人数を先に満たし、必要人数まで勤務日数の残りが多い人から入れる
 *  - 必要人数を満たせない日は警告を出す（勤務日数を超えて入れることはしない）
 *  - 出勤日には、その人のいつもの勤務時間（workCode）を入れる
 */
import { shiftWeight, shiftWorks } from "./constants";

export type ShiftStaff = {
  id: number;
  role: string;
  days_per_week: number;
  available_weekdays: number[];
  sort_order: number;
  /** 出勤日に入れる記号（いつもの勤務時間。例: 9:00-13:30）。無ければ「〇」 */
  workCode?: string;
};

export type ShiftRules = {
  required: number;
  minNurse: number;
  minTrainer: number;
  closedWeekdays: number[];
};

export type ShiftInput = {
  dates: string[];
  staff: ShiftStaff[];
  rules: ShiftRules;
  /** `${staffId}|${date}` -> 希望の記号 */
  requests: Map<string, string>;
  /** `${staffId}|${date}` -> 固定する記号（手入力） */
  locked: Map<string, string>;
  /** `${staffId}|${date}` 他店舗で勤務 */
  busyElsewhere: Set<string>;
};

export type DayCheck = {
  date: string;
  workers: number;
  nurses: number;
  trainers: number;
  care: number;
  messages: string[];
};

export const isNurse = (role: string) => role.includes("看護師");
export const isTrainer = (role: string) => role.includes("機能訓練指導員");
export const isCare = (role: string) => role.includes("介護職員");

const key = (staffId: number, date: string) => `${staffId}|${date}`;

function weekday(date: string): number {
  return new Date(`${date}T00:00:00`).getDay();
}

/** 月曜始まりの週キー */
function weekKey(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  const diff = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - diff);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** 勤務日数としてカウントする記号（有給も契約日数に含める） */
function countsAsDay(code: string): boolean {
  return shiftWeight(code) > 0 || code === "有";
}

export function autoShift(input: ShiftInput): { grid: Map<string, string>; checks: DayCheck[] } {
  const { dates, staff, rules, requests, locked, busyElsewhere } = input;
  const grid = new Map<string, string>();
  const closed = new Set(rules.closedWeekdays);
  const openPerWeek = Math.max(1, 7 - closed.size);

  // 週ごとの営業日
  const weekDates = new Map<string, string[]>();
  for (const d of dates) {
    if (closed.has(weekday(d))) continue;
    const wk = weekKey(d);
    weekDates.set(wk, [...(weekDates.get(wk) ?? []), d]);
  }

  // 先に固定セル・希望・他店・定休を埋める
  const preset = (s: ShiftStaff, d: string): string | null => {
    const k = key(s.id, d);
    if (locked.has(k)) return locked.get(k)!;
    if (closed.has(weekday(d))) return "日";
    if (requests.has(k)) return requests.get(k)!;
    if (busyElsewhere.has(k)) return "他店";
    if (!s.available_weekdays.includes(weekday(d))) return "休";
    return null;
  };
  for (const s of staff) for (const d of dates) {
    const p = preset(s, d);
    if (p != null) grid.set(key(s.id, d), p);
  }

  // 週ごとの割り当て
  for (const [, wdates] of weekDates) {
    const quota = new Map<number, number>();
    for (const s of staff) {
      const q = Math.round((s.days_per_week * wdates.length) / openPerWeek);
      const already = wdates.filter((d) => {
        const c = grid.get(key(s.id, d));
        return c != null && countsAsDay(c);
      }).length;
      quota.set(s.id, Math.max(0, q - already));
    }

    wdates.forEach((d, i) => {
      const rest = wdates.slice(i);
      const free = (s: ShiftStaff) => !grid.has(key(s.id, d));
      const freeDaysLeft = (s: ShiftStaff) => rest.filter((x) => !grid.has(key(s.id, x))).length;
      const need = (s: ShiftStaff) => {
        const q = quota.get(s.id) ?? 0;
        const f = freeDaysLeft(s);
        return f === 0 ? 0 : q / f;
      };

      const candidates = staff.filter((s) => free(s) && (quota.get(s.id) ?? 0) > 0);
      const chosen = new Set<number>(candidates.filter((s) => need(s) >= 1).map((s) => s.id));

      const working = () => staff.filter((s) => chosen.has(s.id) || shiftWorks(grid.get(key(s.id, d))).am || shiftWorks(grid.get(key(s.id, d))).pm);
      const weight = () =>
        staff.reduce((sum, s) => sum + (chosen.has(s.id) ? 1 : shiftWeight(grid.get(key(s.id, d)))), 0);
      const byNeed = (list: ShiftStaff[]) =>
        [...list].sort((a, b) => need(b) - need(a) || a.sort_order - b.sort_order || a.id - b.id);

      const ensure = (pred: (role: string) => boolean, min: number) => {
        for (const s of byNeed(candidates.filter((c) => !chosen.has(c.id) && pred(c.role)))) {
          if (working().filter((w) => pred(w.role)).length >= min) break;
          chosen.add(s.id);
        }
      };
      ensure(isNurse, rules.minNurse);
      ensure(isTrainer, rules.minTrainer);
      // 必要人数に加え、週の残り日数で勤務日数を均等にならした人数まで入れる（週の前後で偏らないように）
      const remainingQuota = candidates.reduce((n, c) => n + (quota.get(c.id) ?? 0), 0);
      const fixedToday = staff.reduce((n, st) => n + (free(st) ? 0 : shiftWeight(grid.get(key(st.id, d)))), 0);
      const target = Math.max(rules.required, fixedToday + Math.ceil(remainingQuota / rest.length));
      for (const s of byNeed(candidates.filter((c) => !chosen.has(c.id)))) {
        if (weight() >= target) break;
        chosen.add(s.id);
      }

      for (const s of staff) {
        if (!free(s)) continue;
        if (chosen.has(s.id)) {
          grid.set(key(s.id, d), s.workCode || "〇");
          quota.set(s.id, (quota.get(s.id) ?? 0) - 1);
        } else {
          grid.set(key(s.id, d), "休");
        }
      }
    });
  }

  return { grid, checks: checkShift(dates, staff, rules, grid) };
}

/** 日ごとの人数集計と不足チェック（手で調整した後の再チェックにも使う） */
export function checkShift(dates: string[], staff: Pick<ShiftStaff, "id" | "role">[], rules: ShiftRules, grid: Map<string, string>): DayCheck[] {
  const closed = new Set(rules.closedWeekdays);
  return dates.map((d) => {
    let workers = 0;
    let nurses = 0;
    let trainers = 0;
    let care = 0;
    for (const s of staff) {
      const w = shiftWeight(grid.get(key(s.id, d)));
      if (w === 0) continue;
      workers += w;
      if (isNurse(s.role)) nurses++;
      if (isTrainer(s.role)) trainers++;
      if (isCare(s.role)) care++;
    }
    const messages: string[] = [];
    if (!closed.has(weekday(d))) {
      if (workers < rules.required) messages.push(`出勤 ${workers}/${rules.required}名`);
      if (nurses < rules.minNurse) messages.push("看護師不足");
      if (trainers < rules.minTrainer) messages.push("機能訓練指導員不足");
    }
    return { date: d, workers, nurses, trainers, care, messages };
  });
}
