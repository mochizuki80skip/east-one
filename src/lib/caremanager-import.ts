/**
 * ケアマネ一覧の取り込み（CSV・スプレッドシートからの貼り付け）と書き出し用の表。
 * 見出し行があれば列名から、無ければ「事業所・ケアマネ名・電話・FAX・メモ」の順として読む。
 */
import { parseDelimited } from "./csv";

export type ImportedCareManager = { office: string; name: string; phone: string; fax: string; note: string };
type Field = keyof ImportedCareManager;

const HEADER_WORDS: [Field, RegExp][] = [
  ["fax", /fax|ＦＡＸ|ファックス|ファクス/i],
  ["phone", /電話|tel|ＴＥＬ|連絡先/i],
  ["office", /事業所|居宅|法人|所属/],
  ["note", /備考|メモ|その他/],
  ["name", /ケアマネ|氏名|名前|担当者|介護支援専門員|cm/i],
];
const DEFAULT_ORDER: Field[] = ["office", "name", "phone", "fax", "note"];

const clean = (s: string) => s.replace(/[　\s]+/g, " ").trim();
/** 同じ人かどうかの比較用（空白・敬称を除く） */
export const cmKey = (office: string, name: string) =>
  `${office.replace(/[　\s]/g, "")}|${name.replace(/[　\s]/g, "").replace(/(様|さん|ケアマネ|CM)$/i, "")}`;

export function parseCareManagers(text: string): { list: ImportedCareManager[]; header: boolean; hint?: string } {
  const rows = parseDelimited(text);
  if (rows.length === 0) return { list: [], header: false, hint: "読み取れる行がありませんでした。" };
  // 見出し行: 2 つ以上の列名が分かる行（先頭 3 行まで）
  let headerAt = -1;
  let cols: Partial<Record<Field, number>> = {};
  for (let i = 0; i < Math.min(3, rows.length) && headerAt < 0; i++) {
    const found: Partial<Record<Field, number>> = {};
    rows[i].forEach((c, j) => {
      const f = HEADER_WORDS.find(([field, re]) => found[field] === undefined && re.test(c))?.[0];
      if (f) found[f] = j;
    });
    if (Object.keys(found).length >= 2 && found.name !== undefined) {
      headerAt = i;
      cols = found;
    }
  }
  if (headerAt < 0) cols = Object.fromEntries(DEFAULT_ORDER.map((f, j) => [f, j]));
  const get = (r: string[], f: Field) => (cols[f] === undefined ? "" : clean(r[cols[f]!] ?? ""));
  const seen = new Set<string>();
  const list: ImportedCareManager[] = [];
  for (const r of rows.slice(headerAt + 1)) {
    const cm = { office: get(r, "office"), name: get(r, "name"), phone: get(r, "phone"), fax: get(r, "fax"), note: get(r, "note") };
    if (!cm.name) continue;
    const k = cmKey(cm.office, cm.name);
    if (seen.has(k)) continue;
    seen.add(k);
    list.push(cm);
  }
  return list.length
    ? { list, header: headerAt >= 0 }
    : { list, header: headerAt >= 0, hint: "ケアマネ名が見つかりませんでした。1行目に「事業所」「ケアマネ名」「電話」「FAX」などの見出しを入れてください。" };
}

/** 書き出し（Excel・PDF）用の表。担当利用者は利用中・休止中の方（終了した方は除く） */
export const CM_EXPORT_HEADER = ["事業所", "ケアマネ名", "電話", "FAX", "担当利用者数", "担当利用者", "メモ"] as const;
export function careManagerTable(
  cms: { id: number; office: string; name: string; phone: string; fax: string; note: string }[],
  clients: { name: string; status: string; care_manager_id: number | null; store_id: number }[],
  storeName: (id: number) => string,
  multiStore: boolean,
): (string | number)[][] {
  return cms.map((c) => {
    const mine = clients.filter((x) => x.care_manager_id === c.id && x.status !== "終了");
    const names = mine.map((x) => (multiStore ? `${x.name}（${storeName(x.store_id)}）` : x.name));
    return [c.office, c.name, c.phone, c.fax, mine.length, names.join("、"), c.note];
  });
}
