import { listCourses } from "@/lib/repo";
import { PageTitle, btnDanger, btnPrimary, input, td, th } from "@/components/ui";
import { deleteCourseAction, saveCourseAction } from "../actions/masters";

export const dynamic = "force-dynamic";

export default function CoursesPage() {
  const courses = listCourses();
  return (
    <div>
      <PageTitle>送迎コース</PageTitle>
      <p className="text-sm text-slate-600 mb-4">
        「便」は同じ時間帯に走るコースの区分です。同じ種別・同じ便のコースは同じスタッフに割り当てられません（例: 迎え1便A と 迎え1便B は別の人）。
      </p>
      <table className="w-full border bg-white">
        <thead>
          <tr>
            <th className={th}>コース名</th>
            <th className={th}>種別</th>
            <th className={th}>便</th>
            <th className={th}>並び順</th>
            <th className={th}>有効</th>
            <th className={th}></th>
          </tr>
        </thead>
        <tbody>
          {courses.map((c) => (
            <tr key={c.id}>
              <td className={td}>
                <form action={saveCourseAction} id={`course-${c.id}`} className="contents">
                  <input type="hidden" name="id" value={c.id} />
                  <input name="name" defaultValue={c.name} className={`${input} w-full`} required />
                </form>
              </td>
              <td className={td}>
                <select name="kind" form={`course-${c.id}`} defaultValue={c.kind} className={input}>
                  <option value="pickup">迎え</option>
                  <option value="dropoff">送り</option>
                </select>
              </td>
              <td className={td}>
                <input type="number" name="slot" min={1} form={`course-${c.id}`} defaultValue={c.slot} className={`${input} w-16`} />
              </td>
              <td className={td}>
                <input type="number" name="sort_order" form={`course-${c.id}`} defaultValue={c.sort_order} className={`${input} w-16`} />
              </td>
              <td className={`${td} text-center`}>
                <input type="checkbox" name="active" form={`course-${c.id}`} defaultChecked={!!c.active} />
              </td>
              <td className={`${td} whitespace-nowrap`}>
                <button form={`course-${c.id}`} className={btnPrimary}>
                  保存
                </button>
                <form action={deleteCourseAction} className="inline ml-1">
                  <input type="hidden" name="id" value={c.id} />
                  <button className={btnDanger}>削除</button>
                </form>
              </td>
            </tr>
          ))}
          <tr className="bg-slate-50">
            <td className={td}>
              <form action={saveCourseAction} id="course-new" className="contents">
                <input name="name" placeholder="例: 迎え 1便 A（北）" className={`${input} w-full`} required />
              </form>
            </td>
            <td className={td}>
              <select name="kind" form="course-new" defaultValue="pickup" className={input}>
                <option value="pickup">迎え</option>
                <option value="dropoff">送り</option>
              </select>
            </td>
            <td className={td}>
              <input type="number" name="slot" min={1} form="course-new" defaultValue={1} className={`${input} w-16`} />
            </td>
            <td className={td}>
              <input type="number" name="sort_order" form="course-new" defaultValue={courses.length + 1} className={`${input} w-16`} />
            </td>
            <td className={`${td} text-center`}>
              <input type="checkbox" name="active" form="course-new" defaultChecked />
            </td>
            <td className={td}>
              <button form="course-new" className={btnPrimary}>
                追加
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
