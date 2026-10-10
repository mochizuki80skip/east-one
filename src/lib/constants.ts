/** 資格・役職（現行シフト表「勤務形態」シートの区分） */
export const ROLES = [
  "管理者",
  "管理者兼生活相談員",
  "生活相談員",
  "生活相談員兼介護職員",
  "介護職員",
  "機能訓練指導員",
  "機能訓練指導員兼介護職員",
  "看護師",
  "看護師兼介護職員",
  "ドライバー",
  "営業",
] as const;

/** 勤務形態の区分 */
export const EMPLOYMENT_TYPES = [
  { code: "A", label: "常勤で専従" },
  { code: "B", label: "常勤で兼務" },
  { code: "C", label: "常勤以外で専従" },
  { code: "D", label: "常勤以外で兼務" },
] as const;

export const STAFF_STATUSES = ["在籍", "休職", "退職"] as const;

/** できること（複数選択） */
export const SKILLS = ["運転", "添乗", "整体", "個別機能訓練", "体操", "血圧測定", "入浴介助", "事務"] as const;
export type Skill = (typeof SKILLS)[number];

/** 送迎の運転担当になれるスキル */
export const DRIVE_SKILL: Skill = "運転";
/** 機能訓練・整体の時間割の担当になれるスキル */
export const TRAINING_SKILLS: Skill[] = ["整体", "個別機能訓練"];

/**
 * シフト記号。am / pm はその記号で午前・午後に勤務しているか。
 * 現行シフト表の記号と「勤務形態」シートの勤務時間帯（日勤・①〜④）に合わせている。
 */
export const SHIFT_CODES = [
  { code: "〇", label: "出勤（日勤 8:30-17:30）", am: true, pm: true, leave: false },
  { code: "午前", label: "午前のみ", am: true, pm: false, leave: false },
  { code: "午後", label: "午後のみ", am: false, pm: true, leave: false },
  { code: "①", label: "① 9:00-13:30", am: true, pm: false, leave: false },
  { code: "②", label: "② 12:00-14:00", am: false, pm: true, leave: false },
  { code: "③", label: "③ 10:00-16:00", am: true, pm: true, leave: false },
  { code: "④", label: "④ 8:30-16:30", am: true, pm: true, leave: false },
  { code: "前有", label: "午前有給（午後出勤）", am: false, pm: true, leave: true },
  { code: "後有", label: "午後有給（午前出勤）", am: true, pm: false, leave: true },
  { code: "休", label: "休み", am: false, pm: false, leave: false },
  { code: "希休", label: "希望休", am: false, pm: false, leave: false },
  { code: "有", label: "有給", am: false, pm: false, leave: true },
  { code: "日", label: "定休日", am: false, pm: false, leave: false },
  { code: "他店", label: "他店舗で勤務", am: false, pm: false, leave: false },
] as const;
export type ShiftCode = (typeof SHIFT_CODES)[number]["code"];

const SHIFT_BY_CODE = new Map<string, (typeof SHIFT_CODES)[number]>(SHIFT_CODES.map((c) => [c.code, c]));

export function shiftWorks(code: string | null | undefined): { am: boolean; pm: boolean } {
  const c = code ? SHIFT_BY_CODE.get(code) : undefined;
  return { am: !!c?.am, pm: !!c?.pm };
}

/** 出勤者数の数え方: 終日=1、半日=0.5 */
export function shiftWeight(code: string | null | undefined): number {
  const w = shiftWorks(code);
  return (w.am ? 0.5 : 0) + (w.pm ? 0.5 : 0);
}

/** シフト希望として入力できる記号 */
export const REQUEST_CODES = ["希休", "有", "前有", "後有"] as const;

export const CARE_LEVELS = [
  "事業対象者",
  "要支援1",
  "要支援2",
  "要介護1",
  "要介護2",
  "要介護3",
  "要介護4",
  "要介護5",
  "申請中",
  "自費",
] as const;

/** 日報の介護度区分（申請・事対・支援・介護・自費） */
export function careLevelGroup(level: string): "申請" | "事対" | "支援" | "介護" | "自費" | "" {
  if (level.startsWith("申請")) return "申請";
  if (level === "事業対象者") return "事対";
  if (level.startsWith("要支援")) return "支援";
  if (level.startsWith("要介護")) return "介護";
  if (level === "自費") return "自費";
  return "";
}

/** 日報のお休み理由区分 */
export const ABSENCE_REASONS = ["体調不良", "入院", "通院", "家庭の事情", "私用", "その他"] as const;

export const CLIENT_STATUSES = ["利用中", "休止中", "終了"] as const;

export const SESSIONS = [
  { key: "am", label: "午前" },
  { key: "pm", label: "午後" },
] as const;
export type Session = "am" | "pm";

export const RUNS = [
  { key: "morning", label: "朝送迎", note: "午前利用者のお迎え" },
  { key: "noon", label: "昼送迎", note: "午前利用者のお送り → 午後利用者のお迎え" },
  { key: "evening", label: "帰り送迎", note: "午後利用者のお送り" },
] as const;
export type RunKind = "morning" | "noon" | "evening";

export const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;
/** 営業曜日の表示順（月〜土） */
export const OPEN_WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6] as const;

export function splitList(s: string | null | undefined): string[] {
  return (s ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

export function joinList(xs: Iterable<string | number>): string {
  return [...xs].map(String).join(",");
}
