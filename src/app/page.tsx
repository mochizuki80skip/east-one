import Link from "next/link";
import { counts, listStores, slotCounts } from "@/lib/repo";
import { currentYm, formatDateJa, todayStr } from "@/lib/date";
import { Card, Notice, PageTitle, btnPrimary, btnSecondary, input, label } from "@/components/ui";
import { saveStoreAction, seedAction } from "./actions/masters";

export const dynamic = "force-dynamic";

export default function Home() {
  const stores = listStores();
  const c = counts();
  const today = todayStr();
  const ym = currentYm();

  return (
    <div className="space-y-6">
      <PageTitle sub={`今日: ${formatDateJa(today)}`}>店舗一覧</PageTitle>

      {c.stores === 0 && (
        <Notice>
          <p className="font-semibold">まだ店舗が登録されていません。</p>
          <p className="mt-1">下のフォームから店舗を追加するか、動作確認用のサンプル（架空のデータ）を投入できます。</p>
          <form action={seedAction} className="mt-2">
            <button className={btnSecondary}>サンプルデータを投入する</button>
          </form>
        </Notice>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {stores.map((s) => {
          const sc = slotCounts(s.id);
          let am = 0;
          let pm = 0;
          for (let w = 1; w <= 6; w++) {
            am += sc.get(`${w}|am`) ?? 0;
            pm += sc.get(`${w}|pm`) ?? 0;
          }
          const cap = (s.capacity_am + s.capacity_pm) * 6;
          return (
            <Card key={s.id} title={s.name} right={<span className="text-xs text-slate-500">{s.display_name}</span>}>
              <p className="text-sm text-slate-600 mb-3">
                週の登録枠 {am + pm} / {cap}（空き {cap - am - pm}）
              </p>
              <div className="flex flex-wrap gap-2">
                <Link href={`/s/${s.id}/daily/${today}`} className={btnPrimary}>
                  今日のスケジュール
                </Link>
                <Link href={`/s/${s.id}/shifts/${ym}`} className={btnSecondary}>
                  シフト
                </Link>
                <Link href={`/s/${s.id}/weekly`} className={btnSecondary}>
                  曜日別利用者
                </Link>
                <Link href={`/s/${s.id}/monthly/${ym}`} className={btnSecondary}>
                  月次報告
                </Link>
                <Link href={`/s/${s.id}/settings`} className={btnSecondary}>
                  店舗設定
                </Link>
              </div>
            </Card>
          );
        })}
      </div>

      <Card title="店舗を追加">
        <form action={saveStoreAction} className="flex flex-wrap items-end gap-3">
          <div>
            <label className={label}>店舗名</label>
            <input name="name" required placeholder="例: 本店" className={input} />
          </div>
          <div>
            <label className={label}>書類に載せる名称</label>
            <input name="display_name" placeholder="例: East-one裾野店" className={`${input} w-56`} />
          </div>
          <button className={btnPrimary}>追加して設定へ</button>
        </form>
      </Card>
    </div>
  );
}
