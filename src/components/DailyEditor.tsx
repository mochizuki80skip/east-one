"use client";

import { useMemo, useState, useTransition } from "react";
import {
  ABSENCE_REASONS,
  DRIVE_SKILL,
  RUNS,
  SESSIONS,
  SHIFT_CODES,
  shiftWorks,
  TRAINING_SKILLS,
  type RunKind,
  type Session,
} from "@/lib/constants";
import type { DailyDetail, DailyRun } from "@/lib/types";
import { dailyReportRow, reasonsTsv, reportRowTsv } from "@/lib/daily-report";
import { autoPlanAction, saveDailyAction } from "@/app/actions/daily";
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
type Dir = "pickup" | "dropoff";

type Props = {
  initial: DailyDetail;
  slots: { am: string[]; pm: string[] };
  staff: StaffLite[];
  clients: ClientLite[];
  vehicles: VehicleLite[];
};

/** 利用者の午前/午後に対応する送迎の区間 */
const LEGS: Record<Session, { run: RunKind; dir: Dir }[]> = {
  am: [
    { run: "morning", dir: "pickup" },
    { run: "noon", dir: "dropoff" },
  ],
  pm: [
    { run: "noon", dir: "pickup" },
    { run: "evening", dir: "dropoff" },
  ],
};
const RUN_LEGS: Record<RunKind, { session: Session; dir: Dir }[]> = {
  morning: [{ session: "am", dir: "pickup" }],
  noon: [
    { session: "am", dir: "dropoff" },
    { session: "pm", dir: "pickup" },
  ],
  evening: [{ session: "pm", dir: "dropoff" }],
};
const RUN_WORKS: Record<RunKind, (w: { am: boolean; pm: boolean }) => boolean> = {
  morning: (w) => w.am,
  noon: (w) => w.am || w.pm,
  evening: (w) => w.pm,
};
const DIR_LABEL: Record<Dir, string> = { pickup: "迎", dropoff: "送" };

let keySeq = 0;
const newKey = () => `n${Date.now()}_${keySeq++}`;

function renumber(riders: DailyRun["riders"]): DailyRun["riders"] {
  const out: DailyRun["riders"] = [];
  for (const dir of ["dropoff", "pickup"] as const) riders.filter((r) => r.direction === dir).forEach((r, i) => out.push({ ...r, seq: i + 1 }));
  return out;
}

export default function DailyEditor({ initial, slots, staff, clients, vehicles }: Props) {
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

  const update = (fn: (p: DailyDetail) => DailyDetail) => {
    setD(fn);
    setDirty(true);
  };

  // ---------- 出勤 ----------
  const setShift = (staffId: number, code: string) =>
    update((p) => ({ ...p, shifts: p.shifts.map((s) => (s.staff_id === staffId ? { ...s, code } : s)) }));

  // ---------- 出欠 ----------
  const removeFromPlans = (p: DailyDetail, cid: number, session: Session): DailyDetail => ({
    ...p,
    runs: p.runs.map((r) => ({
      ...r,
      riders: renumber(r.riders.filter((x) => !(x.client_id === cid && LEGS[session].some((l) => l.run === r.run && l.dir === x.direction)))),
    })),
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
  const setRun = (key: string, patch: Partial<DailyRun>) => update((p) => ({ ...p, runs: p.runs.map((r) => (r.key === key ? { ...r, ...patch } : r)) }));
  const addRun = (run: RunKind) =>
    update((p) => ({ ...p, runs: [...p.runs, { key: newKey(), run, vehicle_id: null, driver_id: null, escort_id: null, depart_time: "", riders: [] }] }));
  const removeRun = (key: string) => update((p) => ({ ...p, runs: p.runs.filter((r) => r.key !== key) }));
  const addRider = (key: string, cid: number, dir: Dir) =>
    update((p) => ({
      ...p,
      runs: p.runs.map((r) => (r.key === key ? { ...r, riders: renumber([...r.riders, { client_id: cid, direction: dir, seq: 999 }]) } : r)),
    }));
  const removeRider = (key: string, cid: number, dir: Dir) =>
    update((p) => ({
      ...p,
      runs: p.runs.map((r) => (r.key === key ? { ...r, riders: renumber(r.riders.filter((x) => !(x.client_id === cid && x.direction === dir))) } : r)),
    }));
  const moveRider = (fromKey: string, cid: number, dir: Dir, toKey: string) =>
    update((p) => ({
      ...p,
      runs: p.runs.map((r) => {
        if (r.key === fromKey) return { ...r, riders: renumber(r.riders.filter((x) => !(x.client_id === cid && x.direction === dir))) };
        if (r.key === toKey) return { ...r, riders: renumber([...r.riders, { client_id: cid, direction: dir, seq: 999 }]) };
        return r;
      }),
    }));
  const shiftRider = (key: string, cid: number, dir: Dir, delta: -1 | 1) =>
    update((p) => ({
      ...p,
      runs: p.runs.map((r) => {
        if (r.key !== key) return r;
        const same = r.riders.filter((x) => x.direction === dir);
        const i = same.findIndex((x) => x.client_id === cid);
        const j = i + delta;
        if (i < 0 || j < 0 || j >= same.length) return r;
        [same[i], same[j]] = [same[j], same[i]];
        return { ...r, riders: renumber([...r.riders.filter((x) => x.direction !== dir), ...same]) };
      }),
    }));
  const unassigned = (run: RunKind) =>
    RUN_LEGS[run].flatMap(({ session, dir }) =>
      presentIds(session)
        .filter((cid) => clientById.get(cid)?.uses_transport)
        .filter((cid) => !d.runs.some((r) => r.run === run && r.riders.some((x) => x.client_id === cid && x.direction === dir)))
        .map((cid) => ({ cid, dir })),
    );

  // ---------- 時間割 ----------
  const setTraining = (cid: number, session: Session, patch: Partial<DailyDetail["training"][number]>) =>
    update((p) => ({ ...p, training: p.training.map((t) => (t.client_id === cid && t.session === session ? { ...t, ...patch } : t)) }));
  const addTraining = (cid: number, session: Session) =>
    update((p) => ({ ...p, training: [...p.training, { session, client_id: cid, slot_time: "", staff_id: null }] }));
  const removeTraining = (cid: number, session: Session) =>
    update((p) => ({ ...p, training: p.training.filter((t) => !(t.client_id === cid && t.session === session)) }));
  const trainers = (session: Session) =>
    staff.filter((s) => s.skills.some((k) => (TRAINING_SKILLS as string[]).includes(k)) && works(s.id)[session]);

  // ---------- 操作 ----------
  const auto = () => {
    if ((d.runs.length || d.training.length) && !window.confirm("送迎と時間割を作り直します。手で直した内容は消えます。よろしいですか？")) return;
    start(async () => {
      const r = await autoPlanAction(d);
      setD(r.detail);
      setWarnings(r.warnings);
      setDirty(true);
      setMsg("自動作成しました。内容を確認・手直しして保存してください。");
    });
  };
  const save = (then?: () => void) =>
    start(async () => {
      const r = await saveDailyAction(d);
      setD((p) => ({ ...p, saved: true }));
      setDirty(false);
      setMsg(`保存しました（${r.savedAt}）`);
      then?.();
    });
  const print = () => {
    const url = `/s/${d.store_id}/daily/${d.date}/print`;
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

  const staffSelect = (
    value: number | null,
    onChange: (v: number | null) => void,
    candidates: StaffLite[],
    extraClass = "",
  ) => (
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
          ⚡ 送迎・時間割を自動作成
        </button>
        <button onClick={() => save()} disabled={pending || !dirty} className={btnGreen}>
          💾 保存
        </button>
        <button onClick={print} disabled={pending} className={btnSecondary}>
          🖨 A4で印刷
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

      {/* 1. 出勤スタッフ */}
      <section className="rounded-lg border bg-white p-4">
        <h2 className="mb-2 font-bold">
          1. 出勤スタッフ <span className="text-sm font-normal text-slate-500">シフト表の内容です。急な休みなどはここで変えると、保存時にシフト表にも反映されます。</span>
        </h2>
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
                    {s.skills.some((k) => (TRAINING_SKILLS as string[]).includes(k)) ? "✋" : ""} {s.role}
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
        <p className="mt-1 text-xs text-slate-500">🚗=運転 🤝=添乗 ✋=整体・個別機能訓練</p>
      </section>

      {/* 2. 利用者 */}
      <section className="rounded-lg border bg-white p-4">
        <h2 className="mb-2 font-bold">
          2. 利用者の出欠{" "}
          <span className="text-sm font-normal text-slate-500">
            お休みにすると送迎と時間割から外れます。メモは月次報告の材料になります。
          </span>
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
          3. 送迎 <span className="text-sm font-normal text-slate-500">車両・運転・添乗・時刻・乗車順はすべて手で変更できます。</span>
        </h2>
        <div className="space-y-5">
          {RUNS.map((rk) => {
            const runs = d.runs.filter((r) => r.run === rk.key);
            const drivers = staff.filter((s) => s.skills.includes(DRIVE_SKILL) && RUN_WORKS[rk.key](works(s.id)));
            const escorts = staff.filter((s) => RUN_WORKS[rk.key](works(s.id)));
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
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {runs.map((r) => {
                    const v = r.vehicle_id != null ? vehicleById.get(r.vehicle_id) : undefined;
                    const allowed = v && v.driverIds.length ? drivers.filter((s) => v.driverIds.includes(s.id)) : drivers;
                    const dup = r.driver_id != null && usedDrivers.filter((x) => x === r.driver_id).length > 1;
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
                          <input
                            value={r.depart_time}
                            onChange={(e) => setRun(r.key, { depart_time: e.target.value })}
                            placeholder="時刻"
                            className={`${input} w-16`}
                          />
                          <button onClick={() => removeRun(r.key)} className="ml-auto text-xs text-red-600" title="この車両を外す（乗車者は未割り当てに戻ります）">
                            外す
                          </button>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 border-b p-2 text-xs">
                          <span>運転</span>
                          {staffSelect(r.driver_id, (x) => setRun(r.key, { driver_id: x }), allowed, dup ? "border-red-500 text-red-700" : "")}
                          <span>添乗</span>
                          {staffSelect(r.escort_id, (x) => setRun(r.key, { escort_id: x }), escorts)}
                          {dup && <span className="text-red-700">同じ便で重複</span>}
                        </div>
                        <ol className="divide-y text-sm">
                          {(["dropoff", "pickup"] as const).map((dir) => {
                            const list = r.riders.filter((x) => x.direction === dir);
                            if (list.length === 0) return null;
                            const over = v && list.length > v.capacity;
                            return (
                              <li key={dir} className="p-1">
                                <div className={`px-1 text-[11px] ${over ? "font-bold text-red-700" : "text-slate-500"}`}>
                                  {dir === "pickup" ? "お迎え" : "お送り"} {list.length}名{v ? ` / ${v.capacity}` : ""}
                                  {over ? "（乗車可能人数を超えています）" : ""}
                                </div>
                                {list.map((x, i) => (
                                  <div key={x.client_id} className="flex items-center gap-1 px-1 py-0.5">
                                    <span className="w-4 text-xs text-slate-400">{i + 1}</span>
                                    <span className="flex-1 truncate">
                                      {cname(x.client_id)}
                                      <span className="ml-1 text-[10px] text-slate-400">{clientById.get(x.client_id)?.route}</span>
                                    </span>
                                    <button onClick={() => shiftRider(r.key, x.client_id, dir, -1)} className="px-1 text-slate-500" title="上へ">
                                      ↑
                                    </button>
                                    <button onClick={() => shiftRider(r.key, x.client_id, dir, 1)} className="px-1 text-slate-500" title="下へ">
                                      ↓
                                    </button>
                                    <select
                                      value=""
                                      onChange={(e) => e.target.value && moveRider(r.key, x.client_id, dir, e.target.value)}
                                      className="w-14 rounded border text-[11px]"
                                      title="別の車両へ移す"
                                    >
                                      <option value="">移動</option>
                                      {runs
                                        .filter((o) => o.key !== r.key)
                                        .map((o) => (
                                          <option key={o.key} value={o.key}>
                                            {o.vehicle_id ? vehicleById.get(o.vehicle_id)?.name : "車両未定"}
                                          </option>
                                        ))}
                                    </select>
                                    <button onClick={() => removeRider(r.key, x.client_id, dir)} className="px-1 text-red-500" title="外す">
                                      ×
                                    </button>
                                  </div>
                                ))}
                              </li>
                            );
                          })}
                          {r.riders.length === 0 && <li className="p-2 text-xs text-slate-400">乗車なし</li>}
                        </ol>
                      </div>
                    );
                  })}
                </div>
                {left.length > 0 && (
                  <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-sm">
                    <span className="font-semibold text-amber-900">車両が決まっていない方: </span>
                    {left.map(({ cid, dir }) => (
                      <span key={`${cid}${dir}`} className="mr-2 inline-flex items-center gap-1">
                        {DIR_LABEL[dir]}・{cname(cid)}
                        <select
                          value=""
                          onChange={(e) => e.target.value && addRider(e.target.value, cid, dir)}
                          className="rounded border text-[11px]"
                        >
                          <option value="">乗せる車両</option>
                          {runs.map((o) => (
                            <option key={o.key} value={o.key}>
                              {o.vehicle_id ? vehicleById.get(o.vehicle_id)?.name : "車両未定"}
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

      {/* 4. 時間割 */}
      <section className="rounded-lg border bg-white p-4">
        <h2 className="mb-2 font-bold">
          4. 個別機能訓練・整体の時間割{" "}
          <span className="text-sm font-normal text-slate-500">同じ時間に同じ担当が重なると赤く表示されます。</span>
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {SESSIONS.map((sess) => {
            const list = d.training.filter((t) => t.session === sess.key);
            const slotList = [...slots[sess.key], ""];
            const cands = trainers(sess.key);
            const missing = presentIds(sess.key).filter(
              (cid) => clientById.get(cid)?.needs_training && !list.some((t) => t.client_id === cid),
            );
            return (
              <div key={sess.key}>
                <div className="mb-1 text-sm font-semibold">
                  {sess.label}（担当できる出勤者 {cands.length} 名）
                </div>
                <table className="w-full border">
                  <thead>
                    <tr>
                      <th className={th}>時刻</th>
                      <th className={th}>利用者</th>
                      <th className={th}>担当</th>
                      <th className={th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {slotList.flatMap((slot) => {
                      const inSlot = list.filter((t) => t.slot_time === slot);
                      return inSlot.map((t, i) => {
                        const dup = t.staff_id != null && inSlot.filter((x) => x.staff_id === t.staff_id).length > 1;
                        return (
                          <tr key={t.client_id} className={i === 0 ? "border-t-2 border-slate-300" : ""}>
                            <td className={td}>
                              <select
                                value={t.slot_time}
                                onChange={(e) => setTraining(t.client_id, sess.key, { slot_time: e.target.value })}
                                className={`${input} ${slot ? "" : "border-amber-500"}`}
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
                            <td className={`${td} w-6`}>
                              <button onClick={() => removeTraining(t.client_id, sess.key)} className="text-red-500" title="時間割から外す">
                                ×
                              </button>
                            </td>
                          </tr>
                        );
                      });
                    })}
                    {list.length === 0 && (
                      <tr>
                        <td className={td} colSpan={4}>
                          まだ時間割がありません。「自動作成」を押してください。
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {missing.length > 0 && (
                  <div className="mt-1 text-xs text-amber-800">
                    時間割に入っていない方:{" "}
                    {missing.map((cid) => (
                      <button key={cid} onClick={() => addTraining(cid, sess.key)} className="mr-1 rounded border border-amber-400 px-1 hover:bg-amber-100">
                        ＋{cname(cid)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 5. 特記事項 */}
      <section className="rounded-lg border bg-white p-4">
        <h2 className="mb-2 font-bold">5. 特記事項</h2>
        <textarea
          value={d.memo}
          onChange={(e) => update((p) => ({ ...p, memo: e.target.value }))}
          rows={3}
          className={`${input} w-full`}
          placeholder="週報、担当業務、連絡事項など（印刷時に特記事項欄へ載ります）"
        />
      </section>

      {/* 6. 日報転記 */}
      <section className="no-print rounded-lg border bg-white p-4">
        <h2 className="mb-2 font-bold">
          6. 売上日報への転記 <span className="text-sm font-normal text-slate-500">日報はスプレッドシートが正です。数字をコピーして該当日の行に貼り付けてください。</span>
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
