"use client";

import Link from "next/link";
import { api } from "@/lib/api";
import { listCareManagers, listStores } from "@/lib/data";
import { CM_EXPORT_HEADER, careManagerTable } from "@/lib/caremanager-import";
import { formatDateJa, todayStr } from "@/lib/date";
import type { Client } from "@/lib/types";
import PrintButton from "@/components/PrintButton";
import { Loading } from "@/components/Loading";
import { useLoad } from "@/components/useLoad";

/** 1 ページの行数（A4 横） */
const ROWS_PER_PAGE = 16;

export default function CareManagersPrintView() {
  const { data, error } = useLoad(async () => {
    const [cms, clients, stores] = await Promise.all([listCareManagers(), api.list<Client>("clients"), listStores()]);
    const name = new Map(stores.map((s) => [s.id, s.name]));
    return careManagerTable(cms, clients.map((d) => d.data), (id) => name.get(id) ?? "", stores.length > 1);
  }, []);
  if (!data) return <Loading error={error} />;
  const pages: (string | number)[][][] = [];
  for (let i = 0; i < data.length; i += ROWS_PER_PAGE) pages.push(data.slice(i, i + ROWS_PER_PAGE));
  if (pages.length === 0) pages.push([]);
  const cell = "border border-black px-[1.5mm] py-[1mm] align-top";

  return (
    <div>
      <div className="no-print mb-3 flex flex-wrap items-center gap-3">
        <Link href="/caremanagers/" className="text-sm text-brand-700 underline">
          ← ケアマネ一覧に戻る
        </Link>
        <PrintButton />
        <span className="text-xs text-slate-500">印刷画面で「PDFに保存」を選ぶと PDF になります（用紙 A4 横）。</span>
      </div>
      {pages.map((rows, pi) => (
        <div key={pi} className="sheet-landscape flex flex-col text-black">
          <div className="mb-[3mm] flex items-end justify-between">
            <h1 className="text-[20px] font-bold">ケアマネジャー一覧</h1>
            <div className="text-[11px]">
              {Number(todayStr().slice(0, 4))}年{formatDateJa(todayStr())} 現在　{data.length}名　{pages.length > 1 ? `${pi + 1}/${pages.length}` : ""}
            </div>
          </div>
          <table className="w-full border-collapse text-[11px] leading-snug">
            <thead>
              <tr className="bg-brand-50">
                {CM_EXPORT_HEADER.map((h) => (
                  <th key={h} className={`${cell} whitespace-nowrap text-left`}>
                    {h === "担当利用者数" ? "人数" : h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  {r.map((v, j) => (
                    <td key={j} className={`${cell} ${j === 4 ? "text-center" : ""} ${j === 2 || j === 3 ? "whitespace-nowrap" : ""}`}>
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
