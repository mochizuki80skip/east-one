"use client";

import Link from "next/link";
import { listCareManagers, listClients, listMonthlyReports, monthAttendanceStats } from "@/lib/data";
import { addMonths, formatYmJa } from "@/lib/date";
import { links } from "@/lib/links";
import { Card, PageTitle, btnPrimary, btnSecondary, td, th } from "@/components/ui";
import { Loading } from "@/components/Loading";
import { useLoad } from "@/components/useLoad";
import { useQuery } from "@/components/useQuery";

export default function MonthlyView() {
  const { store: sid, ym } = useQuery();
  const { data, error } = useLoad(async () => {
    const [clients, reports, stats, cms] = await Promise.all([listClients(sid), listMonthlyReports(ym), monthAttendanceStats(sid, ym), listCareManagers()]);
    return { clients, reports: new Map(reports.map((r) => [r.client_id, r])), stats, cms };
  }, [sid, ym]);
  if (!data) return <Loading error={error} />;
  const { clients, reports, stats, cms } = data;
  const groups = [
    ...cms.map((cm) => ({ cm, list: clients.filter((c) => c.care_manager_id === cm.id) })),
    { cm: null, list: clients.filter((c) => !c.care_manager_id || !cms.some((m) => m.id === c.care_manager_id)) },
  ].filter((g) => g.list.length > 0);
  const done = clients.filter((c) => reports.get(c.id)?.body).length;

  return (
    <div className="space-y-5">
      <PageTitle
        right={
          <div className="flex items-center gap-2">
            <Link href={links.monthly(sid, addMonths(ym, -1))} className={btnSecondary}>
              ← 前月
            </Link>
            <span className="font-semibold">{formatYmJa(ym)}</span>
            <Link href={links.monthly(sid, addMonths(ym, 1))} className={btnSecondary}>
              翌月 →
            </Link>
            <Link href={links.monthlyPrint(sid, ym)} className={btnPrimary}>
              📄 全ケアマネ分をPDF出力
            </Link>
          </div>
        }
        sub={`担当ケアマネごとに並んでいます。作成済み ${done} / ${clients.length} 名。利用者名から文章を作成し、ケアマネごとに「PDF出力」で提出用の書式になります。`}
      >
        月次報告
      </PageTitle>
      {groups.map(({ cm, list }) => (
        <Card
          key={cm?.id ?? "none"}
          title={cm ? `${cm.office ? cm.office + "　" : ""}${cm.name} ケアマネ` : "担当ケアマネ未設定"}
          right={
            cm ? (
              <Link href={links.monthlyPrint(sid, ym, cm.id)} className={btnSecondary}>
                📄 PDF出力（{list.length}名）
              </Link>
            ) : (
              <span className="text-xs text-amber-700">利用者の編集画面で担当ケアマネを設定してください</span>
            )
          }
        >
          <table className="w-full border">
            <thead>
              <tr>
                <th className={th}>利用者</th>
                <th className={th}>介護度</th>
                <th className={th}>利用</th>
                <th className={th}>お休み</th>
                <th className={th}>様子メモ</th>
                <th className={th}>報告文</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => {
                const r = reports.get(c.id);
                const s = stats.get(c.id);
                return (
                  <tr key={c.id}>
                    <td className={td}>
                      <Link href={links.monthlyEdit(sid, ym, c.id)} className="font-medium text-blue-700 hover:underline">
                        {c.name}
                      </Link>
                    </td>
                    <td className={td}>{c.care_level}</td>
                    <td className={`${td} text-center`}>{s?.present ?? 0}</td>
                    <td className={`${td} text-center`}>{s?.absent ?? 0}</td>
                    <td className={`${td} text-center`}>{s?.notes ?? 0}</td>
                    <td className={`${td} max-w-md truncate text-xs`}>
                      {r?.body ? <span title={r.body}>{r.body}</span> : <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-600">未作成</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      ))}
    </div>
  );
}
