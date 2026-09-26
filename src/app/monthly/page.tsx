import Link from "next/link";
import { listClients, listMonthlyReports, listScheduleDates } from "@/lib/repo";
import { addMonths, currentYm, formatYmJa, isValidYm } from "@/lib/date";
import { PageTitle, btnSecondary, td, th } from "@/components/ui";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function MonthlyIndex({ searchParams }: PageProps<"/monthly">) {
  const sp = await searchParams;
  const raw = typeof sp.ym === "string" ? sp.ym : "";
  const ym = isValidYm(raw) ? raw : currentYm();
  const clients = listClients(true);
  const reports = new Map(listMonthlyReports(ym).map((r) => [r.client_id, r]));
  const dates = listScheduleDates(ym);
  const stats = getDb()
    .prepare(
      `SELECT sc.client_id,
              SUM(CASE WHEN sc.status='present' THEN 1 ELSE 0 END) AS present,
              SUM(CASE WHEN sc.note <> '' THEN 1 ELSE 0 END) AS notes
       FROM schedule_clients sc JOIN schedules s ON s.id = sc.schedule_id
       WHERE s.date LIKE ? GROUP BY sc.client_id`,
    )
    .all(`${ym}-%`) as { client_id: number; present: number; notes: number }[];
  const statBy = new Map(stats.map((s) => [s.client_id, s]));

  return (
    <div>
      <PageTitle
        right={
          <div className="flex items-center gap-2">
            <Link href={`/monthly?ym=${addMonths(ym, -1)}`} className={btnSecondary}>
              ← 前月
            </Link>
            <span className="font-semibold">{formatYmJa(ym)}</span>
            <Link href={`/monthly?ym=${addMonths(ym, 1)}`} className={btnSecondary}>
              翌月 →
            </Link>
          </div>
        }
      >
        月次報告
      </PageTitle>
      <p className="text-sm text-slate-600 mb-4">
        この月に保存済みのスケジュール: {dates.length} 日分。各日の「今日の様子メモ」が利用者ごとに集まり、文章生成の材料になります。
      </p>
      <table className="w-full border bg-white">
        <thead>
          <tr>
            <th className={th}>利用者</th>
            <th className={th}>介護度</th>
            <th className={th}>利用日数</th>
            <th className={th}>メモあり日数</th>
            <th className={th}>月次報告</th>
            <th className={th}>最終更新</th>
          </tr>
        </thead>
        <tbody>
          {clients.map((c) => {
            const r = reports.get(c.id);
            const s = statBy.get(c.id);
            return (
              <tr key={c.id}>
                <td className={td}>
                  <Link href={`/monthly/${c.id}/${ym}`} className="text-blue-700 hover:underline font-medium">
                    {c.name}
                  </Link>
                </td>
                <td className={td}>{c.care_level}</td>
                <td className={`${td} text-center`}>{s?.present ?? 0}</td>
                <td className={`${td} text-center`}>{s?.notes ?? 0}</td>
                <td className={td}>
                  {r?.body ? (
                    <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">作成済み</span>
                  ) : r?.keywords ? (
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">キーワードのみ</span>
                  ) : (
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">未作成</span>
                  )}
                </td>
                <td className={`${td} text-xs text-slate-500`}>{r?.updated_at ?? ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
