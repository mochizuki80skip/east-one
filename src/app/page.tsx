import Link from "next/link";
import { counts, monthAttendanceSummary } from "@/lib/repo";
import { currentYm, formatDateJa, todayStr } from "@/lib/date";
import { seedAction } from "./actions/masters";

export const dynamic = "force-dynamic";

export default function Home() {
  const c = counts();
  const today = todayStr();
  const ym = currentYm();
  const summary = monthAttendanceSummary(ym);
  const empty = c.staff + c.clients + c.courses === 0;

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-bold">ホーム</h1>
        <p className="text-slate-600 mt-1">{formatDateJa(today)}</p>
      </section>

      {empty && (
        <section className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <p className="font-semibold">まだマスタデータがありません。</p>
          <p className="text-sm mt-1">
            「利用者」「スタッフ」「送迎コース」から登録するか、動作確認用のサンプルデータを投入できます。
          </p>
          <form action={seedAction} className="mt-3">
            <button className="rounded bg-amber-600 px-4 py-2 text-white hover:bg-amber-700">サンプルデータを投入する</button>
          </form>
        </section>
      )}

      <section className="grid gap-4 sm:grid-cols-2">
        <Link href={`/schedule/${today}`} className="rounded-lg border bg-white p-5 shadow-sm hover:shadow">
          <h2 className="text-lg font-bold">今日のスケジュールを作る</h2>
          <p className="text-sm text-slate-600 mt-1">出勤スタッフと出席者を選んで、送迎・整体の担当をワンクリックで割り当て。</p>
        </Link>
        <Link href={`/monthly?ym=${ym}`} className="rounded-lg border bg-white p-5 shadow-sm hover:shadow">
          <h2 className="text-lg font-bold">今月の月次報告を書く</h2>
          <p className="text-sm text-slate-600 mt-1">日々のメモとキーワードから、利用者ごとの「今月のご様子」を文章化。</p>
        </Link>
      </section>

      <section className="grid gap-4 sm:grid-cols-4 text-center">
        {[
          ["利用者", c.clients, "/clients"],
          ["スタッフ", c.staff, "/staff"],
          ["送迎コース", c.courses, "/courses"],
          ["作成済みスケジュール", c.schedules, "/schedule"],
        ].map(([label, n, href]) => (
          <Link key={String(label)} href={String(href)} className="rounded border bg-white p-4">
            <div className="text-3xl font-bold">{n}</div>
            <div className="text-sm text-slate-600">{label}</div>
          </Link>
        ))}
      </section>

      <section>
        <h2 className="text-lg font-bold">今月の利用状況（日報の元データ）</h2>
        {summary.length === 0 ? (
          <p className="text-sm text-slate-600 mt-1">今月のスケジュールはまだ保存されていません。</p>
        ) : (
          <table className="mt-2 w-full max-w-md text-sm border bg-white">
            <thead className="bg-slate-100">
              <tr>
                <th className="border px-2 py-1 text-left">日付</th>
                <th className="border px-2 py-1">利用</th>
                <th className="border px-2 py-1">お休み</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((r) => (
                <tr key={r.date}>
                  <td className="border px-2 py-1">
                    <Link href={`/schedule/${r.date}`} className="text-blue-700 hover:underline">
                      {r.date}
                    </Link>
                  </td>
                  <td className="border px-2 py-1 text-center">{r.present}</td>
                  <td className="border px-2 py-1 text-center">{r.absent}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
