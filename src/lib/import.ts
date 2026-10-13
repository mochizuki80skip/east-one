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

export type WeeklyParseResult = {
  clients: ImportedClient[];
  /** 名前が空欄で介護度だけある行の数 */
  skipped: number;
  /** 読み取れなかったときの理由 */
  hint?: string;
};

const CARE_RE = /^(要支援|要介護|事業対象者|事対|自費|申請)/;
const isTotalRow = (r: string[]) => r[0] === "計" || r.some((c) => c === "総計");

/**
 * 曜日別出席リストの読み取り。
 * 次のどの貼り付け方でも読めるようにしている:
 *  - A列（午前・午後・番号）から AK列 まで
 *  - B列（「月」の見出し）から（A列なし）
 *  - 見出しなしで名前の行だけ（この場合は午前/午後を defaultSession で指定）
 * 各曜日の 6 列（名前・空・介護度・性別・年齢・新・再）の位置は、「名前」の見出しから求める。
 */
export function parseWeeklyList(tsv: string, defaultSession?: Session): WeeklyParseResult {
  const data = rows(tsv);
  const byName = new Map<string, ImportedClient>();
  let skipped = 0;

  const add = (rawName: string, cells: string[], base: number, weekday: number, session: Session) => {
    const level = normalizeCareLevel(cells[base + 2] ?? "");
    if (!rawName) {
      if (level) skipped++;
      return;
    }
    const name = normalizeName(rawName);
    if (!name || name === "名前") return;
    const ageNum = Number(toHalfWidth(cells[base + 4] ?? ""));
    const age = Number.isFinite(ageNum) && ageNum > 0 && ageNum < 130 ? ageNum : null;
    const c = byName.get(name) ?? { name, care_level: level, gender: cells[base + 3] ?? "", age, new_flag: "", slots: [] };
    if (!c.care_level && level) c.care_level = level;
    if (!c.gender && cells[base + 3]) c.gender = cells[base + 3];
    if (c.age == null && age != null) c.age = age;
    const flag = cells[base + 5] ?? "";
    if (flag.includes("新")) c.new_flag = "新規";
    else if (flag.includes("再")) c.new_flag = "再開";
    if (!c.slots.some((s) => s.weekday === weekday && s.session === session)) c.slots.push({ weekday, session });
    byName.set(name, c);
  };

  // 「名前」の見出し行を探す
  const headerRows = data.map((r, i) => ({ i, cols: r.flatMap((c, j) => (c === "名前" ? [j] : [])) })).filter((h) => h.cols.length > 0);

  if (headerRows.length > 0) {
    headerRows.forEach((h, bi) => {
      // 午前・午後: 見出し行かその 2 行上までにある「午前」「午後」。無ければ 1 つ目=午前、2 つ目=午後
      let session: Session | null = null;
      for (let k = h.i; k >= Math.max(0, h.i - 2) && !session; k--) {
        if (data[k].includes("午前")) session = "am";
        else if (data[k].includes("午後")) session = "pm";
      }
      session ??= defaultSession ?? (bi === 0 ? "am" : "pm");
      // 曜日: 見出し行の 2 行上までにある「月」「火」…の位置。無ければ左から月〜土
      const weekdayAt = h.cols.map((col, k) => {
        for (let r = h.i - 1; r >= Math.max(0, h.i - 2); r--) {
          for (let j = col; j >= Math.max(0, col - 5); j--) {
            const idx = WEEKDAYS.indexOf((data[r][j] ?? "") as (typeof WEEKDAYS)[number]);
            if (idx >= 0) return idx;
          }
        }
        return (k % 6) + 1;
      });
      const end = headerRows[bi + 1]?.i ?? data.length;
      for (let r = h.i + 1; r < end; r++) {
        const cells = data[r];
        if (isTotalRow(cells)) break;
        h.cols.forEach((base, k) => add(cells[base] ?? "", cells, base, weekdayAt[k], session!));
      }
    });
  } else {
    // 見出しなし: 介護度が「名前の 2 列右」に並ぶ列を探して、その列を各曜日の名前の列とみなす
    const counts = new Map<number, number>();
    for (const r of data) r.forEach((c, j) => CARE_RE.test(normalizeCareLevel(c)) && j >= 2 && counts.set(j - 2, (counts.get(j - 2) ?? 0) + 1));
    const bases = [...counts.entries()]
      .filter(([, n]) => n >= 1)
      .map(([j]) => j)
      .sort((a, b) => a - b)
      .filter((j, k, arr) => k === 0 || j - arr[k - 1] >= 6)
      .slice(0, 6);
    if (bases.length === 0) return { clients: [], skipped: 0, hint: "名前と介護度の列が見つかりませんでした。「月 火 水…」の見出し行から選択してコピーしてください。" };
    if (!defaultSession) return { clients: [], skipped: 0, hint: "見出しが含まれていないため、午前か午後かが分かりません。「貼り付けた範囲」で午前・午後を選んでから取り込んでください。" };
    for (const cells of data) {
      if (isTotalRow(cells)) break;
      bases.forEach((base, k) => add(cells[base] ?? "", cells, base, k + 1, defaultSession));
    }
  }

  const clients = [...byName.values()];
  return clients.length
    ? { clients, skipped }
    : { clients, skipped, hint: "利用者の名前が見つかりませんでした。「月 火 水…」の見出し行から、午後の「計」の行までを選択してコピーしてください。" };
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
