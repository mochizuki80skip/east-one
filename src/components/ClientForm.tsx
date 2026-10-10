"use client";

import { useRouter } from "next/navigation";
import type { CareManager, Client, ClientSlot, Route } from "@/lib/types";
import { CARE_LEVELS, CLIENT_STATUSES, OPEN_WEEKDAY_ORDER, SESSIONS, WEEKDAYS } from "@/lib/constants";
import { deleteClient } from "@/lib/data";
import { submitClient } from "@/lib/forms";
import { links } from "@/lib/links";
import { Card, btnDanger, btnPrimary, input, label, td, th } from "./ui";

type Props = {
  storeId: number;
  client?: Client;
  slots: ClientSlot[];
  careManagers: CareManager[];
  routes: Route[];
  back: string;
};

export default function ClientForm({ storeId, client, slots, careManagers, routes, back }: Props) {
  const router = useRouter();
  const has = (w: number, s: string) => slots.some((x) => x.weekday === w && x.session === s);
  return (
    <Card>
      <form
        action={async (fd) => {
          await submitClient(fd);
          router.push(back);
        }}
        className="grid gap-4 md:grid-cols-4"
      >
        <input type="hidden" name="store_id" value={storeId} />
        {client && <input type="hidden" name="id" value={client.id} />}
        <div>
          <label className={label}>名前</label>
          <input name="name" defaultValue={client?.name} required className={`${input} w-full`} />
        </div>
        <div>
          <label className={label}>ふりがな（並び順に使用）</label>
          <input name="kana" defaultValue={client?.kana} className={`${input} w-full`} />
        </div>
        <div>
          <label className={label}>介護度</label>
          <select name="care_level" defaultValue={client?.care_level ?? ""} className={`${input} w-full`}>
            <option value="">未設定</option>
            {CARE_LEVELS.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>状態</label>
          <select name="status" defaultValue={client?.status ?? "利用中"} className={`${input} w-full`}>
            {CLIENT_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>性別</label>
          <select name="gender" defaultValue={client?.gender ?? ""} className={`${input} w-full`}>
            <option value="">-</option>
            <option>女</option>
            <option>男</option>
          </select>
        </div>
        <div>
          <label className={label}>生年月日（あれば年齢を自動計算）</label>
          <input name="birth_date" type="date" defaultValue={client?.birth_date} className={`${input} w-full`} />
        </div>
        <div>
          <label className={label}>年齢</label>
          <input name="age" type="number" defaultValue={client?.age ?? ""} className={`${input} w-24`} />
        </div>
        <div>
          <label className={label}>新規・再開</label>
          <select name="new_flag" defaultValue={client?.new_flag ?? ""} className={`${input} w-full`}>
            <option value="">-</option>
            <option>新規</option>
            <option>再開</option>
            <option>日数追加</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <label className={label}>担当ケアマネ</label>
          <select name="care_manager_id" defaultValue={client?.care_manager_id ?? ""} className={`${input} w-full`}>
            <option value="">未設定</option>
            {careManagers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.office ? `${c.office} ` : ""}
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>利用開始日</label>
          <input name="start_date" type="date" defaultValue={client?.start_date} className={`${input} w-full`} />
        </div>
        <div />
        <div className="md:col-span-4">
          <label className={label}>曜日別の利用枠</label>
          <table className="border text-sm">
            <thead>
              <tr>
                <th className={th}></th>
                {OPEN_WEEKDAY_ORDER.map((w) => (
                  <th key={w} className={`${th} text-center`}>
                    {WEEKDAYS[w]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SESSIONS.map((s) => (
                <tr key={s.key}>
                  <td className={td}>{s.label}</td>
                  {OPEN_WEEKDAY_ORDER.map((w) => (
                    <td key={w} className={`${td} text-center`}>
                      <input type="checkbox" name="slots" value={`${w}|${s.key}`} defaultChecked={has(w, s.key)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-end gap-4 text-sm">
          <label>
            <input type="checkbox" name="uses_transport" defaultChecked={client ? !!client.uses_transport : true} /> 送迎あり
          </label>
          <label>
            <input type="checkbox" name="needs_training" defaultChecked={client ? !!client.needs_training : true} /> 機能訓練・整体
          </label>
        </div>
        <div>
          <label className={label}>送迎ルート</label>
          <select name="route_id" defaultValue={client?.route_id ?? ""} className={`${input} w-full`}>
            <option value="">未設定（空いている車両へ）</option>
            {routes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>ルート内の順番</label>
          <input name="route_order" type="number" defaultValue={client?.route_order ?? 0} className={`${input} w-24`} />
        </div>
        <div>
          <label className={label}>住所・目印</label>
          <input name="address" defaultValue={client?.address} className={`${input} w-full`} />
        </div>
        <div className="md:col-span-4">
          <label className={label}>留意事項</label>
          <input name="note" defaultValue={client?.note} className={`${input} w-full`} />
        </div>
        <div className="md:col-span-4">
          <button className={btnPrimary}>保存</button>
        </div>
      </form>
      {client && (
        <div className="mt-4 border-t pt-3">
          <button
            className={btnDanger}
            onClick={async () => {
              if (!window.confirm(`${client.name} 様を削除します。月次報告も消えます。利用終了の場合は削除せず、状態を「終了」にしてください。削除しますか？`)) return;
              await deleteClient(client.id);
              router.push(links.clients(storeId));
            }}
          >
            削除
          </button>
        </div>
      )}
    </Card>
  );
}
