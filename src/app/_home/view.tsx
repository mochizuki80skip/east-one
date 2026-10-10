"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { listClientsWithSlots, listStores, slotCountsOf } from "@/lib/data";
import { submitStore } from "@/lib/forms";
import { seedSample } from "@/lib/seed";
import { links } from "@/lib/links";
import { currentYm, formatDateJa, todayStr } from "@/lib/date";
import { Card, Notice, PageTitle, btnPrimary, btnSecondary, input, label } from "@/components/ui";
import { Loading } from "@/components/Loading";
import { useLoad } from "@/components/useLoad";

export default function HomeView() {
  const router = useRouter();
  const { data, error } = useLoad(async () => {
    const stores = await listStores();
    const counts = await Promise.all(stores.map(async (s) => slotCountsOf(await listClientsWithSlots(s.id))));
    return stores.map((s, i) => ({ store: s, counts: counts[i] }));
  }, []);
  const today = todayStr();
  const ym = currentYm();
  if (!data) return <Loading error={error} />;

  return (
    <div className="space-y-6">
      <PageTitle sub={`今日: ${formatDateJa(today)}`}>店舗一覧</PageTitle>

      {data.length === 0 && (
        <Notice>
          <p className="font-semibold">まだ店舗が登録されていません。</p>
          <p className="mt-1">下のフォームから店舗を追加するか、動作確認用のサンプル（架空のデータ）を投入できます。</p>
          <form
            action={async () => {
              const id = await seedSample();
              if (id) router.push(links.weekly(id));
            }}
            className="mt-2"
          >
            <button className={btnSecondary}>サンプルデータを投入する</button>
          </form>
        </Notice>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.map(({ store: s, counts: sc }) => {
          let used = 0;
          for (let w = 1; w <= 6; w++) used += (sc.get(`${w}|am`) ?? 0) + (sc.get(`${w}|pm`) ?? 0);
          const cap = (s.capacity_am + s.capacity_pm) * 6;
          return (
            <Card key={s.id} title={s.name} right={<span className="text-xs text-slate-500">{s.display_name}</span>}>
              <p className="mb-3 text-sm text-slate-600">
                週の登録枠 {used} / {cap}（空き {cap - used}）
              </p>
              <div className="flex flex-wrap gap-2">
                <Link href={links.daily(s.id, today)} className={btnPrimary}>
                  今日のスケジュール
                </Link>
                <Link href={links.shifts(s.id, ym)} className={btnSecondary}>
                  シフト
                </Link>
                <Link href={links.weekly(s.id)} className={btnSecondary}>
                  曜日別利用者
                </Link>
                <Link href={links.monthly(s.id, ym)} className={btnSecondary}>
                  月次報告
                </Link>
                <Link href={links.settings(s.id)} className={btnSecondary}>
                  店舗設定
                </Link>
              </div>
            </Card>
          );
        })}
      </div>

      <Card title="店舗を追加">
        <form
          action={async (fd) => {
            const id = await submitStore(fd);
            if (id) router.push(links.settings(id));
          }}
          className="flex flex-wrap items-end gap-3"
        >
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
