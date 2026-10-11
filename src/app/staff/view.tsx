"use client";

import Link from "next/link";
import { listStaff, listStores } from "@/lib/data";
import { EMPLOYMENT_TYPES, splitList } from "@/lib/constants";
import { links } from "@/lib/links";
import { Card, PageTitle, btnPrimary, btnSecondary, td, th } from "@/components/ui";
import StaffImport from "@/components/StaffImport";
import { Loading } from "@/components/Loading";
import { useLoad } from "@/components/useLoad";
import { useQuery } from "@/components/useQuery";

export default function StaffView() {
  const { store: storeId, all } = useQuery();
  const { data, error, reload } = useLoad(async () => {
    const [stores, staff] = await Promise.all([listStores(), listStaff({ storeId: storeId || undefined, activeOnly: !all })]);
    return { stores, staff };
  }, [storeId, all]);
  if (!data) return <Loading error={error} />;
  const { stores, staff } = data;
  const storeName = new Map(stores.map((s) => [s.id, s.name]));
  const empLabel = new Map<string, string>(EMPLOYMENT_TYPES.map((e) => [e.code, e.label]));

  return (
    <div className="space-y-6">
      <PageTitle
        right={
          <Link href={links.staffEdit()} className={btnPrimary}>
            ＋ スタッフを追加
          </Link>
        }
      >
        スタッフ
      </PageTitle>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link href={links.staff(undefined, all)} className={!storeId ? btnPrimary : btnSecondary}>
          全店舗
        </Link>
        {stores.map((s) => (
          <Link key={s.id} href={links.staff(s.id, all)} className={storeId === s.id ? btnPrimary : btnSecondary}>
            {s.name}
          </Link>
        ))}
        <Link href={links.staff(storeId || undefined, !all)} className="ml-3 text-brand-700 underline">
          {all ? "在籍者のみ表示" : "休職・退職者も表示"}
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
                  <Link href={links.staffEdit(s.id)} className="font-medium text-brand-700 hover:underline">
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
                    .filter(Boolean)
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
          <StaffImport stores={stores.map((s) => ({ id: s.id, name: s.name }))} onDone={reload} />
        </Card>
      )}
    </div>
  );
}
