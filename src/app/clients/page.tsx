import { listClients, listCourses } from "@/lib/repo";
import { CARE_LEVELS, WEEKDAY_LABELS, type Client, type Course } from "@/lib/types";
import { PageTitle, btnDanger, btnPrimary, input, td, th } from "@/components/ui";
import { deleteClientAction, saveClientAction } from "../actions/masters";

export const dynamic = "force-dynamic";

function ClientRow({ c, courses, formId }: { c: Client | null; courses: Course[]; formId: string }) {
  const days = c ? c.default_weekdays.split(",").filter(Boolean).map(Number) : [];
  const pickups = courses.filter((x) => x.kind === "pickup");
  const dropoffs = courses.filter((x) => x.kind === "dropoff");
  return (
    <tr className={c ? "" : "bg-slate-50"}>
      <td className={td}>
        <form action={saveClientAction} id={formId} className="contents">
          {c && <input type="hidden" name="id" value={c.id} />}
          <input name="name" defaultValue={c?.name} placeholder={c ? "" : "新しい利用者名"} className={`${input} w-32`} required />
        </form>
      </td>
      <td className={td}>
        <select name="care_level" form={formId} defaultValue={c?.care_level ?? ""} className={input}>
          <option value="">未設定</option>
          {CARE_LEVELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </td>
      <td className={td}>
        <input name="area" form={formId} defaultValue={c?.area} className={`${input} w-16`} />
      </td>
      <td className={`${td} whitespace-nowrap`}>
        {WEEKDAY_LABELS.map((l, i) => (
          <label key={i} className="mr-1 text-xs">
            <input type="checkbox" name="weekdays" value={i} form={formId} defaultChecked={days.includes(i)} />
            {l}
          </label>
        ))}
      </td>
      <td className={td}>
        <select name="pickup_course_id" form={formId} defaultValue={c?.pickup_course_id ?? ""} className={input}>
          <option value="">送迎なし</option>
          {pickups.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </td>
      <td className={td}>
        <select name="dropoff_course_id" form={formId} defaultValue={c?.dropoff_course_id ?? ""} className={input}>
          <option value="">送迎なし</option>
          {dropoffs.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </td>
      <td className={`${td} text-center`}>
        <input type="checkbox" name="needs_seitai" form={formId} defaultChecked={!!c?.needs_seitai} />
      </td>
      <td className={`${td} text-center`}>
        <input type="checkbox" name="active" form={formId} defaultChecked={c ? !!c.active : true} />
      </td>
      <td className={td}>
        <input name="note" form={formId} defaultValue={c?.note} placeholder="留意点" className={`${input} w-32`} />
      </td>
      <td className={`${td} whitespace-nowrap`}>
        <button form={formId} className={btnPrimary}>
          {c ? "保存" : "追加"}
        </button>
        {c && (
          <form action={deleteClientAction} className="inline ml-1">
            <input type="hidden" name="id" value={c.id} />
            <button className={btnDanger}>削除</button>
          </form>
        )}
      </td>
    </tr>
  );
}

export default function ClientsPage() {
  const clients = listClients();
  const courses = listCourses(true);
  return (
    <div>
      <PageTitle>利用者</PageTitle>
      <p className="text-sm text-slate-600 mb-4">
        利用曜日を設定しておくと、その曜日のスケジュールで自動的に「出席」の初期値になります（当日にお休みへ変更可能）。
      </p>
      <div className="overflow-x-auto">
        <table className="w-full border bg-white">
          <thead>
            <tr>
              <th className={th}>名前</th>
              <th className={th}>介護度</th>
              <th className={th}>エリア</th>
              <th className={th}>利用曜日</th>
              <th className={th}>迎えコース</th>
              <th className={th}>送りコース</th>
              <th className={th}>整体</th>
              <th className={th}>利用中</th>
              <th className={th}>備考</th>
              <th className={th}></th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <ClientRow key={c.id} c={c} courses={courses} formId={`client-${c.id}`} />
            ))}
            <ClientRow c={null} courses={courses} formId="client-new" />
          </tbody>
        </table>
      </div>
    </div>
  );
}
