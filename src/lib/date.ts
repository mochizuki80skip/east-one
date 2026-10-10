import { WEEKDAYS } from "./constants";

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 日本時間の今日 */
export function todayStr(): string {
  const now = new Date(Date.now() + 9 * 3600_000);
  return now.toISOString().slice(0, 10);
}

export function currentYm(): string {
  return todayStr().slice(0, 7);
}

export function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T00:00:00`).getTime());
}

export function isValidYm(s: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

export function addDays(s: string, n: number): string {
  const d = new Date(`${s}T00:00:00`);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function weekdayOf(s: string): number {
  return new Date(`${s}T00:00:00`).getDay();
}

/** 月の全日付 */
export function monthDates(ym: string): string[] {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return Array.from({ length: last }, (_, i) => `${ym}-${String(i + 1).padStart(2, "0")}`);
}

export function lastDateOfMonth(ym: string): string {
  const ds = monthDates(ym);
  return ds[ds.length - 1];
}

export function formatDateJa(s: string): string {
  const d = new Date(`${s}T00:00:00`);
  return `${d.getMonth() + 1}月${d.getDate()}日（${WEEKDAYS[d.getDay()]}）`;
}

export function formatYmJa(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${y}年${m}月`;
}

/** 令和表記（例: 令和8年8月31日） */
export function formatWareki(s: string): string {
  const d = new Date(`${s}T00:00:00`);
  const y = d.getFullYear() - 2018;
  return `令和${y === 1 ? "元" : y}年${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 生年月日があれば満年齢、なければ登録の年齢 */
export function displayAge(birthDate: string, age: number | null, at = todayStr()): number | null {
  if (birthDate && isValidDate(birthDate)) {
    const [by, bm, bd] = birthDate.split("-").map(Number);
    const [y, m, d] = at.split("-").map(Number);
    return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
  }
  return age;
}
