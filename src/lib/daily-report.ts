import { ABSENCE_REASONS, careLevelGroup } from "./constants";
import type { DailyAttendance } from "./types";

/** 売上日報（スプレッドシート）へ転記する 1 日分の数字 */
export type DailyReportRow = {
  am: number;
  pm: number;
  total: number;
  absAm: number;
  absPm: number;
  absTotal: number;
  /** 申請・事対・支援・介護・自費（利用回数ベース） */
  groups: Record<"申請" | "事対" | "支援" | "介護" | "自費", number>;
  reasons: Record<(typeof ABSENCE_REASONS)[number], number>;
};

export function dailyReportRow(attendance: DailyAttendance[], careLevelOf: (clientId: number) => string): DailyReportRow {
  const present = attendance.filter((a) => a.status === "present");
  const absent = attendance.filter((a) => a.status === "absent");
  const groups = { 申請: 0, 事対: 0, 支援: 0, 介護: 0, 自費: 0 };
  for (const a of present) {
    const g = careLevelGroup(careLevelOf(a.client_id));
    if (g) groups[g]++;
  }
  const reasons = Object.fromEntries(ABSENCE_REASONS.map((r) => [r, 0])) as DailyReportRow["reasons"];
  for (const a of absent) {
    const r = (ABSENCE_REASONS as readonly string[]).includes(a.reason) ? (a.reason as (typeof ABSENCE_REASONS)[number]) : "その他";
    reasons[r]++;
  }
  const am = present.filter((a) => a.session === "am").length;
  const pm = present.filter((a) => a.session === "pm").length;
  const absAm = absent.filter((a) => a.session === "am").length;
  const absPm = absent.filter((a) => a.session === "pm").length;
  return { am, pm, total: am + pm, absAm, absPm, absTotal: absAm + absPm, groups, reasons };
}

/** 日報シートの「利用人数〜介護度」列（C〜M列）の並びでタブ区切り */
export function reportRowTsv(r: DailyReportRow): string {
  return [r.am, r.pm, r.total, r.absAm, r.absPm, r.absTotal, r.groups.申請, r.groups.事対, r.groups.支援, r.groups.介護, r.groups.自費]
    .map((n) => (n === 0 ? "" : String(n)))
    .join("\t");
}

/** 日報シートの「お休み理由」列（体調不良〜その他）の並びでタブ区切り */
export function reasonsTsv(r: DailyReportRow): string {
  return ABSENCE_REASONS.map((k) => (r.reasons[k] ? String(r.reasons[k]) : "")).join("\t");
}
