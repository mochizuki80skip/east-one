"use client";

import Link from "next/link";
import { getStore, listCareManagers, listClientsWithSlots, listMonthlyReports, slotCountsOf } from "@/lib/data";
import { formatWareki, formatYmJa, lastDateOfMonth } from "@/lib/date";
import { links } from "@/lib/links";
import { Notice } from "@/components/ui";
import { Loading } from "@/components/Loading";
import { useLoad } from "@/components/useLoad";
import { useQuery } from "@/components/useQuery";
import { OPEN_WEEKDAY_ORDER, SESSIONS, WEEKDAYS, splitList } from "@/lib/constants";
import type { CareManager, Client, Store } from "@/lib/types";
import PrintButton from "@/components/PrintButton";

/** 1 ページに収める行数と 1 行の文字数の目安（A4 横） */
const LINES_PER_PAGE = 15;
const CHARS_PER_LINE = 78;

type Entry = { client: Client; body: string; lines: number };

function paginate(entries: Entry[]): Entry[][] {
  const pages: Entry[][] = [];
  let cur: Entry[] = [];
  let used = 0;
  for (const e of entries) {
    if (cur.length && used + e.lines > LINES_PER_PAGE) {
      pages.push(cur);
      cur = [];
      used = 0;
    }
    cur.push(e);
    used += e.lines;
  }
  if (cur.length) pages.push(cur);
  return pages.length ? pages : [[]];
}

function Sheet({ store, cm, ym, entries, vacancy }: { store: Store; cm: CareManager | null; ym: string; entries: Entry[]; vacancy: Map<string, number> }) {
  const used = entries.reduce((n, e) => n + e.lines, 0);
  const closed = splitList(store.closed_weekdays).map(Number);
  const days = OPEN_WEEKDAY_ORDER.filter((w) => !closed.includes(w));
  return (
    <div className="sheet-landscape flex flex-col text-black">
      <div className="flex items-end justify-between">
        <h1 className="text-[30px] font-extrabold tracking-wide text-pink-500">機能訓練型デイサービス{store.display_name || store.name}</h1>
        <div className="pb-1 text-right text-[12px]">
          {cm && (
            <div>
              {cm.office} {cm.name} 様
            </div>
          )}
          <div>{formatYmJa(ym)}分 ご利用状況のご報告</div>
        </div>
      </div>
      <div className="mt-2 flex-1">
        {entries.map((e) => (
          <div key={e.client.id} className="border-b border-amber-200 text-[13px]" style={{ lineHeight: "26px", backgroundImage: "repeating-linear-gradient(to bottom, transparent 0, transparent 25px, #fde68a 25px, #fde68a 26px)" }}>
            <span className="mr-3 font-semibold">{e.client.name}様</span>
            {e.body || <span className="text-slate-400">（未作成）</span>}
          </div>
        ))}
        {Array.from({ length: Math.max(0, LINES_PER_PAGE - used) }).map((_, i) => (
          <div key={i} className="h-[26px] border-b border-amber-200" />
        ))}
      </div>
      <div className="mt-3">
        <div className="mb-1 text-center text-[18px] font-bold text-red-600">空き情報 －{formatWareki(lastDateOfMonth(ym))}現在－</div>
        <table className="w-full border-collapse border-2 border-black text-center">
          <thead>
            <tr>
              <th className="w-40 border border-black text-[12px]">お問い合わせ</th>
              <th className="w-16 border border-black" />
              {days.map((w) => (
                <th key={w} className="border border-black text-[18px]">
                  {WEEKDAYS[w]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SESSIONS.map((s, i) => (
              <tr key={s.key}>
                <td className="border border-black text-[12px] font-semibold">{i === 0 ? store.phone : store.contact_name ? `${store.contact_name}まで` : ""}</td>
                <td className="border border-black text-[18px] font-bold">{s.label}</td>
                {days.map((w) => {
                  const cap = s.key === "am" ? store.capacity_am : store.capacity_pm;
                  const free = cap - (vacancy.get(`${w}|${s.key}`) ?? 0);
                  return (
                    <td key={w} className="border border-black py-1 text-red-600">
                      {free > 0 ? (
                        <span className="text-[18px] font-bold">空き{free}枠</span>
                      ) : (
                        <span className="text-[11px] leading-tight">
                          満員御礼
                          <br />
                          （要相談）
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function MonthlyPrintView() {
  const { store: sid, ym, cm: cmParam } = useQuery();
  const { data, error } = useLoad(async () => Promise.all([getStore(sid), listMonthlyReports(ym), listClientsWithSlots(sid), listCareManagers()]), [sid, ym]);
  if (!data) return <Loading error={error} />;
  const [store, reportList, clientList, cmList] = data;
  if (!store) return <Notice>店舗が見つかりません。</Notice>;
  const reports = new Map(reportList.map((r) => [r.client_id, r.body]));
  const clients = clientList;
  const vacancy = slotCountsOf(clientList);
  const cms = cmList.filter((c) => !cmParam || c.id === cmParam);

  const groups = cms
    .map((cm) => ({
      cm,
      entries: clients
        .filter((c) => c.care_manager_id === cm.id)
        .map((client) => {
          const body = reports.get(client.id) ?? "";
          return { client, body, lines: Math.max(1, Math.ceil((client.name.length + 2 + body.length) / CHARS_PER_LINE)) };
        }),
    }))
    .filter((g) => g.entries.length > 0);
  const missing = groups.flatMap((g) => g.entries).filter((e) => !e.body).length;

  return (
    <div>
      <div className="no-print mb-3 flex flex-wrap items-center gap-3">
        <Link href={links.monthly(store.id, ym)} className="text-sm text-blue-700 underline">
          ← 月次報告に戻る
        </Link>
        <PrintButton label="📄 PDFで保存 / 印刷" />
        <span className="text-xs text-slate-500">印刷画面で「送信先: PDFに保存」、用紙「A4 横」、余白「なし」を選んでください。ケアマネごとに改ページされます。</span>
        {missing > 0 && <span className="text-xs text-amber-700">報告文が未作成の方が {missing} 名います。</span>}
      </div>
      {groups.length === 0 && <p className="text-sm">出力できる利用者がいません。利用者に担当ケアマネを設定してください。</p>}
      {groups.flatMap((g) => paginate(g.entries).map((page, i) => <Sheet key={`${g.cm.id}-${i}`} store={store} cm={g.cm} ym={ym} entries={page} vacancy={vacancy} />))}
    </div>
  );
}
