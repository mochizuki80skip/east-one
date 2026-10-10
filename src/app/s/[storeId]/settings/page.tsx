import Link from "next/link";
import { notFound } from "next/navigation";
import { getStore, listRoutes, listStaff, listVehicles } from "@/lib/repo";
import { DRIVE_SKILL, splitList, WEEKDAYS } from "@/lib/constants";
import ConfirmButton from "@/components/ConfirmButton";
import { Card, PageTitle, btnDanger, btnPrimary, input, label, td, th } from "@/components/ui";
import {
  deleteRouteAction,
  deleteStoreAction,
  deleteVehicleAction,
  saveRouteAction,
  saveStoreAction,
  saveVehicleAction,
} from "@/app/actions/masters";

export default async function SettingsPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const store = getStore(Number(storeId));
  if (!store) notFound();
  const vehicles = listVehicles(store.id);
  const routes = listRoutes(store.id);
  const staff = listStaff({ storeId: store.id, activeOnly: true });
  const drivers = staff.filter((s) => splitList(s.skills).includes(DRIVE_SKILL));
  const closed = splitList(store.closed_weekdays).map(Number);

  return (
    <div className="space-y-6">
      <PageTitle sub="送迎・時間割の自動作成とシフトの不足チェックは、ここの設定をもとに動きます。">店舗設定</PageTitle>

      <Card title="基本情報・人員基準・時間割">
        <form action={saveStoreAction} className="grid gap-4 md:grid-cols-4">
          <input type="hidden" name="id" value={store.id} />
          <div>
            <label className={label}>店舗名</label>
            <input name="name" defaultValue={store.name} required className={`${input} w-full`} />
          </div>
          <div className="md:col-span-2">
            <label className={label}>書類に載せる名称（月次報告の見出し）</label>
            <input name="display_name" defaultValue={store.display_name} placeholder="例: East-one裾野店" className={`${input} w-full`} />
          </div>
          <div>
            <label className={label}>並び順</label>
            <input name="sort_order" type="number" defaultValue={store.sort_order} className={`${input} w-20`} />
          </div>
          <div>
            <label className={label}>お問い合わせ電話番号</label>
            <input name="phone" defaultValue={store.phone} className={`${input} w-full`} />
          </div>
          <div>
            <label className={label}>お問い合わせ担当者</label>
            <input name="contact_name" defaultValue={store.contact_name} className={`${input} w-full`} />
          </div>
          <div>
            <label className={label}>定員（午前 / 午後）</label>
            <div className="flex gap-2">
              <input name="capacity_am" type="number" min={0} defaultValue={store.capacity_am} className={`${input} w-20`} />
              <input name="capacity_pm" type="number" min={0} defaultValue={store.capacity_pm} className={`${input} w-20`} />
            </div>
          </div>
          <div>
            <label className={label}>定休日</label>
            <div className="flex flex-wrap gap-2 text-sm">
              {WEEKDAYS.map((w, i) => (
                <label key={i}>
                  <input type="checkbox" name="closed_weekdays" value={i} defaultChecked={closed.includes(i)} /> {w}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className={label}>1日の必要人数（シフト）</label>
            <input name="required_staff" type="number" step="0.5" min={0} defaultValue={store.required_staff} className={`${input} w-20`} />
          </div>
          <div>
            <label className={label}>看護師の最低人数</label>
            <input name="min_nurse" type="number" min={0} defaultValue={store.min_nurse} className={`${input} w-20`} />
          </div>
          <div>
            <label className={label}>機能訓練指導員の最低人数</label>
            <input name="min_trainer" type="number" min={0} defaultValue={store.min_trainer} className={`${input} w-20`} />
          </div>
          <div>
            <label className={label}>時間割の1枠あたりの最大人数</label>
            <input name="slot_capacity" type="number" min={1} defaultValue={store.slot_capacity} className={`${input} w-20`} />
          </div>
          <div className="md:col-span-2">
            <label className={label}>午前の機能訓練・整体の開始時刻（カンマ区切り）</label>
            <input name="am_slots" defaultValue={store.am_slots} className={`${input} w-full`} />
          </div>
          <div className="md:col-span-2">
            <label className={label}>午後の機能訓練・整体の開始時刻（カンマ区切り）</label>
            <input name="pm_slots" defaultValue={store.pm_slots} className={`${input} w-full`} />
          </div>
          <div className="md:col-span-4">
            <button className={btnPrimary}>基本情報を保存</button>
          </div>
        </form>
      </Card>

      <Card title="車両・運転可能スタッフ">
        <p className="mb-3 text-xs text-slate-600">
          乗車可能人数は送迎で乗せられる利用者の人数です。運転可能スタッフを1人も選ばない車両は、「運転」ができる出勤者なら誰でも担当できます。
          {drivers.length === 0 && (
            <span className="ml-1 text-amber-700">
              この店舗に「運転」ができるスタッフがいません（<Link href="/staff" className="underline">スタッフ</Link>で設定）。
            </span>
          )}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full border">
            <thead>
              <tr>
                <th className={th}>車両名</th>
                <th className={th}>乗車可能人数</th>
                <th className={th}>運転可能スタッフ</th>
                <th className={th}>並び順</th>
                <th className={th}>使用中</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody>
              {[...vehicles, null].map((v) => {
                const fid = v ? `v-${v.id}` : "v-new";
                const selected = splitList(v?.driver_ids).map(Number);
                return (
                  <tr key={fid} className={v ? "" : "bg-slate-50"}>
                    <td className={td}>
                      <form action={saveVehicleAction} id={fid} className="contents">
                        <input type="hidden" name="store_id" value={store.id} />
                        {v && <input type="hidden" name="id" value={v.id} />}
                      </form>
                      <input name="name" form={fid} defaultValue={v?.name} placeholder="例: シエンタ" required className={`${input} w-32`} />
                    </td>
                    <td className={td}>
                      <input name="capacity" type="number" min={0} form={fid} defaultValue={v?.capacity ?? 4} className={`${input} w-16`} />
                    </td>
                    <td className={td}>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                        {drivers.map((s) => (
                          <label key={s.id}>
                            <input type="checkbox" name="driver_ids" value={s.id} form={fid} defaultChecked={selected.includes(s.id)} /> {s.name}
                          </label>
                        ))}
                      </div>
                    </td>
                    <td className={td}>
                      <input name="sort_order" type="number" form={fid} defaultValue={v?.sort_order ?? vehicles.length + 1} className={`${input} w-16`} />
                    </td>
                    <td className={`${td} text-center`}>
                      <input type="checkbox" name="active" form={fid} defaultChecked={v ? !!v.active : true} />
                    </td>
                    <td className={`${td} whitespace-nowrap`}>
                      <button form={fid} className={btnPrimary}>
                        {v ? "保存" : "追加"}
                      </button>
                      {v && (
                        <form action={deleteVehicleAction} className="inline">
                          <input type="hidden" name="store_id" value={store.id} />
                          <input type="hidden" name="id" value={v.id} />
                          <button className={btnDanger}>削除</button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="送迎ルート">
        <p className="mb-3 text-xs text-slate-600">
          利用者ごとにルートと順番を設定すると、その順で車両に乗せます。時刻は便ごとの出発時刻の初期値です（スケジュール画面で変更できます）。昼送車と昼迎車は同じ車両・同じ運転者で回ります。
        </p>
        <div className="overflow-x-auto">
          <table className="w-full border">
            <thead>
              <tr>
                <th className={th}>ルート名</th>
                <th className={th}>既定の車両</th>
                <th className={th}>朝迎車</th>
                <th className={th}>昼送車</th>
                <th className={th}>昼迎車</th>
                <th className={th}>帰り送車</th>
                <th className={th}>並び順</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody>
              {[...routes, null].map((r) => {
                const fid = r ? `r-${r.id}` : "r-new";
                return (
                  <tr key={fid} className={r ? "" : "bg-slate-50"}>
                    <td className={td}>
                      <form action={saveRouteAction} id={fid} className="contents">
                        <input type="hidden" name="store_id" value={store.id} />
                        {r && <input type="hidden" name="id" value={r.id} />}
                      </form>
                      <input name="name" form={fid} defaultValue={r?.name} placeholder="例: 北ルート" required className={`${input} w-32`} />
                    </td>
                    <td className={td}>
                      <select name="vehicle_id" form={fid} defaultValue={r?.vehicle_id ?? ""} className={input}>
                        <option value="">未設定</option>
                        {vehicles.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    {(["morning_time", "noon_time", "noon_pick_time", "evening_time"] as const).map((k) => (
                      <td key={k} className={td}>
                        <input name={k} form={fid} defaultValue={r?.[k] ?? ""} placeholder="8:10" className={`${input} w-20`} />
                      </td>
                    ))}
                    <td className={td}>
                      <input name="sort_order" type="number" form={fid} defaultValue={r?.sort_order ?? routes.length + 1} className={`${input} w-16`} />
                    </td>
                    <td className={`${td} whitespace-nowrap`}>
                      <button form={fid} className={btnPrimary}>
                        {r ? "保存" : "追加"}
                      </button>
                      {r && (
                        <form action={deleteRouteAction} className="inline">
                          <input type="hidden" name="store_id" value={store.id} />
                          <input type="hidden" name="id" value={r.id} />
                          <button className={btnDanger}>削除</button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="店舗の削除">
        <form action={deleteStoreAction} className="flex items-center gap-3">
          <input type="hidden" name="id" value={store.id} />
          <p className="text-sm text-slate-600">この店舗の利用者・シフト・スケジュールもすべて削除されます。</p>
          <ConfirmButton message={`「${store.name}」を削除します。元に戻せません。よろしいですか？`} className={`${btnDanger} border border-red-300`}>
            店舗を削除
          </ConfirmButton>
        </form>
      </Card>
    </div>
  );
}
