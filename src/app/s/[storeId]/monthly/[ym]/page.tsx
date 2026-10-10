import Link from "next/link";
import { notFound } from "next/navigation";
import { getStore, listCareManagers, listClients, listMonthlyReports, monthAttendanceStats } from "@/lib/repo";
import { addMonths, formatYmJa, isValidYm } from "@/lib/date";
import { Card, PageTitle, btnPrimary, btnSecondary, td, th } from "@/components/ui";

export default async function MonthlyIndex({ params }: { params: Promise<{ storeId: string; ym: string }> }) {
  const { storeId, ym } = await params;
  if (!isValidYm(ym)) notFound();
  const store = getStore(Number(storeId));
  if (!store) notFound();
  const clients = listClients(store.id);
  const reports = new Map(listMonthlyReports(store.id, ym).map((r) => [r.client_id, r]));
  const stats = monthAttendanceStats(store.id, ym);
  const cms = listCareManagers();
  const groups = [
    ...cms.map((cm) => ({ cm, list: clients.filter((c) => c.care_manager_id === cm.id) })).filter((g) => g.list.length > 0),
    { cm: null, list: clients.filter((c) => !c.care_manager_id || !cms.some((m) => m.id === c.care_manager_id)) },
  ].filter((g) => g.list.length > 0);
  const base = `/s/${store.id}/monthly/${ym}`;
  const done = clients.filter((c) => reports.get(c.id)?.body).length;

  return (
    <div className="space-y-5">
      <PageTitle
        right={
          <div className="flex items-center gap-2">
            <Link href={`/s/${store.id}/monthly/${addMonths(ym, -1)}`} className={btnSecondary}>
              ← 前月
            </Link>
            <span className="font-semibold">{formatYmJa(ym)}</span>
            <Link href={`/s/${store.id}/monthly/${addMonths(ym, 1)}`} className={btnSecondary}>
              翌月 →
            </Link>
            <Link href={`${base}/print`} className={btnPrimary}>
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
              <Link href={`${base}/print?cm=${cm.id}`} className={btnSecondary}>
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
                      <Link href={`${base}/${c.id}`} className="font-medium text-blue-700 hover:underline">
                        {c.name}
                      </Link>
                    </td>
                    <td className={td}>{c.care_level}</td>
                    <td className={`${td} text-center`}>{s?.present ?? 0}</td>
                    <td className={`${td} text-center`}>{s?.absent ?? 0}</td>
                    <td className={`${td} text-center`}>{s?.notes ?? 0}</td>
                    <td className={`${td} max-w-md truncate text-xs`}>
                      {r?.body ? (
                        <span title={r.body}>{r.body}</span>
                      ) : (
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-600">未作成</span>
                      )}
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
