/**
 * Google スプレッドシートからコピー＆貼り付けしたデータ（タブ区切り）の取り込み。
 *  - 曜日別出席リスト（午前・午後 × 月〜土、各曜日 6 列: 名前・空・介護度・性別・年齢・新・再）
 *  - シフト表のスタッフ欄（資格・空・勤務形態・スタッフ名）
 */
import { WEEKDAYS, type Session } from "./constants";

const toHalfWidth = (s: string) =>
  s.replace(/[０-９Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/　/g, " ");

export function normalizeName(s: string): string {
  return toHalfWidth(s).replace(/\s+/g, "").replace(/様$/, "").trim();
}

export function normalizeCareLevel(s: string): string {
  const t = toHalfWidth(s).replace(/\s+/g, "");
  if (t === "事対") return "事業対象者";
  return t;
}

function rows(tsv: string): string[][] {
  return tsv
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.split("\t").map((c) => c.trim()));
}

export type ImportedClient = {
  name: string;
  care_level: string;
  gender: string;
  age: number | null;
  new_flag: string;
  slots: { weekday: number; session: Session }[];
};

export function parseWeeklyList(tsv: string): { clients: ImportedClient[]; skipped: number } {
  const data = rows(tsv);
  const byName = new Map<string, ImportedClient>();
  let skipped = 0;
  let session: Session | null = null;
  // 曜日の並び（ヘッダー行「月 火 水…」から読む。無ければ月〜土）
  let weekdayAt: number[] = [1, 2, 3, 4, 5, 6];

  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    const head = r[0] ?? "";
    if (r[1] === "月" || r[1] === "火") {
      const found: number[] = [];
      for (let w = 0; w < 6; w++) {
        const idx = WEEKDAYS.indexOf((r[1 + w * 6] ?? "") as (typeof WEEKDAYS)[number]);
        found.push(idx >= 0 ? idx : w + 1);
      }
      weekdayAt = found;
      continue;
    }
    if (head === "午前" || head === "午後") {
      session = head === "午前" ? "am" : "pm";
      continue;
    }
    if (!session || !/^\d+$/.test(toHalfWidth(head))) {
      if (head === "計") session = null;
      continue;
    }
    for (let w = 0; w < 6; w++) {
      const base = 1 + w * 6;
      const rawName = r[base] ?? "";
      const level = normalizeCareLevel(r[base + 2] ?? "");
      if (!rawName) {
        if (level) skipped++;
        continue;
      }
      const name = normalizeName(rawName);
      const ageNum = Number(toHalfWidth(r[base + 4] ?? ""));
      const c = byName.get(name) ?? {
        name,
        care_level: level,
        gender: r[base + 3] ?? "",
        age: Number.isFinite(ageNum) && ageNum > 0 ? ageNum : null,
        new_flag: "",
        slots: [],
      };
      if (!c.care_level && level) c.care_level = level;
      if (!c.gender && r[base + 3]) c.gender = r[base + 3];
      if (c.age == null && Number.isFinite(ageNum) && ageNum > 0) c.age = ageNum;
      const flag = r[base + 5] ?? "";
      if (flag.includes("新")) c.new_flag = "新規";
      else if (flag.includes("再")) c.new_flag = "再開";
      const wd = weekdayAt[w];
      if (!c.slots.some((s) => s.weekday === wd && s.session === session)) c.slots.push({ weekday: wd, session });
      byName.set(name, c);
    }
  }
  return { clients: [...byName.values()], skipped };
}

export type ImportedStaff = { name: string; role: string; employment: string };

export function parseStaffSheet(tsv: string): ImportedStaff[] {
  const out: ImportedStaff[] = [];
  const seen = new Set<string>();
  for (const r of rows(tsv)) {
    const role = (r[0] ?? "").trim();
    const employment = toHalfWidth(r[2] ?? "").trim().toUpperCase();
    const name = normalizeName(r[3] ?? "");
    if (!name || role === "資格" || !/^[ABCD]$/.test(employment) || seen.has(name)) continue;
    seen.add(name);
    out.push({ name, role, employment });
  }
  return out;
}
