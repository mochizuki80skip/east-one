import Link from "next/link";
import { listStaff, listStores } from "@/lib/repo";
import { EMPLOYMENT_TYPES, splitList } from "@/lib/constants";
import { Card, PageTitle, btnPrimary, btnSecondary, td, th } from "@/components/ui";
import StaffImport from "@/components/StaffImport";

export const dynamic = "force-dynamic";

export default async function StaffPage({ searchParams }: { searchParams: Promise<{ store?: string; all?: string }> }) {
  const sp = await searchParams;
  const stores = listStores();
  const storeId = Number(sp.store) || undefined;
  const staff = listStaff({ storeId, activeOnly: !sp.all });
  const storeName = new Map(stores.map((s) => [s.id, s.name]));
  const empLabel = new Map<string, string>(EMPLOYMENT_TYPES.map((e) => [e.code, e.label]));
  const q = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ store: sp.store, all: sp.all, ...o }).filter(([, v]) => v) as [string, string][]);
    return `/staff${p.size ? `?${p}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <PageTitle
        right={
          <Link href="/staff/new" className={btnPrimary}>
            ＋ スタッフを追加
          </Link>
        }
      >
        スタッフ
      </PageTitle>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link href={q({ store: undefined })} className={!storeId ? btnPrimary : btnSecondary}>
          全店舗
        </Link>
        {stores.map((s) => (
          <Link key={s.id} href={q({ store: String(s.id) })} className={storeId === s.id ? btnPrimary : btnSecondary}>
            {s.name}
          </Link>
        ))}
        <Link href={q({ all: sp.all ? undefined : "1" })} className="ml-3 text-blue-700 underline">
          {sp.all ? "在籍者のみ表示" : "休職・退職者も表示"}
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border bg-white">
          <thead>
            <tr>
              <th className={th}>名前</th>
              <th className={th}>ステータス</th>
              <th className={th}>資格・役職</th>
              <th className={th}>勤務形態</th>
              <th className={th}>週</th>
              <th className={th}>できること</th>
              <th className={th}>店舗</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id} className={s.status === "在籍" ? "" : "text-slate-400"}>
                <td className={td}>
                  <Link href={`/staff/${s.id}`} className="font-medium text-blue-700 hover:underline">
                    {s.name}
                  </Link>
                </td>
                <td className={td}>{s.status}</td>
                <td className={td}>{s.role}</td>
                <td className={td} title={empLabel.get(s.employment)}>
                  {s.employment}
                </td>
                <td className={`${td} text-center`}>{s.days_per_week}</td>
                <td className={`${td} text-xs`}>{splitList(s.skills).join("・")}</td>
                <td className={`${td} text-xs`}>
                  {splitList(s.store_ids)
                    .map((id) => storeName.get(Number(id)))
                    .join("・")}
                </td>
              </tr>
            ))}
            {staff.length === 0 && (
              <tr>
                <td className={td} colSpan={7}>
                  スタッフが登録されていません。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {stores.length > 0 && (
        <Card title="シフト表から取り込む">
          <StaffImport stores={stores.map((s) => ({ id: s.id, name: s.name }))} />
        </Card>
      )}
    </div>
  );
}
