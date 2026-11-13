/**
 * 住所録（CSV・スプレッドシートからの貼り付け）の読み取り。
 * 見出し行があれば列名（名前・住所・緯度・経度）から、無ければ「名前・住所」の順として読む。
 */
import { parseDelimited } from "./csv";
import { normalizeName } from "./import";

export type AddressEntry = { name: string; address: string; lat: number | null; lng: number | null };

const WORDS = {
  name: /利用者|氏名|名前|お名前/,
  address: /住所|所在地|自宅/,
  lat: /緯度|^lat/i,
  lng: /経度|^(lng|lon)/i,
  zip: /郵便|〒/,
} as const;

export function parseAddressBook(text: string): { list: AddressEntry[]; header: boolean; hint?: string } {
  const rows = parseDelimited(text);
  let headerAt = -1;
  let cols: Partial<Record<keyof typeof WORDS, number>> = {};
  for (let i = 0; i < Math.min(3, rows.length) && headerAt < 0; i++) {
    const found: Partial<Record<keyof typeof WORDS, number>> = {};
    rows[i].forEach((c, j) => {
      for (const k of Object.keys(WORDS) as (keyof typeof WORDS)[]) {
        // 「住所」より先に「郵便番号」を見る（「郵便番号（住所）」などの見出しを住所と取り違えない）
        if (found[k] === undefined && WORDS[k].test(c) && !(k === "address" && WORDS.zip.test(c))) {
          found[k] = j;
          break;
        }
      }
    });
    if (found.name !== undefined && found.address !== undefined) {
      headerAt = i;
      cols = found;
    }
  }
  if (headerAt < 0) cols = { name: 0, address: 1 };
  const num = (s: string | undefined) => {
    const n = Number((s ?? "").trim());
    return s && s.trim() !== "" && Number.isFinite(n) ? n : null;
  };
  const seen = new Set<string>();
  const list: AddressEntry[] = [];
  for (const r of rows.slice(headerAt + 1)) {
    const name = normalizeName(r[cols.name!] ?? "");
    const address = (r[cols.address!] ?? "").replace(/[　\s]+/g, " ").trim();
    if (!name || !address || seen.has(name)) continue;
    seen.add(name);
    const lat = cols.lat !== undefined ? num(r[cols.lat]) : null;
    const lng = cols.lng !== undefined ? num(r[cols.lng]) : null;
    list.push({ name, address, lat: lat != null && lng != null ? lat : null, lng: lat != null && lng != null ? lng : null });
  }
  return list.length
    ? { list, header: headerAt >= 0 }
    : { list, header: headerAt >= 0, hint: "名前と住所が見つかりませんでした。1行目に「名前」「住所」の見出しを入れるか、名前・住所の順に並べてください。" };
}
