import type { Staff, Store } from "@/lib/types";
import { EMPLOYMENT_TYPES, ROLES, SKILLS, STAFF_STATUSES, splitList, WEEKDAYS } from "@/lib/constants";
import { deleteStaffAction, saveStaffAction } from "@/app/actions/masters";
import ConfirmButton from "./ConfirmButton";
import { Card, btnDanger, btnPrimary, input, label } from "./ui";

export default function StaffForm({ staff, stores, defaultStoreId }: { staff?: Staff; stores: Store[]; defaultStoreId?: number }) {
  const skills = splitList(staff?.skills);
  const storeIds = staff ? splitList(staff.store_ids).map(Number) : defaultStoreId ? [defaultStoreId] : [];
  const days = splitList(staff?.available_weekdays ?? "1,2,3,4,5,6").map(Number);
  return (
    <Card>
      <form action={saveStaffAction} className="grid gap-4 md:grid-cols-3">
        {staff && <input type="hidden" name="id" value={staff.id} />}
        <div>
          <label className={label}>名前</label>
          <input name="name" defaultValue={staff?.name} required className={`${input} w-full`} />
        </div>
        <div>
          <label className={label}>ステータス</label>
          <select name="status" defaultValue={staff?.status ?? "在籍"} className={`${input} w-full`}>
            {STAFF_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>並び順（シフト表の行順）</label>
          <input name="sort_order" type="number" defaultValue={staff?.sort_order ?? 0} className={`${input} w-24`} />
        </div>
        <div>
          <label className={label}>資格・役職</label>
          <select name="role" defaultValue={staff?.role ?? ""} className={`${input} w-full`}>
            <option value="">未設定</option>
            {ROLES.map((r) => (
              <option key={r}>{r}</option>
            ))}
            {staff?.role && !(ROLES as readonly string[]).includes(staff.role) && <option>{staff.role}</option>}
          </select>
        </div>
        <div>
          <label className={label}>勤務形態</label>
          <select name="employment" defaultValue={staff?.employment ?? "A"} className={`${input} w-full`}>
            {EMPLOYMENT_TYPES.map((e) => (
              <option key={e.code} value={e.code}>
                {e.code}：{e.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>週の勤務日数（シフト自動作成の目安）</label>
          <input name="days_per_week" type="number" min={0} max={7} defaultValue={staff?.days_per_week ?? 5} className={`${input} w-24`} />
        </div>
        <div className="md:col-span-3">
          <label className={label}>できること（複数選択）</label>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {SKILLS.map((s) => (
              <label key={s}>
                <input type="checkbox" name="skills" value={s} defaultChecked={skills.includes(s)} /> {s}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-500">「運転」は送迎の運転担当、「整体」「個別機能訓練」は時間割の担当の候補になります。</p>
        </div>
        <div className="md:col-span-2">
          <label className={label}>勤務できる店舗</label>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {stores.map((s) => (
              <label key={s.id}>
                <input type="checkbox" name="store_ids" value={s.id} defaultChecked={storeIds.includes(s.id)} /> {s.name}
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className={label}>勤務できる曜日</label>
          <div className="flex flex-wrap gap-x-2 text-sm">
            {WEEKDAYS.map((w, i) => (
              <label key={i}>
                <input type="checkbox" name="available_weekdays" value={i} defaultChecked={days.includes(i)} />
                {w}
              </label>
            ))}
          </div>
        </div>
        <div className="md:col-span-3">
          <label className={label}>メモ</label>
          <input name="note" defaultValue={staff?.note} className={`${input} w-full`} />
        </div>
        <div className="md:col-span-3 flex items-center gap-3">
          <button className={btnPrimary}>保存</button>
        </div>
      </form>
      {staff && (
        <form action={deleteStaffAction} className="mt-4 border-t pt-3">
          <input type="hidden" name="id" value={staff.id} />
          <ConfirmButton message={`${staff.name} を削除します。シフトの記録も消えます。退職の場合はステータスを「退職」にしてください。`} className={btnDanger}>
            削除
          </ConfirmButton>
        </form>
      )}
    </Card>
  );
}
