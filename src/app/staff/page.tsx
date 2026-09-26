import { listStaff } from "@/lib/repo";
import { PageTitle, btnDanger, btnPrimary, input, td, th } from "@/components/ui";
import { deleteStaffAction, saveStaffAction } from "../actions/masters";

export const dynamic = "force-dynamic";

export default function StaffPage() {
  const staff = listStaff();
  return (
    <div>
      <PageTitle>スタッフ</PageTitle>
      <p className="text-sm text-slate-600 mb-4">
        「運転可」は送迎担当の候補、「整体可」は整体担当の候補になります。並び順は同点時の優先順位です。
      </p>
      <table className="w-full border bg-white">
        <thead>
          <tr>
            <th className={th}>名前</th>
            <th className={th}>運転可</th>
            <th className={th}>整体可</th>
            <th className={th}>在籍</th>
            <th className={th}>並び順</th>
            <th className={th}></th>
          </tr>
        </thead>
        <tbody>
          {staff.map((s) => (
            <tr key={s.id}>
              <td className={td}>
                <form action={saveStaffAction} id={`staff-${s.id}`} className="contents">
                  <input type="hidden" name="id" value={s.id} />
                  <input name="name" defaultValue={s.name} className={input} required />
                </form>
              </td>
              <td className={`${td} text-center`}>
                <input type="checkbox" name="can_drive" form={`staff-${s.id}`} defaultChecked={!!s.can_drive} />
              </td>
              <td className={`${td} text-center`}>
                <input type="checkbox" name="can_seitai" form={`staff-${s.id}`} defaultChecked={!!s.can_seitai} />
              </td>
              <td className={`${td} text-center`}>
                <input type="checkbox" name="active" form={`staff-${s.id}`} defaultChecked={!!s.active} />
              </td>
              <td className={td}>
                <input type="number" name="sort_order" form={`staff-${s.id}`} defaultValue={s.sort_order} className={`${input} w-20`} />
              </td>
              <td className={`${td} whitespace-nowrap`}>
                <button form={`staff-${s.id}`} className={btnPrimary}>
                  保存
                </button>
                <form action={deleteStaffAction} className="inline ml-1">
                  <input type="hidden" name="id" value={s.id} />
                  <button className={btnDanger}>削除</button>
                </form>
              </td>
            </tr>
          ))}
          <tr className="bg-slate-50">
            <td className={td}>
              <form action={saveStaffAction} id="staff-new" className="contents">
                <input name="name" placeholder="新しいスタッフ名" className={input} required />
              </form>
            </td>
            <td className={`${td} text-center`}>
              <input type="checkbox" name="can_drive" form="staff-new" defaultChecked />
            </td>
            <td className={`${td} text-center`}>
              <input type="checkbox" name="can_seitai" form="staff-new" />
            </td>
            <td className={`${td} text-center`}>
              <input type="checkbox" name="active" form="staff-new" defaultChecked />
            </td>
            <td className={td}>
              <input type="number" name="sort_order" form="staff-new" defaultValue={staff.length + 1} className={`${input} w-20`} />
            </td>
            <td className={td}>
              <button form="staff-new" className={btnPrimary}>
                追加
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
