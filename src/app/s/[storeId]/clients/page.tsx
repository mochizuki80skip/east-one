import Link from "next/link";
import { listCareManagers, listClients, listRoutes, listSlots } from "@/lib/repo";
import { OPEN_WEEKDAY_ORDER, WEEKDAYS } from "@/lib/constants";
import { displayAge } from "@/lib/date";
import { PageTitle, btnPrimary, btnSecondary, td, th } from "@/components/ui";

export default async function ClientsPage({ params, searchParams }: { params: Promise<{ storeId: string }>; searchParams: Promise<{ all?: string }> }) {
  const { storeId } = await params;
  const sp = await searchParams;
  const sid = Number(storeId);
  const clients = listClients(sid, { includeEnded: !!sp.all });
  const slots = listSlots(sid);
  const cms = new Map(listCareManagers().map((c) => [c.id, c]));
  const routes = new Map(listRoutes(sid).map((r) => [r.id, r.name]));
  const slotText = (cid: number) =>
    OPEN_WEEKDAY_ORDER.map((w) => {
      const am = slots.some((s) => s.client_id === cid && s.weekday === w && s.session === "am");
      const pm = slots.some((s) => s.client_id === cid && s.weekday === w && s.session === "pm");
      return am || pm ? `${WEEKDAYS[w]}${am && pm ? "終日" : am ? "前" : "後"}` : "";
    })
      .filter(Boolean)
      .join(" ");

  return (
    <div>
      <PageTitle
        right={
          <div className="flex gap-2">
            <Link href={`/s/${sid}/clients${sp.all ? "" : "?all=1"}`} className={btnSecondary}>
              {sp.all ? "利用中・休止中のみ" : "終了した方も表示"}
            </Link>
            <Link href={`/s/${sid}/clients/new`} className={btnPrimary}>
              ＋ 利用者を追加
            </Link>
          </div>
        }
        sub={`${clients.length} 名。曜日別出席リストからの一括取り込みは「曜日別利用者」画面で行えます。`}
      >
        利用者
      </PageTitle>
      <div className="overflow-x-auto">
        <table className="w-full border bg-white">
          <thead>
            <tr>
              <th className={th}>名前</th>
              <th className={th}>介護度</th>
              <th className={th}>性別</th>
              <th className={th}>年齢</th>
              <th className={th}>利用枠</th>
              <th className={th}>担当ケアマネ</th>
              <th className={th}>送迎ルート</th>
              <th className={th}>状態</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => {
              const cm = c.care_manager_id ? cms.get(c.care_manager_id) : undefined;
              return (
                <tr key={c.id} className={c.status === "利用中" ? "" : "text-slate-400"}>
                  <td className={td}>
                    <Link href={`/s/${sid}/clients/${c.id}`} className="font-medium text-blue-700 hover:underline">
                      {c.name}
                    </Link>
                    {c.new_flag && <span className="ml-1 rounded bg-pink-100 px-1 text-xs text-pink-700">{c.new_flag}</span>}
                  </td>
                  <td className={td}>{c.care_level}</td>
                  <td className={td}>{c.gender}</td>
                  <td className={td}>{displayAge(c.birth_date, c.age) ?? ""}</td>
                  <td className={`${td} text-xs`}>{slotText(c.id)}</td>
                  <td className={`${td} text-xs`}>{cm ? `${cm.office} ${cm.name}` : <span className="text-amber-700">未設定</span>}</td>
                  <td className={`${td} text-xs`}>
                    {c.uses_transport ? (c.route_id ? `${routes.get(c.route_id)} (${c.route_order})` : "未設定") : "送迎なし"}
                  </td>
                  <td className={td}>{c.status}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
