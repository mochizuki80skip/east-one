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

/** 在籍状況（退職・休職の人はシフトや日々のスケジュールに出さない） */
export const STAFF_STATUSES = ["在籍", "休職", "退職"] as const;

/** 雇用区分 */
export const CONTRACTS = ["正社員", "時短社員", "パート"] as const;
export type Contract = (typeof CONTRACTS)[number];

/** 雇用区分ごとの勤務時間パターンの初期値（スタッフごとに変更できる） */
export const DEFAULT_PATTERNS: Record<Contract, string[]> = {
  正社員: ["8:30-17:30"],
  時短社員: ["9:00-16:00"],
  パート: ["9:00-13:30", "13:00-17:30"],
};
/** 雇用区分ごとの週の勤務日数の初期値 */
export const DEFAULT_DAYS: Record<Contract, number> = { 正社員: 5, 時短社員: 5, パート: 3 };

/** できること（複数選択） */
export const SKILLS = ["運転", "添乗", "整体", "個別機能訓練", "体操", "メディカルケア", "FIT", "血圧測定", "入浴介助", "事務"] as const;
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

// ---------------- 勤務時間（「9:00-13:30」の形のシフト） ----------------
const TIME_RANGE_RE = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/;

/** 「9:00-13:30」→ 開始・終了の分（それ以外は null） */
export function parseTimeRange(code: string | null | undefined): { start: number; end: number } | null {
  const m = TIME_RANGE_RE.exec((code ?? "").trim());
  if (!m) return null;
  const start = Number(m[1]) * 60 + Number(m[2]);
  const end = Number(m[3]) * 60 + Number(m[4]);
  return end > start && end <= 24 * 60 ? { start, end } : null;
}

export const isTimeRange = (code: string | null | undefined) => parseTimeRange(code) !== null;

/** 開始・終了（「9:00」「13:30」）から勤務時間の記号を作る。正しくなければ空文字 */
export function makeTimeRange(start: string, end: string): string {
  const norm = (t: string) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
    return m ? `${Number(m[1])}:${m[2]}` : "";
  };
  const code = `${norm(start)}-${norm(end)}`;
  return parseTimeRange(code) ? code : "";
}

/** シフト表のセル用の短い表示（「9:00-13:30」→「9-13:30」） */
export function shiftLabel(code: string): string {
  return isTimeRange(code) ? code.replace(/:00/g, "") : code;
}

/**
 * その記号で午前・午後に勤務しているか。
 *  - 決まった記号（〇・午前・①など）は表のとおり
 *  - 勤務時間（9:00-13:30 など）は、午前= 12:00 より前に始まり 10:00 より後まで、
 *    午後= 13:30 より後まで働き 15:00 より前に始まる、で判定する
 */
export function shiftWorks(code: string | null | undefined): { am: boolean; pm: boolean } {
  const t = parseTimeRange(code);
  if (t) return { am: t.start < 12 * 60 && t.end > 10 * 60, pm: t.end > 13 * 60 + 30 && t.start < 15 * 60 };
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

/**
 * 送迎の便。昼送車と昼迎車は同じ車両・同じ運転者で回る（車両ごとに運転者を共有）。
 */
export const RUNS = [
  { key: "morning", label: "朝迎車", note: "午前利用者のお迎え", session: "am", dir: "pickup" },
  { key: "noon_drop", label: "昼送車", note: "午前利用者のお送り", session: "am", dir: "dropoff" },
  { key: "noon_pick", label: "昼迎車", note: "午後利用者のお迎え（昼送車と同じ車両・運転者）", session: "pm", dir: "pickup" },
  { key: "evening", label: "帰り送車", note: "午後利用者のお送り", session: "pm", dir: "dropoff" },
] as const;
export type RunKind = (typeof RUNS)[number]["key"];
export const RUN_KEYS: RunKind[] = RUNS.map((r) => r.key);
export const isNoonRun = (r: RunKind) => r === "noon_drop" || r === "noon_pick";
export const runLabel = (r: RunKind) => RUNS.find((x) => x.key === r)?.label ?? r;

/** 体操・メディカルケア・FIT の担当（午前・午後それぞれ） */
export const DUTIES = ["体操", "メディカルケア", "FIT"] as const;
export type Duty = (typeof DUTIES)[number];

/** 出勤状況で数える資格の区分（「〇〇兼〇〇」は両方に数える） */
export const QUALIFICATIONS = ["管理者", "生活相談員", "介護職員", "機能訓練指導員", "看護師", "ドライバー"] as const;

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
