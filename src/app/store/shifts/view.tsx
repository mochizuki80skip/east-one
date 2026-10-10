"use client";

import Link from "next/link";
import { getBusyElsewhere, getShiftCells, getShiftRequests, getStore, listStaff } from "@/lib/data";
import { addMonths, formatYmJa, monthDates } from "@/lib/date";
import { splitList } from "@/lib/constants";
import { links } from "@/lib/links";
import { Notice, PageTitle, btnSecondary } from "@/components/ui";
import ShiftEditor from "@/components/ShiftEditor";
import { Loading } from "@/components/Loading";
import { useLoad } from "@/components/useLoad";
import { useQuery } from "@/components/useQuery";

export default function ShiftView() {
  const { store: sid, ym } = useQuery();
  const { data, error } = useLoad(async () => {
    const [store, staff] = await Promise.all([getStore(sid), listStaff({ storeId: sid, activeOnly: true })]);
    const ids = staff.map((s) => s.id);
    const [cells, requests, busy] = await Promise.all([getShiftCells(sid, ym), getShiftRequests(ids, ym), getBusyElsewhere(sid, ids, ym)]);
    return { store, staff, cells, requests, busy };
  }, [sid, ym]);
  if (!data) return <Loading error={error} />;
  const { store, staff } = data;
  if (!store) return <Notice>店舗が見つかりません。</Notice>;

  return (
    <div>
      <PageTitle
        right={
          <div className="no-print flex items-center gap-2">
            <Link href={links.shifts(sid, addMonths(ym, -1))} className={btnSecondary}>
              ← 前月
            </Link>
            <span className="font-semibold">{formatYmJa(ym)}</span>
            <Link href={links.shifts(sid, addMonths(ym, 1))} className={btnSecondary}>
              翌月 →
            </Link>
          </div>
        }
        sub="①「希望休入力」で希望休・有給を入れる ②「自動作成」で案を作る ③セルを選んで手直し ④保存。下の集計行で人数不足の日が赤く表示されます。"
      >
        {store.name} シフト表
      </PageTitle>
      {staff.length === 0 ? (
        <Notice>
          この店舗のスタッフが登録されていません。<Link href="/staff/" className="underline">スタッフ</Link>で「勤務できる店舗」にこの店舗を選んでください。
        </Notice>
      ) : (
        <ShiftEditor
          key={`${sid}-${ym}`}
          storeId={sid}
          ym={ym}
          dates={monthDates(ym)}
          staff={staff.map((s) => ({
            id: s.id,
            name: s.name,
            role: s.role,
            employment: s.employment,
            days_per_week: s.days_per_week,
            available_weekdays: splitList(s.available_weekdays).map(Number),
            sort_order: s.sort_order,
          }))}
          rules={{
            required: store.required_staff,
            minNurse: store.min_nurse,
            minTrainer: store.min_trainer,
            closedWeekdays: splitList(store.closed_weekdays).map(Number),
          }}
          initialCells={data.cells}
          initialRequests={data.requests}
          busy={[...data.busy]}
        />
      )}
    </div>
  );
}
