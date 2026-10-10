"use client";

import { useMemo, useState, useTransition } from "react";
import { REQUEST_CODES, SHIFT_CODES, shiftWeight, WEEKDAYS } from "@/lib/constants";
import { checkShift, type ShiftRules } from "@/lib/shift-auto";
import { autoShiftAction, saveShiftAction, type Cell } from "@/app/actions/shift";
import { btnGreen, btnPrimary, btnSecondary } from "./ui";

type StaffRow = { id: number; name: string; role: string; employment: string; days_per_week: number };
type Props = {
  storeId: number;
  ym: string;
  dates: string[];
  staff: StaffRow[];
  rules: ShiftRules;
  initialCells: Cell[];
  initialRequests: Cell[];
  busy: string[];
};

const toMap = (cells: Cell[]) => Object.fromEntries(cells.map((c) => [`${c.staff_id}|${c.date}`, c.code])) as Record<string, string>;
const toCells = (m: Record<string, string>): Cell[] =>
  Object.entries(m)
    .filter(([, v]) => v)
    .map(([k, code]) => {
      const [sid, date] = k.split("|");
      return { staff_id: Number(sid), date, code };
    });

const CODE_STYLE: Record<string, string> = {
  "〇": "bg-white",
  午前: "bg-sky-50",
  午後: "bg-sky-50",
  休: "bg-slate-100 text-slate-500",
  希休: "bg-amber-100 text-amber-800",
  有: "bg-emerald-100 text-emerald-800",
  前有: "bg-emerald-50 text-emerald-800",
  後有: "bg-emerald-50 text-emerald-800",
  日: "bg-slate-200 text-slate-500",
  他店: "bg-violet-100 text-violet-800",
};

export default function ShiftEditor({ storeId, ym, dates, staff, rules, initialCells, initialRequests, busy }: Props) {
  const [cells, setCells] = useState<Record<string, string>>(() => toMap(initialCells));
  const [requests, setRequests] = useState<Record<string, string>>(() => toMap(initialRequests));
  const [mode, setMode] = useState<"shift" | "request">("shift");
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const busySet = useMemo(() => new Set(busy), [busy]);
  const closed = new Set(rules.closedWeekdays);

  const grid = useMemo(() => new Map(Object.entries(cells)), [cells]);
  const checks = useMemo(() => checkShift(dates, staff, rules, grid), [dates, staff, rules, grid]);

  const setCell = (k: string, v: string) => {
    if (mode === "shift") setCells((p) => ({ ...p, [k]: v }));
    else {
      setRequests((p) => ({ ...p, [k]: v }));
      // 希望を入れたらシフト側にも反映
      if (v) setCells((p) => ({ ...p, [k]: v }));
    }
    setDirty(true);
  };

  const runAuto = (m: "fill" | "all") => {
    if (m === "all" && !window.confirm("入力済みのシフトを消して作り直します（希望休は残ります）。よろしいですか？")) return;
    start(async () => {
      const r = await autoShiftAction(storeId, ym, toCells(cells), toCells(requests), m);
      setCells(toMap(r.cells));
      setDirty(true);
      const bad = r.checks.filter((c) => c.messages.length).length;
      setMsg(bad ? `自動作成しました。人数が足りない日が ${bad} 日あります（赤の日）。` : "自動作成しました。内容を確認して保存してください。");
    });
  };

  const save = () =>
    start(async () => {
      const r = await saveShiftAction(storeId, ym, toCells(cells), toCells(requests));
      setDirty(false);
      setMsg(`保存しました（${r.savedAt}）`);
    });

  const workDays = (sid: number) => dates.reduce((n, d) => n + shiftWeight(cells[`${sid}|${d}`]), 0);
  const paidDays = (sid: number) =>
    dates.reduce((n, d) => {
      const c = cells[`${sid}|${d}`];
      return n + (c === "有" ? 1 : c === "前有" || c === "後有" ? 0.5 : 0);
    }, 0);

  const options = mode === "shift" ? SHIFT_CODES.map((c) => c.code as string) : [...REQUEST_CODES];

  return (
    <div className="space-y-3">
      <div className="no-print sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded border bg-white p-2 shadow-sm">
        <div className="flex overflow-hidden rounded border">
          <button onClick={() => setMode("shift")} className={`px-3 py-1.5 text-sm ${mode === "shift" ? "bg-slate-800 text-white" : "bg-white"}`}>
            シフト入力
          </button>
          <button onClick={() => setMode("request")} className={`px-3 py-1.5 text-sm ${mode === "request" ? "bg-amber-500 text-white" : "bg-white"}`}>
            希望休入力
          </button>
        </div>
        <button onClick={() => runAuto("fill")} disabled={pending} className={btnPrimary} title="入力済みのセルは残し、空欄だけ埋めます">
          ⚡ 自動作成（空欄を埋める）
        </button>
        <button onClick={() => runAuto("all")} disabled={pending} className={btnSecondary}>
          全て作り直す
        </button>
        <button onClick={save} disabled={pending || !dirty} className={btnGreen}>
          💾 保存
        </button>
        <button onClick={() => window.print()} className={btnSecondary}>
          🖨 印刷
        </button>
        <span className="text-sm text-slate-600">
          {pending ? "処理中…" : msg}
          {dirty && !pending && <span className="ml-2 text-amber-700">未保存の変更があります</span>}
        </span>
      </div>

      {mode === "request" && (
        <p className="no-print rounded bg-amber-50 px-3 py-2 text-sm text-amber-900">
          希望休入力モード: スタッフから出た希望休（希休）・有給（有・前有・後有）を入れてください。自動作成はこの希望を必ず守ります。
        </p>
      )}

      <div className="overflow-x-auto rounded border bg-white print:overflow-visible">
        <table className="border-collapse text-xs">
          <thead>
            <tr>
              <th className="border bg-slate-100 px-1 py-1 text-left">資格・役職</th>
              <th className="border bg-slate-100 px-1">形態</th>
              <th className="sticky left-0 z-10 border bg-slate-100 px-1 text-left">スタッフ名</th>
              {dates.map((d) => {
                const dt = new Date(`${d}T00:00:00`);
                const wd = dt.getDay();
                return (
                  <th key={d} className={`border px-0.5 py-1 text-center ${closed.has(wd) ? "bg-slate-200" : wd === 6 ? "bg-sky-50" : "bg-slate-50"}`}>
                    <div>{dt.getDate()}</div>
                    <div className={wd === 0 ? "text-red-600" : wd === 6 ? "text-sky-700" : ""}>{WEEKDAYS[wd]}</div>
                  </th>
                );
              })}
              <th className="border bg-slate-100 px-1">出勤</th>
              <th className="border bg-slate-100 px-1">有給</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id}>
                <td className="max-w-36 truncate border bg-white px-1" title={s.role}>
                  {s.role}
                </td>
                <td className="border px-1 text-center">{s.employment}</td>
                <td className="sticky left-0 z-10 whitespace-nowrap border bg-white px-1 font-medium">{s.name}</td>
                {dates.map((d) => {
                  const k = `${s.id}|${d}`;
                  const code = cells[k] ?? "";
                  const req = requests[k] ?? "";
                  const value = mode === "shift" ? code : req;
                  return (
                    <td key={d} className={`relative border p-0 text-center ${CODE_STYLE[code] ?? ""}`}>
                      <select
                        value={value}
                        onChange={(e) => setCell(k, e.target.value)}
                        className="no-print h-7 w-11 cursor-pointer appearance-none bg-transparent text-center text-xs"
                        title={busySet.has(k) ? "他店舗で勤務が入っています" : req ? `希望: ${req}` : ""}
                      >
                        <option value=""></option>
                        {options.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                      <span className="hidden print:inline">{code}</span>
                      {req && mode === "shift" && <span className="absolute right-0 top-0 h-1.5 w-1.5 rounded-full bg-amber-500" />}
                    </td>
                  );
                })}
                <td className="border px-1 text-center">
                  {workDays(s.id)}
                  <span className="text-slate-400">/{Math.round((s.days_per_week * dates.filter((d) => !closed.has(new Date(`${d}T00:00:00`).getDay())).length) / Math.max(1, 7 - closed.size))}</span>
                </td>
                <td className="border px-1 text-center">{paidDays(s.id) || ""}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {(
              [
                ["出勤者数", (c: (typeof checks)[number]) => c.workers, (c: (typeof checks)[number]) => c.workers < rules.required],
                ["必要人数", () => rules.required, () => false],
                ["介護職員数", (c: (typeof checks)[number]) => c.care, () => false],
                ["機能訓練指導員数", (c: (typeof checks)[number]) => c.trainers, (c: (typeof checks)[number]) => c.trainers < rules.minTrainer],
                ["看護師", (c: (typeof checks)[number]) => c.nurses, (c: (typeof checks)[number]) => c.nurses < rules.minNurse],
              ] as const
            ).map(([labelText, val, bad]) => (
              <tr key={labelText}>
                <td colSpan={3} className="sticky left-0 z-10 border bg-slate-50 px-1 font-semibold">
                  {labelText}
                </td>
                {checks.map((c) => {
                  const isClosed = closed.has(new Date(`${c.date}T00:00:00`).getDay());
                  return (
                    <td key={c.date} className={`border text-center ${isClosed ? "bg-slate-200 text-slate-400" : bad(c) ? "bg-red-100 font-bold text-red-700" : ""}`}>
                      {isClosed ? "" : val(c)}
                    </td>
                  );
                })}
                <td colSpan={2} className="border" />
              </tr>
            ))}
          </tfoot>
        </table>
      </div>
      <div className="no-print flex flex-wrap gap-2 text-xs text-slate-600">
        {SHIFT_CODES.map((c) => (
          <span key={c.code} className={`rounded border px-1.5 py-0.5 ${CODE_STYLE[c.code] ?? "bg-white"}`}>
            {c.code}: {c.label}
          </span>
        ))}
        <span className="rounded border px-1.5 py-0.5">
          <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
          希望あり
        </span>
      </div>
    </div>
  );
}
