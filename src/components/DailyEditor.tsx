"use client";

import { useMemo, useState, useTransition } from "react";
import {
  ABSENCE_REASONS,
  DRIVE_SKILL,
  DUTIES,
  isNoonRun,
  RUNS,
  SESSIONS,
  SHIFT_CODES,
  shiftWorks,
  TRAINING_SKILLS,
  type Duty,
  type RunKind,
  type Session,
} from "@/lib/constants";
import type { DailyDetail, DailyRun } from "@/lib/types";
import { dailyReportRow, reasonsTsv, reportRowTsv } from "@/lib/daily-report";
import { freeStaffBlocks, qualificationSummary } from "@/lib/staffing";
import { autoPlanDaily, type PlanContext } from "@/lib/daily-plan";
import { saveDaily } from "@/lib/data";
import { links } from "@/lib/links";
import { btnGreen, btnPrimary, btnSecondary, input, td, th } from "./ui";

type StaffLite = { id: number; name: string; role: string; skills: string[] };
type ClientLite = {
  id: number;
  name: string;
  care_level: string;
  status: string;
  uses_transport: boolean;
  needs_training: boolean;
  route: string;
};
type VehicleLite = { id: number; name: string; capacity: number; driverIds: number[] };

type Props = {
  initial: DailyDetail;
  /** 自動作成に使うデータ（店舗・スタッフ・利用者・車両・ルート・過去の担当） */
  planContext: PlanContext;
  slots: { am: string[]; pm: string[] };
  staff: StaffLite[];
  clients: ClientLite[];
  vehicles: VehicleLite[];
};

/** 時間割の一覧に常に表示する行数 */
const TIMETABLE_ROWS = 20;

const RUN_INFO = Object.fromEntries(RUNS.map((r) => [r.key, r])) as Record<RunKind, (typeof RUNS)[number]>;
/** 利用者の午前/午後に対応する送迎の便 */
const RUNS_OF_SESSION: Record<Session, RunKind[]> = { am: ["morning", "noon_drop"], pm: ["noon_pick", "evening"] };

let keySeq = 0;
const newKey = () => `n${Date.now()}_${keySeq++}`;
const renumber = (riders: DailyRun["riders"]) => riders.map((r, i) => ({ ...r, seq: i + 1 }));

export default function DailyEditor({ initial, planContext, slots, staff, clients, vehicles }: Props) {
  const [d, setD] = useState<DailyDetail>(initial);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [pending, start] = useTransition();

  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);
  const vehicleById = useMemo(() => new Map(vehicles.map((v) => [v.id, v])), [vehicles]);
  const codeOf = new Map(d.shifts.map((s) => [s.staff_id, s.code]));
  const works = (id: number) => shiftWorks(codeOf.get(id));
  const cname = (id: number) => clientById.get(id)?.name ?? "?";
  const sname = (id: number | null) => (id != null ? (staffById.get(id)?.name ?? "?") : "");
  const vname = (id: number | null) => (id != null ? (vehicleById.get(id)?.name ?? "?") : "車両未定");
  const hasSkill = (s: StaffLite, ks: readonly string[]) => s.skills.some((k) => ks.includes(k));

  const update = (fn: (p: DailyDetail) => DailyDetail) => {
    setD(fn);
    setDirty(true);
  };

  // ---------- 出勤 ----------
  const setShift = (staffId: number, code: string) =>
    update((p) => ({ ...p, shifts: p.shifts.map((s) => (s.staff_id === staffId ? { ...s, code } : s)) }));
  const qual = qualificationSummary(staff, (id) => codeOf.get(id));

  // ---------- 出欠 ----------
  const removeFromPlans = (p: DailyDetail, cid: number, session: Session): DailyDetail => ({
    ...p,
    runs: p.runs.map((r) =>
      RUNS_OF_SESSION[session].includes(r.run) ? { ...r, riders: renumber(r.riders.filter((x) => x.client_id !== cid)) } : r,
    ),
    training: p.training.filter((t) => !(t.client_id === cid && t.session === session)),
  });
  const setAtt = (cid: number, session: Session, patch: Partial<DailyDetail["attendance"][number]>) =>
    update((p) => {
      const next = { ...p, attendance: p.attendance.map((a) => (a.client_id === cid && a.session === session ? { ...a, ...patch } : a)) };
      return patch.status === "absent" ? removeFromPlans(next, cid, session) : next;
    });
  const addExtra = (cid: number, session: Session) =>
    update((p) => ({ ...p, attendance: [...p.attendance, { client_id: cid, session, status: "present", reason: "", extra: 1, note: "" }] }));
  const removeExtra = (cid: number, session: Session) =>
    update((p) => removeFromPlans({ ...p, attendance: p.attendance.filter((a) => !(a.client_id === cid && a.session === session)) }, cid, session));
  const presentIds = (session: Session) => d.attendance.filter((a) => a.session === session && a.status === "present").map((a) => a.client_id);

  // ---------- 送迎 ----------
  /** 昼送車・昼迎車は同じ車両なら同じ運転者にそろえる */
  const syncNoonDriver = (runs: DailyRun[], changed: DailyRun): DailyRun[] => {
    if (!isNoonRun(changed.run) || changed.vehicle_id == null) return runs;
    return runs.map((r) =>
      r.key !== changed.key && isNoonRun(r.run) && r.vehicle_id === changed.vehicle_id ? { ...r, driver_id: changed.driver_id } : r,
    );
  };
  const setRun = (key: string, patch: Partial<DailyRun>) =>
    update((p) => {
      let runs = p.runs.map((r) => (r.key === key ? { ...r, ...patch } : r));
      let changed = runs.find((r) => r.key === key)!;
      if ("vehicle_id" in patch && !("driver_id" in patch) && isNoonRun(changed.run)) {
        // 車両を変えたら、もう一方の昼の便でその車両を運転している人を引き継ぐ
        const partner = runs.find((r) => r.key !== key && isNoonRun(r.run) && r.vehicle_id === changed.vehicle_id && r.driver_id != null);
        if (partner) {
          changed = { ...changed, driver_id: partner.driver_id };
          runs = runs.map((r) => (r.key === key ? changed : r));
        }
      }
      return { ...p, runs: syncNoonDriver(runs, changed) };
    });
  const addRun = (run: RunKind) =>
    update((p) => ({ ...p, runs: [...p.runs, { key: newKey(), run, vehicle_id: null, driver_id: null, escort_id: null, depart_time: "", riders: [] }] }));
  const removeRun = (key: string) => update((p) => ({ ...p, runs: p.runs.filter((r) => r.key !== key) }));
  const addRider = (key: string, cid: number) =>
    update((p) => ({
      ...p,
      runs: p.runs.map((r) => (r.key === key ? { ...r, riders: renumber([...r.riders, { client_id: cid, direction: RUN_INFO[r.run].dir, seq: 0 }]) } : r)),
    }));
  const removeRider = (key: string, cid: number) =>
    update((p) => ({ ...p, runs: p.runs.map((r) => (r.key === key ? { ...r, riders: renumber(r.riders.filter((x) => x.client_id !== cid)) } : r)) }));
  const moveRider = (fromKey: string, cid: number, toKey: string) =>
    update((p) => ({
      ...p,
      runs: p.runs.map((r) => {
        if (r.key === fromKey) return { ...r, riders: renumber(r.riders.filter((x) => x.client_id !== cid)) };
        if (r.key === toKey) return { ...r, riders: renumber([...r.riders, { client_id: cid, direction: RUN_INFO[r.run].dir, seq: 0 }]) };
        return r;
      }),
    }));
  const shiftRider = (key: string, cid: number, delta: -1 | 1) =>
    update((p) => ({
      ...p,
      runs: p.runs.map((r) => {
        if (r.key !== key) return r;
        const list = [...r.riders];
        const i = list.findIndex((x) => x.client_id === cid);
        const j = i + delta;
        if (i < 0 || j < 0 || j >= list.length) return r;
        [list[i], list[j]] = [list[j], list[i]];
        return { ...r, riders: renumber(list) };
      }),
    }));
  const unassigned = (run: RunKind) =>
    presentIds(RUN_INFO[run].session)
      .filter((cid) => clientById.get(cid)?.uses_transport)
      .filter((cid) => !d.runs.some((r) => r.run === run && r.riders.some((x) => x.client_id === cid)));
  const driverCands = (run: RunKind) =>
    staff.filter((s) => s.skills.includes(DRIVE_SKILL) && (isNoonRun(run) ? works(s.id).am || works(s.id).pm : works(s.id)[RUN_INFO[run].session]));
  const escortCands = (run: RunKind) => staff.filter((s) => (isNoonRun(run) ? works(s.id).am || works(s.id).pm : works(s.id)[RUN_INFO[run].session]));

  // ---------- 時間割 ----------
  const slotIndex = (session: Session, t: string) => {
    const i = slots[session].indexOf(t);
    return i < 0 ? 999 : i;
  };
  const setTraining = (cid: number, session: Session, patch: Partial<DailyDetail["training"][number]>) =>
    update((p) => ({ ...p, training: p.training.map((t) => (t.client_id === cid && t.session === session ? { ...t, ...patch } : t)) }));
  const addTraining = (cid: number, session: Session) =>
    update((p) => ({ ...p, training: [...p.training, { session, client_id: cid, slot_time: "", staff_id: null }] }));
  const removeTraining = (cid: number, session: Session) =>
    update((p) => ({ ...p, training: p.training.filter((t) => !(t.client_id === cid && t.session === session)) }));
  const trainers = (session: Session) => staff.filter((s) => hasSkill(s, TRAINING_SKILLS) && works(s.id)[session]);

  // ---------- 体操・メディカルケア・FIT ----------
  const dutyOf = (session: Session, duty: Duty) => d.duties.find((x) => x.session === session && x.duty === duty)?.staff_id ?? null;
  const setDuty = (session: Session, duty: Duty, staffId: number | null) =>
    update((p) => ({
      ...p,
      duties: [...p.duties.filter((x) => !(x.session === session && x.duty === duty)), { session, duty, staff_id: staffId }],
    }));

  // ---------- 空いているスタッフ・担当業務 ----------
  const blocks = freeStaffBlocks({ staff, codeOf: (id) => codeOf.get(id), slots, runs: d.runs, training: d.training, duties: d.duties });
  const taskOf = (id: number) => d.tasks.find((t) => t.staff_id === id)?.task ?? "";
  const setTask = (id: number, task: string) =>
    update((p) => ({ ...p, tasks: [...p.tasks.filter((t) => t.staff_id !== id), { staff_id: id, task }] }));
  const onDutyStaff = staff.filter((s) => works(s.id).am || works(s.id).pm);
  const freeCount = (id: number) => blocks.filter((b) => b.free.includes(id)).length;

  // ---------- 操作 ----------
  const auto = () => {
    if ((d.runs.length || d.training.length) && !window.confirm("送迎・時間割・体操等の担当を作り直します。手で直した内容は消えます。よろしいですか？")) return;
    start(async () => {
      const r = autoPlanDaily(d, planContext);
      setD(r.detail);
      setWarnings(r.warnings);
      setDirty(true);
      setMsg("自動作成しました。内容を確認・手直しして保存してください。");
    });
  };
  const save = (then?: () => void) =>
    start(async () => {
      try {
        await saveDaily(d);
        setD((p) => ({ ...p, saved: true }));
        setDirty(false);
        setMsg(`保存しました（${new Date().toLocaleTimeString("ja-JP")}）`);
        then?.();
      } catch (e) {
        setMsg(`保存に失敗しました: ${(e as Error).message}`);
      }
    });
  const print = () => {
    const url = links.dailyPrint(d.store_id, d.date);
    if (!dirty && d.saved) {
      window.open(url, "_blank");
      return;
    }
    const w = window.open("about:blank", "_blank");
    save(() => {
      if (w) w.location.href = url;
    });
  };

  const report = dailyReportRow(d.attendance, (id) => clientById.get(id)?.care_level ?? "");
  const copy = async (text: string, what: string) => {
    await navigator.clipboard.writeText(text);
    setMsg(`${what}をコピーしました。日報シートの該当日の行に貼り付けてください。`);
  };

  const staffSelect = (value: number | null, onChange: (v: number | null) => void, candidates: StaffLite[], extraClass = "") => (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)} className={`${input} ${extraClass}`}>
      <option value="">未定</option>
      {candidates.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
      {value != null && !candidates.some((s) => s.id === value) && <option value={value}>{sname(value)}（対象外）</option>}
    </select>
  );

  return (
    <div className="space-y-5">
      <div className="no-print sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded border bg-white p-2 shadow-sm">
        <button onClick={auto} disabled={pending} className={btnPrimary}>
          ⚡ 送迎・時間割・担当を自動作成
        </button>
        <button onClick={() => save()} disabled={pending || !dirty} className={btnGreen}>
          💾 保存
        </button>
        <button onClick={print} disabled={pending} className={btnSecondary}>
          🖨 A4横で印刷
        </button>
        <span className="text-sm text-slate-600">
          {pending ? "処理中…" : msg}
          {dirty && !pending && <span className="ml-2 text-amber-700">未保存の変更があります</span>}
          {!d.saved && !dirty && <span className="ml-2 text-slate-500">（未保存の日です。出席予定は曜日別利用者枠から作っています）</span>}
        </span>
      </div>
      {warnings.length > 0 && (
        <ul className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {warnings.map((w) => (
            <li key={w}>⚠ {w}</li>
          ))}
        </ul>
      )}

      {/* 1. 出勤状況 */}
      <section className="rounded-lg border bg-white p-4">
        <h2 className="mb-2 font-bold">
          1. 出勤状況{" "}
          <span className="text-sm font-normal text-slate-500">シフト表の内容です。急な休みなどはここで変えると、保存時にシフト表にも反映されます。</span>
        </h2>
        <div className="mb-3 overflow-x-auto">
          <table className="border text-sm">
            <thead>
              <tr>
                <th className={th}>資格</th>
                <th className={th}>午前</th>
                <th className={th}>午後</th>
              </tr>
            </thead>
            <tbody>
              {qual.rows.map((r) => (
                <tr key={r.qualification}>
                  <td className={`${td} font-medium`}>{r.qualification}</td>
                  <td className={td}>
                    <span className={`mr-2 font-bold ${r.am.length ? "" : "text-slate-400"}`}>{r.am.length}名</span>
                    <span className="text-xs text-slate-600">{r.am.join("・")}</span>
                  </td>
                  <td className={td}>
                    <span className={`mr-2 font-bold ${r.pm.length ? "" : "text-slate-400"}`}>{r.pm.length}名</span>
                    <span className="text-xs text-slate-600">{r.pm.join("・")}</span>
                  </td>
                </tr>
              ))}
              <tr className="bg-slate-50">
                <td className={`${td} font-bold`}>出勤者 計</td>
                <td className={`${td} font-bold`}>{qual.am}名</td>
                <td className={`${td} font-bold`}>{qual.pm}名</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-1 text-xs text-slate-500">「生活相談員兼介護職員」のような兼務は、両方の資格に数えています。</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {staff.map((s) => {
            const w = works(s.id);
            const on = w.am || w.pm;
            return (
              <div key={s.id} className={`flex items-center gap-2 rounded border px-2 py-1 ${on ? "border-blue-300 bg-blue-50" : "bg-slate-50 text-slate-500"}`}>
                <div className="flex-1">
                  <div className="text-sm font-medium">{s.name}</div>
                  <div className="text-[11px] text-slate-500">
                    {s.skills.includes(DRIVE_SKILL) ? "🚗" : ""}
                    {s.skills.includes("添乗") ? "🤝" : ""}
                    {hasSkill(s, TRAINING_SKILLS) ? "✋" : ""}
                    {hasSkill(s, DUTIES) ? "🤸" : ""} {s.role}
                  </div>
                </div>
                <select value={codeOf.get(s.id) ?? ""} onChange={(e) => setShift(s.id, e.target.value)} className={`${input} w-20`}>
                  <option value="">-</option>
                  {SHIFT_CODES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
        <p className="mt-1 text-xs text-slate-500">🚗=運転 🤝=添乗 ✋=整体・個別機能訓練 🤸=体操・メディカルケア・FIT</p>
      </section>

      {/* 2. 利用者 */}
      <section className="rounded-lg border bg-white p-4">
        <h2 className="mb-2 font-bold">
          2. 利用者の出欠 <span className="text-sm font-normal text-slate-500">お休みにすると送迎と時間割から外れます。メモは月次報告の材料になります。</span>
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {SESSIONS.map((sess) => {
            const rows = d.attendance.filter((a) => a.session === sess.key);
            const present = rows.filter((a) => a.status === "present").length;
            const addable = clients.filter((c) => c.status !== "終了" && !rows.some((a) => a.client_id === c.id));
            return (
              <div key={sess.key}>
                <div className="mb-1 flex items-center justify-between text-sm font-semibold">
                  <span>
                    {sess.label}　出席 {present} / お休み {rows.length - present}
                  </span>
                  <select value="" onChange={(e) => e.target.value && addExtra(Number(e.target.value), sess.key)} className={`${input} text-xs`}>
                    <option value="">＋ 臨時・振替の利用を追加</option>
                    {addable.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <table className="w-full border">
                  <tbody>
                    {rows
                      .slice()
                      .sort((a, b) => cname(a.client_id).localeCompare(cname(b.client_id), "ja"))
                      .map((a) => {
                        const c = clientById.get(a.client_id);
                        const isP = a.status === "present";
                        return (
                          <tr key={a.client_id} className={isP ? "" : "bg-slate-50 text-slate-500"}>
                            <td className={`${td} whitespace-nowrap`}>
                              {c?.name}
                              <span className="ml-1 text-[11px] text-slate-500">{c?.care_level}</span>
                              {a.extra ? <span className="ml-1 rounded bg-violet-100 px-1 text-[11px] text-violet-700">臨時</span> : null}
                            </td>
                            <td className={td}>
                              <button
                                onClick={() => setAtt(a.client_id, sess.key, { status: isP ? "absent" : "present", reason: isP ? a.reason || "体調不良" : "" })}
                                className={`rounded px-2 py-0.5 text-xs font-semibold ${isP ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"}`}
                              >
                                {isP ? "出席" : "お休み"}
                              </button>
                            </td>
                            <td className={td}>
                              {isP ? (
                                <input
                                  value={a.note}
                                  onChange={(e) => setAtt(a.client_id, sess.key, { note: e.target.value })}
                                  placeholder="今日の様子（例: 歩行安定、笑顔多い）"
                                  className={`${input} w-full min-w-40`}
                                />
                              ) : (
                                <div className="flex gap-1">
                                  <select value={a.reason} onChange={(e) => setAtt(a.client_id, sess.key, { reason: e.target.value })} className={input}>
                                    {ABSENCE_REASONS.map((r) => (
                                      <option key={r}>{r}</option>
                                    ))}
                                  </select>
                                  <input
                                    value={a.note}
                                    onChange={(e) => setAtt(a.client_id, sess.key, { note: e.target.value })}
                                    placeholder="理由の補足"
                                    className={`${input} w-full`}
                                  />
                                </div>
                              )}
                            </td>
                            <td className={`${td} w-6`}>
                              {a.extra ? (
                                <button onClick={() => removeExtra(a.client_id, sess.key)} className="text-red-600" title="臨時利用を取り消す">
                                  ×
                                </button>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    {rows.length === 0 && (
                      <tr>
                        <td className={td}>利用予定の方はいません。</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. 送迎 */}
      <section className="rounded-lg border bg-white p-4">
        <h2 className="mb-2 font-bold">
          3. 送迎{" "}
          <span className="text-sm font-normal text-slate-500">
            昼送車と昼迎車は、同じ車両なら運転者が自動でそろいます。車両・運転・添乗・時刻・乗車順は手で変更できます。
          </span>
        </h2>
        <div className="space-y-5">
          {RUNS.map((rk) => {
            const runs = d.runs.filter((r) => r.run === rk.key);
            const left = unassigned(rk.key);
            const usedDrivers = runs.map((r) => r.driver_id).filter((x): x is number => x != null);
            return (
              <div key={rk.key}>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{rk.label}</h3>
                  <span className="text-xs text-slate-500">{rk.note}</span>
                  <button onClick={() => addRun(rk.key)} className={`${btnSecondary} ml-auto text-xs`}>
                    ＋ 車両を追加
                  </button>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {runs.map((r) => {
                    const v = r.vehicle_id != null ? vehicleById.get(r.vehicle_id) : undefined;
                    const cands = driverCands(rk.key);
                    const allowed = v && v.driverIds.length ? cands.filter((s) => v.driverIds.includes(s.id)) : cands;
                    const dup = r.driver_id != null && usedDrivers.filter((x) => x === r.driver_id).length > 1;
                    const over = v && r.riders.length > v.capacity;
                    return (
                      <div key={r.key} className="rounded border">
                        <div className="flex flex-wrap items-center gap-1 border-b bg-slate-50 p-2">
                          <select
                            value={r.vehicle_id ?? ""}
                            onChange={(e) => setRun(r.key, { vehicle_id: e.target.value ? Number(e.target.value) : null })}
                            className={`${input} font-semibold`}
                          >
                            <option value="">車両未定</option>
                            {vehicles.map((x) => (
                              <option key={x.id} value={x.id}>
                                {x.name}（{x.capacity}名）
                              </option>
                            ))}
                          </select>
                          <input value={r.depart_time} onChange={(e) => setRun(r.key, { depart_time: e.target.value })} placeholder="時刻" className={`${input} w-16`} />
                          <button onClick={() => removeRun(r.key)} className="ml-auto text-xs text-red-600" title="この車両を外す（乗車者は未割り当てに戻ります）">
                            外す
                          </button>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 border-b p-2 text-xs">
                          <span>運転</span>
                          {staffSelect(r.driver_id, (x) => setRun(r.key, { driver_id: x }), allowed, dup ? "border-red-500 text-red-700" : "")}
                          <span>添乗</span>
                          {staffSelect(r.escort_id, (x) => setRun(r.key, { escort_id: x }), escortCands(rk.key))}
                          {dup && <span className="text-red-700">同じ便で重複</span>}
                        </div>
                        <div className={`px-2 pt-1 text-[11px] ${over ? "font-bold text-red-700" : "text-slate-500"}`}>
                          {r.riders.length}名{v ? ` / ${v.capacity}` : ""}
                          {over ? "（乗車可能人数を超えています）" : ""}
                        </div>
                        <ol className="p-1 text-sm">
                          {r.riders.map((x, i) => (
                            <li key={x.client_id} className="flex items-center gap-1 px-1 py-0.5">
                              <span className="w-4 text-xs text-slate-400">{i + 1}</span>
                              <span className="flex-1 truncate">
                                {cname(x.client_id)}
                                <span className="ml-1 text-[10px] text-slate-400">{clientById.get(x.client_id)?.route}</span>
                              </span>
                              <button onClick={() => shiftRider(r.key, x.client_id, -1)} className="px-1 text-slate-500" title="上へ">
                                ↑
                              </button>
                              <button onClick={() => shiftRider(r.key, x.client_id, 1)} className="px-1 text-slate-500" title="下へ">
                                ↓
                              </button>
                              <select
                                value=""
                                onChange={(e) => e.target.value && moveRider(r.key, x.client_id, e.target.value)}
                                className="w-14 rounded border text-[11px]"
                                title="別の車両へ移す"
                              >
                                <option value="">移動</option>
                                {runs
                                  .filter((o) => o.key !== r.key)
                                  .map((o) => (
                                    <option key={o.key} value={o.key}>
                                      {vname(o.vehicle_id)}
                                    </option>
                                  ))}
                              </select>
                              <button onClick={() => removeRider(r.key, x.client_id)} className="px-1 text-red-500" title="外す">
                                ×
                              </button>
                            </li>
                          ))}
                          {r.riders.length === 0 && <li className="p-1 text-xs text-slate-400">乗車なし</li>}
                        </ol>
                      </div>
                    );
                  })}
                  {runs.length === 0 && <p className="text-xs text-slate-400">なし</p>}
                </div>
                {left.length > 0 && (
                  <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-sm">
                    <span className="font-semibold text-amber-900">車両が決まっていない方: </span>
                    {left.map((cid) => (
                      <span key={cid} className="mr-2 inline-flex items-center gap-1">
                        {cname(cid)}
                        <select value="" onChange={(e) => e.target.value && addRider(e.target.value, cid)} className="rounded border text-[11px]">
                          <option value="">乗せる車両</option>
                          {runs.map((o) => (
                            <option key={o.key} value={o.key}>
                              {vname(o.vehicle_id)}
                            </option>
                          ))}
                        </select>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 4. 整体時間割 */}
      <section className="rounded-lg border bg-white p-4">
        <h2 className="mb-2 font-bold">
          4. 整体・個別機能訓練の時間割{" "}
          <span className="text-sm font-normal text-slate-500">午前・午後それぞれ {TIMETABLE_ROWS} 名分の一覧です。同じ時間に同じ担当が重なると赤く表示されます。</span>
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {SESSIONS.map((sess) => {
            const list = d.training
              .filter((t) => t.session === sess.key)
              .sort((a, b) => slotIndex(sess.key, a.slot_time) - slotIndex(sess.key, b.slot_time));
            const cands = trainers(sess.key);
            const missing = presentIds(sess.key).filter((cid) => clientById.get(cid)?.needs_training && !list.some((t) => t.client_id === cid));
            const rowCount = Math.max(TIMETABLE_ROWS, list.length + (missing.length ? 1 : 0));
            return (
              <div key={sess.key}>
                <div className="mb-1 text-sm font-semibold">
                  {sess.label}　{list.length}名（担当できる出勤者 {cands.length} 名）
                </div>
                <table className="w-full border">
                  <thead>
                    <tr>
                      <th className={`${th} w-8`}>No</th>
                      <th className={th}>時刻</th>
                      <th className={th}>利用者</th>
                      <th className={th}>担当</th>
                      <th className={`${th} w-6`}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: rowCount }).map((_, i) => {
                      const t = list[i];
                      if (!t) {
                        const isAddRow = i === list.length && missing.length > 0;
                        return (
                          <tr key={`empty${i}`} className="h-8">
                            <td className={`${td} text-center text-xs text-slate-400`}>{i + 1}</td>
                            <td className={td} />
                            <td className={td} colSpan={3}>
                              {isAddRow && (
                                <select value="" onChange={(e) => e.target.value && addTraining(Number(e.target.value), sess.key)} className={`${input} text-xs`}>
                                  <option value="">＋ 時間割に入っていない方（{missing.length}名）</option>
                                  {missing.map((cid) => (
                                    <option key={cid} value={cid}>
                                      {cname(cid)}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </td>
                          </tr>
                        );
                      }
                      const sameSlot = list.filter((x) => x.slot_time === t.slot_time);
                      const dup = t.staff_id != null && t.slot_time !== "" && sameSlot.filter((x) => x.staff_id === t.staff_id).length > 1;
                      const newSlot = i === 0 || list[i - 1].slot_time !== t.slot_time;
                      return (
                        <tr key={t.client_id} className={newSlot ? "border-t-2 border-slate-400" : ""}>
                          <td className={`${td} text-center text-xs text-slate-500`}>{i + 1}</td>
                          <td className={td}>
                            <select
                              value={t.slot_time}
                              onChange={(e) => setTraining(t.client_id, sess.key, { slot_time: e.target.value })}
                              className={`${input} ${t.slot_time ? "" : "border-amber-500"}`}
                            >
                              <option value="">未定</option>
                              {slots[sess.key].map((s) => (
                                <option key={s}>{s}</option>
                              ))}
                            </select>
                          </td>
                          <td className={td}>{cname(t.client_id)}</td>
                          <td className={td}>
                            {staffSelect(t.staff_id, (x) => setTraining(t.client_id, sess.key, { staff_id: x }), cands, dup ? "border-red-500 text-red-700" : "")}
                          </td>
                          <td className={td}>
                            <button onClick={() => removeTraining(t.client_id, sess.key)} className="text-red-500" title="時間割から外す">
                              ×
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      </section>

      {/* 5. 体操・メディカルケア・FIT */}
      <section className="rounded-lg border bg-white p-4">
        <h2 className="mb-2 font-bold">
          5. 体操・メディカルケア・FIT の担当{" "}
          <span className="text-sm font-normal text-slate-500">自動作成では、昼送車（午前）・昼迎車（午後）の運転・添乗の人を避けて選びます。</span>
        </h2>
        <table className="border text-sm">
          <thead>
            <tr>
              <th className={th}></th>
              {DUTIES.map((x) => (
                <th key={x} className={th}>
                  {x}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SESSIONS.map((sess) => (
              <tr key={sess.key}>
                <td className={`${td} font-medium`}>{sess.label}</td>
                {DUTIES.map((duty) => (
                  <td key={duty} className={td}>
                    {staffSelect(
                      dutyOf(sess.key, duty),
                      (x) => setDuty(sess.key, duty, x),
                      staff.filter((s) => works(s.id)[sess.key]),
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* 6. 空いているスタッフ・担当業務 */}
      <section className="rounded-lg border bg-white p-4">
        <h2 className="mb-2 font-bold">
          6. 空いているスタッフと担当業務{" "}
          <span className="text-sm font-normal text-slate-500">送迎・時間割・体操等の担当が入っていない出勤者を、時間帯ごとに表示します。</span>
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <table className="w-full border text-sm">
            <thead>
              <tr>
                <th className={th}>時間帯</th>
                <th className={th}>空いているスタッフ</th>
              </tr>
            </thead>
            <tbody>
              {blocks.map((b) => (
                <tr key={b.key}>
                  <td className={`${td} whitespace-nowrap text-xs`}>{b.label}</td>
                  <td className={td}>
                    {b.free.length === 0 ? (
                      <span className="text-xs text-slate-400">なし</span>
                    ) : (
                      b.free.map((id) => (
                        <span key={id} className="mr-1 inline-block rounded bg-emerald-50 px-1.5 text-xs text-emerald-800">
                          {sname(id)}
                        </span>
                      ))
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div>
            <table className="w-full border text-sm">
              <thead>
                <tr>
                  <th className={th}>スタッフ</th>
                  <th className={th}>空き</th>
                  <th className={th}>担当業務（空き時間の作業・各自の担当）</th>
                </tr>
              </thead>
              <tbody>
                {onDutyStaff
                  .slice()
                  .sort((a, b) => freeCount(b.id) - freeCount(a.id))
                  .map((s) => (
                    <tr key={s.id}>
                      <td className={`${td} whitespace-nowrap`}>{s.name}</td>
                      <td className={`${td} text-center text-xs`}>
                        {freeCount(s.id)}/{blocks.filter((b) => works(s.id)[b.session]).length}
                      </td>
                      <td className={td}>
                        <input
                          value={taskOf(s.id)}
                          onChange={(e) => setTask(s.id, e.target.value)}
                          placeholder="例: 週報 9:30〜10:30、血圧測定、事務、清掃"
                          className={`${input} w-full`}
                        />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <p className="mt-1 text-xs text-slate-500">「空き」は、その人が勤務している時間帯のうち担当が入っていない数です。印刷時に担当業務欄へ載ります。</p>
          </div>
        </div>
      </section>

      {/* 7. 特記事項 */}
      <section className="rounded-lg border bg-white p-4">
        <h2 className="mb-2 font-bold">7. 特記事項</h2>
        <textarea
          value={d.memo}
          onChange={(e) => update((p) => ({ ...p, memo: e.target.value }))}
          rows={3}
          className={`${input} w-full`}
          placeholder="連絡事項など（印刷時に特記事項欄へ載ります）"
        />
      </section>

      {/* 8. 日報転記 */}
      <section className="no-print rounded-lg border bg-white p-4">
        <h2 className="mb-2 font-bold">
          8. 売上日報への転記 <span className="text-sm font-normal text-slate-500">日報はスプレッドシートが正です。数字をコピーして該当日の行に貼り付けてください。</span>
        </h2>
        <div className="overflow-x-auto">
          <table className="border text-sm">
            <thead>
              <tr>
                {["午前", "午後", "合計", "休 午前", "休 午後", "休 合計", "申請", "事対", "支援", "介護", "自費"].map((h) => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
                <th className="border-0 px-2"></th>
                {ABSENCE_REASONS.map((h) => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {[report.am, report.pm, report.total, report.absAm, report.absPm, report.absTotal, report.groups.申請, report.groups.事対, report.groups.支援, report.groups.介護, report.groups.自費].map(
                  (n, i) => (
                    <td key={i} className={`${td} text-center`}>
                      {n}
                    </td>
                  ),
                )}
                <td className="border-0" />
                {ABSENCE_REASONS.map((r) => (
                  <td key={r} className={`${td} text-center`}>
                    {report.reasons[r]}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button onClick={() => copy(reportRowTsv(report), "利用人数〜介護度（C〜M列）")} className={btnSecondary}>
            📋 利用人数〜介護度をコピー（C〜M列）
          </button>
          <button onClick={() => copy(reasonsTsv(report), "お休み理由")} className={btnSecondary}>
            📋 お休み理由をコピー
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500">合計の列に計算式が入っている場合は、上書きしないよう貼り付け範囲に注意してください。</p>
      </section>
    </div>
  );
}
