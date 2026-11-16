"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { isTimeRange, REQUEST_CODES, SHIFT_CODES, shiftLabel, shiftWeight, shiftWorks, WEEKDAYS } from "@/lib/constants";
import { autoShift, checkShift, SOFT_REQUEST, type ShiftRules } from "@/lib/shift-auto";
import { cellMapOf, getShiftMonth, getShiftRev, saveShiftMonth, type Cell } from "@/lib/data";
import type { CellConflict } from "@/lib/merge";
import { btnGreen, btnPrimary, btnSecondary } from "./ui";

type StaffRow = {
  id: number;
  name: string;
  role: string;
  employment: string;
  days_per_week: number;
  available_weekdays: number[];
  sort_order: number;
  /** 雇用区分（正社員・時短社員・パート） */
  contract: string;
  /** 勤務時間のパターン（先頭がいつもの時間） */
  patterns: string[];
  workCode?: string;
};
type Props = {
  storeId: number;
  ym: string;
  dates: string[];
  staff: StaffRow[];
  rules: ShiftRules;
  initialCells: Cell[];
  initialRequests: Cell[];
  /** シフト表の版（別の端末で保存されたかを見分ける） */
  initialRev: number;
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

/** セルの色: 勤務時間は終日なら白、半日なら水色 */
function codeStyle(code: string): string {
  if (isTimeRange(code)) {
    const w = shiftWorks(code);
    return w.am && w.pm ? "bg-white" : "bg-sky-50";
  }
  return CODE_STYLE[code] ?? "";
}

const CONTRACT_SHORT: Record<string, string> = { 正社員: "正", 時短社員: "時短", パート: "パ" };

export default function ShiftEditor({ storeId, ym, dates, staff, rules, initialCells, initialRequests, initialRev, busy }: Props) {
  const [cells, setCells] = useState<Record<string, string>>(() => toMap(initialCells));
  const [requests, setRequests] = useState<Record<string, string>>(() => toMap(initialRequests));
  /** 画面を開いた（前回保存した）ときの内容と版。保存のとき、この画面で変えたマスだけを最新に重ねる */
  const [base, setBase] = useState(() => ({ cells: cellMapOf(initialCells), requests: cellMapOf(initialRequests) }));
  const [rev, setRev] = useState(initialRev);
  /** 同じマスを別の端末でも違う内容に変えていたとき */
  const [conflicts, setConflicts] = useState<CellConflict[] | null>(null);
  /** 画面に戻ったときに分かった、別の端末での保存 */
  const [newer, setNewer] = useState(false);
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
      const old = requests[k] ?? "";
      setRequests((p) => ({ ...p, [k]: v }));
      // 希望を入れたらシフト側にも反映。希望を消したら、シフト側に写した分も消す
      setCells((p) => (v ? { ...p, [k]: v } : p[k] === old ? { ...p, [k]: "" } : p));
    }
    setDirty(true);
  };

  const runAuto = (m: "fill" | "all") => {
    if (m === "all" && !window.confirm("入力済みのシフトを消して作り直します（希望休は残ります）。よろしいですか？")) return;
    start(async () => {
      const k = (c: Cell) => `${c.staff_id}|${c.date}`;
      const r = autoShift({
        dates,
        rules,
        staff,
        requests: new Map(toCells(requests).map((c) => [k(c), c.code])),
        // 希望をそのまま写しただけのセルは固定しない（希望休は「なるべく休み」として扱う）
        locked: m === "fill" ? new Map(toCells(cells).filter((c) => requests[k(c)] !== c.code).map((c) => [k(c), c.code])) : new Map(),
        busyElsewhere: busySet,
      });
      setCells(Object.fromEntries(r.grid));
      setDirty(true);
      const bad = r.checks.filter((c) => c.messages.length).length;
      const name = (id: number) => staff.find((x) => x.id === id)?.name ?? "";
      const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
      setMsg(
        [
          bad ? `自動作成しました。人数が足りない日が ${bad} 日あります（赤の日）。` : "自動作成しました。内容を確認して保存してください。",
          r.overridden.length
            ? `人数が足りないため、希望休を出勤にした日があります（赤枠）: ${r.overridden.map((o) => `${name(o.staff_id)} ${md(o.date)}`).join("、")}`
            : "",
        ]
          .filter(Boolean)
          .join(" "),
      );
    });
  };

  const myStaff = useMemo(() => new Set(staff.map((s) => s.id)), [staff]);
  const mine = (m: Record<string, string>) => Object.fromEntries(Object.entries(m).filter(([, v]) => v));
  const applySaved = (c: Record<string, string>, r: Record<string, string>, nextRev: number) => {
    const myReq = Object.fromEntries(Object.entries(r).filter(([k]) => myStaff.has(Number(k.split("|")[0]))));
    setCells(c);
    setRequests(myReq);
    setBase({ cells: c, requests: myReq });
    setRev(nextRev);
    setDirty(false);
    setConflicts(null);
    setNewer(false);
  };

  /** 保存する。別の端末の変更があれば、この画面で変えたマスだけを重ねる（同じマスを違う内容にしていたら確認） */
  const save = (prefer?: "mine" | "theirs") =>
    start(async () => {
      try {
        const r = await saveShiftMonth(storeId, ym, base, { cells: mine(cells), requests: mine(requests) }, prefer);
        if (r.status === "conflict") {
          setConflicts(r.conflicts);
          setMsg("");
          return;
        }
        applySaved(r.cells, r.requests, r.rev);
        setMsg(
          `保存しました（${new Date().toLocaleTimeString("ja-JP")}）` +
            (r.fromOthers ? `。別のパソコン・端末で直された ${r.fromOthers} マスも合わせて表示しています` : ""),
        );
      } catch (e) {
        setMsg(`保存に失敗しました: ${(e as Error).message}`);
      }
    });

  // 別のタブ・アプリから戻ってきたとき、ほかの端末で保存されていないか確かめる
  const state = useRef({ rev, dirty });
  useEffect(() => {
    state.current = { rev, dirty };
  }, [rev, dirty]);
  useEffect(() => {
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      const latest = await getShiftRev(storeId, ym).catch(() => state.current.rev);
      if (latest === state.current.rev) return;
      if (state.current.dirty) return setNewer(true);
      const m = await getShiftMonth(storeId, staff.map((s) => s.id), ym);
      applySaved(cellMapOf(m.cells), cellMapOf(m.requests), m.rev);
      setMsg("別のパソコン・端末で保存されたシフトを読み込みました。");
    };
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 店舗・月が変わったときだけ付け直す
  }, [storeId, ym]);

  // 保存していない変更があるときは、ページを離れる前に確認する
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const staffName = (id: number) => staff.find((s) => s.id === id)?.name ?? "（他店のスタッフ）";

  const workDays = (sid: number) => dates.reduce((n, d) => n + shiftWeight(cells[`${sid}|${d}`]), 0);
  const paidDays = (sid: number) =>
    dates.reduce((n, d) => {
      const c = cells[`${sid}|${d}`];
      return n + (c === "有" ? 1 : c === "前有" || c === "後有" ? 0.5 : 0);
    }, 0);

  const fixedCodes = SHIFT_CODES.map((c) => c.code as string);
  /** 希望休を出しているのに出勤になっているセル */
  const unmet = (k: string) => requests[k] === SOFT_REQUEST && shiftWeight(cells[k]) > 0;
  const requestCount = (sid: number) => dates.filter((d) => requests[`${sid}|${d}`] === SOFT_REQUEST).length;
  const unmetCount = (sid: number) => dates.filter((d) => unmet(`${sid}|${d}`)).length;

  return (
    <div className="space-y-3">
      <div className="no-print sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded border bg-white p-2 shadow-sm">
        <div className="flex overflow-hidden rounded border">
          <button onClick={() => setMode("shift")} className={`px-3 py-1.5 text-sm ${mode === "shift" ? "bg-brand-600 text-white" : "bg-white"}`}>
            シフト入力
          </button>
          <button onClick={() => setMode("request")} className={`px-3 py-1.5 text-sm ${mode === "request" ? "bg-amber-500 text-white" : "bg-white"}`}>
            📅 希望休を入力
          </button>
        </div>
        <button onClick={() => runAuto("fill")} disabled={pending} className={btnPrimary} title="入力済みのセルは残し、空欄だけ埋めます">
          ⚡ 自動作成（空欄を埋める）
        </button>
        <button onClick={() => runAuto("all")} disabled={pending} className={btnSecondary}>
          全て作り直す
        </button>
        <button onClick={() => save()} disabled={pending || !dirty || !!conflicts} className={btnGreen}>
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

      {newer && !conflicts && (
        <p data-newer className="no-print rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          別のパソコン・端末でこの月のシフトが保存されました。保存すると、向こうで直したマスとこちらで直したマスを合わせて保存します（同じマスを違う内容にしていたら確認します）。
        </p>
      )}
      {conflicts && (
        <div data-conflict className="no-print space-y-2 rounded border-2 border-red-300 bg-red-50 p-3 text-sm">
          <p className="font-bold text-red-800">別のパソコン・端末でも、同じマスが違う内容に直されていました（{conflicts.length} マス）。まだ保存していません。</p>
          <p className="text-red-900">ほかのマスの変更は両方とも残ります。下のマスだけ、どちらにするか選んでください。</p>
          <table className="border bg-white text-xs">
            <thead>
              <tr>
                <th className="border px-2 py-1">スタッフ</th>
                <th className="border px-2 py-1">日付</th>
                <th className="border px-2 py-1">こちら</th>
                <th className="border px-2 py-1">向こう（先に保存）</th>
              </tr>
            </thead>
            <tbody>
              {conflicts.map((c) => {
                const [sid, d] = c.key.split("|");
                return (
                  <tr key={c.key}>
                    <td className="border px-2 py-1">{staffName(Number(sid))}</td>
                    <td className="border px-2 py-1">
                      {Number(d.slice(5, 7))}/{Number(d.slice(8, 10))}
                    </td>
                    <td className="border px-2 py-1 font-semibold">{c.mine ? shiftLabel(c.mine) : "（空欄）"}</td>
                    <td className="border px-2 py-1 font-semibold">{c.theirs ? shiftLabel(c.theirs) : "（空欄）"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => save("mine")} disabled={pending} className={btnPrimary}>
              こちらを優先して保存
            </button>
            <button onClick={() => save("theirs")} disabled={pending} className={btnSecondary}>
              向こうを優先して保存
            </button>
          </div>
        </div>
      )}

      {mode === "request" && (
        <div className="no-print space-y-1 rounded bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <p className="font-semibold">希望休を入力しています。日付のマスを押して「希休」を選び、最後に 💾 保存 を押してください。</p>
          <p>
            ・<b>希休（希望休）</b>は「なるべく休み」です。自動作成はまず休みにして組みますが、その日の必要人数・看護師・機能訓練指導員が足りないときは出勤になることがあります（赤枠で表示し、名前と日付をお知らせします）。
          </p>
          <p>
            ・<b>有・前有・後有（有給）</b>は必ず休みにします。
          </p>
          <p>・入れ終わったら「シフト入力」に戻り、⚡ 自動作成 を押してください。</p>
        </div>
      )}

      <div className="overflow-x-auto rounded border bg-white print:overflow-visible">
        <table className="border-collapse text-xs">
          <thead>
            <tr>
              <th className="border bg-slate-100 px-1 py-1 text-left">資格・役職</th>
              <th className="border bg-slate-100 px-1">形態</th>
              <th className="border bg-slate-100 px-1">区分</th>
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
              <th className="border bg-slate-100 px-1" title="希望休の数（出勤になった数）">希望休</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id}>
                <td className="max-w-36 truncate border bg-white px-1" title={s.role}>
                  {s.role}
                </td>
                <td className="border px-1 text-center">{s.employment}</td>
                <td className="whitespace-nowrap border px-1 text-center text-[11px]" title={s.contract ? `${s.contract}　${s.patterns.join("、")}` : "雇用区分が未設定"}>
                  {CONTRACT_SHORT[s.contract] ?? "-"}
                </td>
                <td className="sticky left-0 z-10 whitespace-nowrap border bg-white px-1 font-medium">{s.name}</td>
                {dates.map((d) => {
                  const k = `${s.id}|${d}`;
                  const code = cells[k] ?? "";
                  const req = requests[k] ?? "";
                  const value = mode === "shift" ? code : req;
                  return (
                    <td
                      key={d}
                      className={`relative border p-0 text-center ${mode === "request" ? (req ? codeStyle(req) : "") : codeStyle(code)} ${unmet(k) ? "outline outline-2 -outline-offset-2 outline-red-500" : ""}`}
                    >
                      <select
                        value={value}
                        onChange={(e) => setCell(k, e.target.value)}
                        className="no-print h-7 w-[4.25rem] cursor-pointer appearance-none bg-transparent text-center text-[11px] tracking-tight"
                        title={
                          busySet.has(k)
                            ? "他店舗で勤務が入っています"
                            : unmet(k)
                              ? "希望休でしたが、人数が足りないため出勤になっています"
                              : req
                                ? `希望: ${req}`
                                : code
                        }
                      >
                        <option value=""></option>
                        {mode === "shift" ? (
                          <>
                            <optgroup label="勤務時間">
                              {[...new Set([...s.patterns, ...(isTimeRange(code) ? [code] : [])])].map((o) => (
                                <option key={o} value={o}>
                                  {shiftLabel(o)}
                                </option>
                              ))}
                            </optgroup>
                            <optgroup label="記号">
                              {fixedCodes.map((o) => (
                                <option key={o} value={o}>
                                  {o}
                                </option>
                              ))}
                            </optgroup>
                          </>
                        ) : (
                          REQUEST_CODES.map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))
                        )}
                      </select>
                      <span className="hidden text-[10px] print:inline">{shiftLabel(code)}</span>
                      {req && mode === "shift" && <span className="absolute right-0 top-0 h-1.5 w-1.5 rounded-full bg-amber-500" />}
                    </td>
                  );
                })}
                <td className="border px-1 text-center">
                  {workDays(s.id)}
                  <span className="text-slate-400">/{Math.round((s.days_per_week * dates.filter((d) => !closed.has(new Date(`${d}T00:00:00`).getDay())).length) / Math.max(1, 7 - closed.size))}</span>
                </td>
                <td className="border px-1 text-center">{paidDays(s.id) || ""}</td>
                <td className="whitespace-nowrap border px-1 text-center">
                  {requestCount(s.id) || ""}
                  {unmetCount(s.id) > 0 && <span className="ml-0.5 text-red-600">（出{unmetCount(s.id)}）</span>}
                </td>
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
                <td colSpan={4} className="sticky left-0 z-10 border bg-slate-50 px-1 font-semibold">
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
                <td colSpan={3} className="border" />
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
        <span className="rounded border bg-white px-1.5 py-0.5">9-17:30 など: 勤務時間（スタッフ登録のパターン）。半日勤務は水色、0.5人と数えます</span>
        <span className="rounded border px-1.5 py-0.5">
          <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
          希望あり
        </span>
        <span className="rounded border px-1.5 py-0.5">
          <span className="mr-1 inline-block h-2.5 w-3 align-middle outline outline-2 -outline-offset-2 outline-red-500" />
          希望休だが出勤（人数不足）
        </span>
      </div>
    </div>
  );
}
