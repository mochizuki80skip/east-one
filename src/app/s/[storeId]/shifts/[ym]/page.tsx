import Link from "next/link";
import { notFound } from "next/navigation";
import { getBusyElsewhere, getShiftCells, getShiftRequests, getStore, listStaff } from "@/lib/repo";
import { addMonths, formatYmJa, isValidYm, monthDates } from "@/lib/date";
import { splitList } from "@/lib/constants";
import { PageTitle, btnSecondary, Notice } from "@/components/ui";
import ShiftEditor from "@/components/ShiftEditor";

export default async function ShiftPage({ params }: { params: Promise<{ storeId: string; ym: string }> }) {
  const { storeId, ym } = await params;
  if (!isValidYm(ym)) notFound();
  const store = getStore(Number(storeId));
  if (!store) notFound();
  const staff = listStaff({ storeId: store.id, activeOnly: true });
  const dates = monthDates(ym);
  const from = dates[0];
  const to = dates[dates.length - 1];
  const ids = staff.map((s) => s.id);
  const busy = getBusyElsewhere(store.id, ids, from, to);
  // 他店舗の勤務先名

  return (
    <div>
      <PageTitle
        right={
          <div className="no-print flex items-center gap-2">
            <Link href={`/s/${store.id}/shifts/${addMonths(ym, -1)}`} className={btnSecondary}>
              ← 前月
            </Link>
            <span className="font-semibold">{formatYmJa(ym)}</span>
            <Link href={`/s/${store.id}/shifts/${addMonths(ym, 1)}`} className={btnSecondary}>
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
          この店舗のスタッフが登録されていません。<Link href="/staff" className="underline">スタッフ</Link>で「勤務できる店舗」にこの店舗を選んでください。
        </Notice>
      ) : (
        <ShiftEditor
          storeId={store.id}
          ym={ym}
          dates={dates}
          staff={staff.map((s) => ({ id: s.id, name: s.name, role: s.role, employment: s.employment, days_per_week: s.days_per_week }))}
          rules={{
            required: store.required_staff,
            minNurse: store.min_nurse,
            minTrainer: store.min_trainer,
            closedWeekdays: splitList(store.closed_weekdays).map(Number),
          }}
          initialCells={getShiftCells(store.id, from, to)}
          initialRequests={getShiftRequests(ids, from, to)}
          busy={[...busy]}
        />
      )}
    </div>
  );
}
