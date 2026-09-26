"use client";

import { useMemo, useState, useTransition } from "react";
import type { Client, Course, ScheduleDetail, Staff } from "@/lib/types";
import { autoAssignAction, saveScheduleAction } from "@/app/actions/schedule";
import { btnPrimary, btnSecondary, input, td, th } from "./ui";

type Props = { initial: ScheduleDetail; staff: Staff[]; clients: Client[]; courses: Course[] };

export default function ScheduleEditor({ initial, staff, clients, courses }: Props) {
  const [d, setD] = useState<ScheduleDetail>(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string>("");
  const [dirty, setDirty] = useState(false);

  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);
  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const courseById = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
  const onDuty = staff.filter((s) => d.staffIds.includes(s.id));

  const update = (patch: (prev: ScheduleDetail) => ScheduleDetail) => {
    setD(patch);
    setDirty(true);
  };

  const toggleStaff = (id: number) =>
    update((p) => ({ ...p, staffIds: p.staffIds.includes(id) ? p.staffIds.filter((x) => x !== id) : [...p.staffIds, id] }));

  const setClient = (clientId: number, patch: Partial<ScheduleDetail["clients"][number]>) =>
    update((p) => ({ ...p, clients: p.clients.map((c) => (c.client_id === clientId ? { ...c, ...patch } : c)) }));

  const setCourseStaff = (courseId: number, staffId: number | null) =>
    update((p) => ({ ...p, courses: p.courses.map((c) => (c.course_id === courseId ? { ...c, staff_id: staffId } : c)) }));

  const runAuto = (keepExisting: boolean) =>
    start(async () => {
      if (d.staffIds.length === 0) {
        setMsg("先に出勤スタッフを選んでください。");
        return;
      }
      const res = await autoAssignAction(d, { keepExisting });
      setD(res);
      setDirty(true);
      setMsg("自動割り当てしました。必要に応じて微調整して保存してください。");
    });

  const save = () =>
    start(async () => {
      const r = await saveScheduleAction(d);
      setD((p) => ({ ...p, saved: true }));
      setDirty(false);
      setMsg(`保存しました（${r.savedAt}）`);
    });

  const present = d.clients.filter((c) => c.status === "present");
  const absent = d.clients.filter((c) => c.status === "absent");
  const clientsByCourse = (courseId: number, kind: Course["kind"]) =>
    present
      .filter((c) => (kind === "pickup" ? c.pickup_course_id : c.dropoff_course_id) === courseId)
      .map((c) => clientById.get(c.client_id)?.name ?? "?");

  const staffSelect = (value: number | null, onChange: (v: number | null) => void, filter?: (s: Staff) => boolean) => (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)} className={input}>
      <option value="">未定</option>
      {onDuty.filter(filter ?? (() => true)).map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
      {value != null && !onDuty.some((s) => s.id === value) && (
        <option value={value}>{staffById.get(value)?.name ?? "?"}（非出勤）</option>
      )}
    </select>
  );

  // 担当負荷の集計（偏りの目視用）
  const load = new Map<number, { drive: number; seitai: number }>();
  for (const s of onDuty) load.set(s.id, { drive: 0, seitai: 0 });
  for (const c of d.courses) if (c.staff_id != null && load.has(c.staff_id)) load.get(c.staff_id)!.drive++;
  for (const c of present) if (c.seitai && c.seitai_staff_id != null && load.has(c.seitai_staff_id)) load.get(c.seitai_staff_id)!.seitai++;

  return (
    <div className="space-y-6">
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded border bg-white p-3 shadow-sm">
        <button onClick={() => runAuto(false)} disabled={pending} className={btnPrimary}>
          ⚡ 自動割り当て（全て）
        </button>
        <button onClick={() => runAuto(true)} disabled={pending} className={btnSecondary} title="担当が入っている枠は残し、未定の枠だけ割り当てます">
          未定の枠だけ割り当て
        </button>
        <button onClick={save} disabled={pending || !dirty} className={`${btnPrimary} bg-emerald-600 hover:bg-emerald-700`}>
          💾 保存
        </button>
        <button onClick={() => window.print()} className={btnSecondary}>
          🖨 印刷
        </button>
        <span className="text-sm text-slate-600">
          {pending ? "処理中…" : msg}
          {dirty && !pending && <span className="ml-2 text-amber-700">未保存の変更があります</span>}
          {!d.saved && !dirty && <span className="ml-2 text-slate-500">（この日はまだ未保存。初期値はマスタから生成）</span>}
        </span>
      </div>

      <section className="rounded border bg-white p-4">
        <h2 className="font-bold mb-2">
          1. 出勤スタッフ <span className="text-sm font-normal text-slate-500">({onDuty.length}名)</span>
        </h2>
        <div className="flex flex-wrap gap-2">
          {staff.map((s) => {
            const on = d.staffIds.includes(s.id);
            const l = load.get(s.id);
            return (
              <label
                key={s.id}
                className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${on ? "bg-blue-600 text-white border-blue-600" : "bg-white"}`}
              >
                <input type="checkbox" className="hidden" checked={on} onChange={() => toggleStaff(s.id)} />
                {s.name}
                <span className="ml-1 text-xs opacity-80">
                  {s.can_drive ? "🚗" : ""}
                  {s.can_seitai ? "✋" : ""}
                  {on && l ? ` 送迎${l.drive}/整体${l.seitai}` : ""}
                </span>
              </label>
            );
          })}
        </div>
        <p className="mt-1 text-xs text-slate-500">🚗=運転可 ✋=整体可。選択後に「自動割り当て」を押してください。</p>
      </section>

      <section className="rounded border bg-white p-4">
        <h2 className="font-bold mb-2">
          2. 送迎担当 <span className="text-sm font-normal text-slate-500">前回と同じ担当・同じ便の重複を避けて割り当てます</span>
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {(["pickup", "dropoff"] as const).map((kind) => (
            <table key={kind} className="w-full border">
              <thead>
                <tr>
                  <th className={th}>{kind === "pickup" ? "迎え" : "送り"}</th>
                  <th className={th}>担当</th>
                  <th className={th}>乗車（出席者）</th>
                </tr>
              </thead>
              <tbody>
                {d.courses
                  .map((sc) => ({ sc, c: courseById.get(sc.course_id) }))
                  .filter((x) => x.c && x.c.kind === kind)
                  .map(({ sc, c }) => {
                    const riders = clientsByCourse(sc.course_id, kind);
                    return (
                      <tr key={sc.course_id} className={riders.length === 0 ? "text-slate-400" : ""}>
                        <td className={td}>{c!.name}</td>
                        <td className={td}>{staffSelect(sc.staff_id, (v) => setCourseStaff(sc.course_id, v), (s) => !!s.can_drive)}</td>
                        <td className={`${td} text-xs`}>{riders.length ? riders.join("、") : "（乗車なし）"}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          ))}
        </div>
      </section>

      <section className="rounded border bg-white p-4">
        <h2 className="font-bold mb-2">
          3. 利用者 <span className="text-sm font-normal text-slate-500">出席 {present.length} / お休み {absent.length}</span>
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full border">
            <thead>
              <tr>
                <th className={th}>利用者</th>
                <th className={th}>出欠</th>
                <th className={th}>迎え</th>
                <th className={th}>送り</th>
                <th className={th}>整体</th>
                <th className={th}>整体担当</th>
                <th className={th}>今日の様子メモ（月次に使われます）</th>
              </tr>
            </thead>
            <tbody>
              {d.clients.map((sc) => {
                const c = clientById.get(sc.client_id);
                if (!c) return null;
                const isP = sc.status === "present";
                return (
                  <tr key={sc.client_id} className={isP ? "" : "bg-slate-50 text-slate-400"}>
                    <td className={`${td} whitespace-nowrap`}>
                      {c.name}
                      <span className="ml-1 text-xs text-slate-500">{c.care_level}</span>
                    </td>
                    <td className={td}>
                      <button
                        onClick={() => setClient(sc.client_id, { status: isP ? "absent" : "present", seitai_staff_id: isP ? null : sc.seitai_staff_id })}
                        className={`rounded px-2 py-0.5 text-xs font-semibold ${isP ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"}`}
                      >
                        {isP ? "出席" : "お休み"}
                      </button>
                    </td>
                    <td className={td}>
                      <select
                        value={sc.pickup_course_id ?? ""}
                        disabled={!isP}
                        onChange={(e) => setClient(sc.client_id, { pickup_course_id: e.target.value ? Number(e.target.value) : null })}
                        className={input}
                      >
                        <option value="">なし</option>
                        {courses.filter((x) => x.kind === "pickup").map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className={td}>
                      <select
                        value={sc.dropoff_course_id ?? ""}
                        disabled={!isP}
                        onChange={(e) => setClient(sc.client_id, { dropoff_course_id: e.target.value ? Number(e.target.value) : null })}
                        className={input}
                      >
                        <option value="">なし</option>
                        {courses.filter((x) => x.kind === "dropoff").map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className={`${td} text-center`}>
                      <input
                        type="checkbox"
                        checked={!!sc.seitai}
                        disabled={!isP}
                        onChange={(e) => setClient(sc.client_id, { seitai: e.target.checked ? 1 : 0, seitai_staff_id: e.target.checked ? sc.seitai_staff_id : null })}
                      />
                    </td>
                    <td className={td}>
                      {isP && sc.seitai ? staffSelect(sc.seitai_staff_id, (v) => setClient(sc.client_id, { seitai_staff_id: v }), (s) => !!s.can_seitai) : "—"}
                    </td>
                    <td className={td}>
                      <input
                        value={sc.note}
                        onChange={(e) => setClient(sc.client_id, { note: e.target.value })}
                        placeholder={isP ? "例: 歩行安定、笑顔多い、膝の痛み訴え" : "欠席理由など"}
                        className={`${input} w-full min-w-56`}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded border bg-white p-4">
        <h2 className="font-bold mb-2">4. 連絡事項・メモ</h2>
        <textarea
          value={d.memo}
          onChange={(e) => update((p) => ({ ...p, memo: e.target.value }))}
          rows={3}
          className={`${input} w-full`}
          placeholder="当日の連絡事項など"
        />
      </section>
    </div>
  );
}
