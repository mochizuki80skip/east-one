"use client";

import Link from "next/link";
import { getDaily, getStore, listClients, listStaff, listVehicles } from "@/lib/data";
import { formatDateJa } from "@/lib/date";
import { links } from "@/lib/links";
import { Notice } from "@/components/ui";
import { Loading } from "@/components/Loading";
import { useLoad } from "@/components/useLoad";
import { useQuery } from "@/components/useQuery";
import { DUTIES, RUNS, SESSIONS, splitList, type RunKind, type Session } from "@/lib/constants";
import { freeStaffBlocks, qualificationSummary } from "@/lib/staffing";
import PrintButton from "@/components/PrintButton";

const TIMETABLE_ROWS = 20;
const cell = "border border-black px-[3px] align-top";
const head = "border border-black bg-slate-100 px-[3px] text-center font-bold";

export default function DailyPrintView() {
  const { store: sid, date } = useQuery();
  const { data, error } = useLoad(
    async () =>
      Promise.all([getStore(sid), getDaily(sid, date), listStaff({ storeId: sid }), listClients(sid, { includeEnded: true }), listVehicles(sid)]),
    [sid, date],
  );
  if (!data) return <Loading error={error} />;
  const [store, d, staffList, clientList, vehicleList] = data;
  if (!store) return <Notice>店舗が見つかりません。</Notice>;
  const staff = new Map(staffList.map((s) => [s.id, s]));
  const clients = new Map(clientList.map((c) => [c.id, c]));
  const vehicles = new Map(vehicleList.map((v) => [v.id, v]));
  const sn = (id: number | null | undefined) => (id != null ? (staff.get(id)?.name ?? "") : "");
  const cn = (id: number) => clients.get(id)?.name ?? "";
  const slots = { am: splitList(store.am_slots), pm: splitList(store.pm_slots) };
  const codeOf = new Map(d.shifts.map((s) => [s.staff_id, s.code]));
  const lite = staffList.map((s) => ({ id: s.id, name: s.name, role: s.role, skills: splitList(s.skills) }));
  const qual = qualificationSummary(
    lite.filter((s) => d.shifts.some((x) => x.staff_id === s.id)),
    (id) => codeOf.get(id),
  );
  const blocks = freeStaffBlocks({ staff: lite, codeOf: (id) => codeOf.get(id), slots, runs: d.runs, training: d.training, duties: d.duties });
  const absent = d.attendance.filter((a) => a.status === "absent");
  const present = (s: Session) => d.attendance.filter((a) => a.session === s && a.status === "present").length;
  const tasks = d.tasks.filter((t) => t.task.trim());

  const runTable = (run: RunKind) => {
    const info = RUNS.find((r) => r.key === run)!;
    const runs = d.runs.filter((r) => r.run === run);
    return (
      <div className="mb-[2mm]">
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] font-bold">{info.label}</span>
          <span className="text-[8px] text-slate-600">{info.note}</span>
        </div>
        <table className="w-full border-collapse text-[9px] leading-tight">
          <tbody>
            {runs.map((r, i) => (
              <tr key={i}>
                <td className={`${cell} w-[15mm] font-semibold`}>{r.vehicle_id ? vehicles.get(r.vehicle_id)?.name : "未定"}</td>
                <td className={`${cell} w-[13mm]`}>
                  {sn(r.driver_id)}
                  {r.escort_id && <div className="text-[8px]">添:{sn(r.escort_id)}</div>}
                </td>
                <td className={`${cell} w-[9mm] font-bold`}>{r.depart_time}</td>
                <td className={cell}>
                  {[...r.riders]
                    .sort((a, b) => a.seq - b.seq)
                    .map((x) => cn(x.client_id))
                    .join("　")}
                </td>
              </tr>
            ))}
            {runs.length === 0 && (
              <tr>
                <td className={`${cell} text-slate-400`}>なし</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  };

  const timetable = (session: Session) => {
    const idx = (t: string) => {
      const i = slots[session].indexOf(t);
      return i < 0 ? 999 : i;
    };
    const list = d.training.filter((t) => t.session === session).sort((a, b) => idx(a.slot_time) - idx(b.slot_time));
    const rows = Math.max(TIMETABLE_ROWS, list.length);
    return (
      <div>
        <div className="text-[11px] font-bold">
          {session === "am" ? "午前" : "午後"} 整体・個別機能訓練 <span className="text-[9px] font-normal">（{list.length}名）</span>
        </div>
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr>
              <th className={`${head} w-[6mm]`}>No</th>
              <th className={`${head} w-[11mm]`}>時刻</th>
              <th className={head}>利用者</th>
              <th className={`${head} w-[15mm]`}>担当</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, i) => {
              const t = list[i];
              const newSlot = t && (i === 0 || list[i - 1].slot_time !== t.slot_time);
              return (
                <tr key={i} className="h-[6.2mm]" style={newSlot && i > 0 ? { borderTop: "2px solid black" } : undefined}>
                  <td className={`${cell} text-center text-[8px] align-middle`}>{i + 1}</td>
                  <td className={`${cell} text-center align-middle font-semibold`}>{t ? (newSlot ? t.slot_time || "未定" : "〃") : ""}</td>
                  <td className={`${cell} align-middle`}>{t ? cn(t.client_id) : ""}</td>
                  <td className={`${cell} align-middle`}>{t ? sn(t.staff_id) : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div>
      <div className="no-print mb-3 flex flex-wrap items-center gap-3">
        <Link href={links.daily(store.id, date)} className="text-sm text-brand-700 underline">
          ← 編集に戻る
        </Link>
        <PrintButton />
        <span className="text-xs text-slate-500">印刷画面で用紙「A4 横」、余白「なし」を選んでください。「PDFに保存」でPDFになります。</span>
        {!d.saved && <span className="text-xs text-amber-700">この日はまだ保存されていません。</span>}
      </div>
      <div className="sheet-landscape flex flex-col gap-[2mm] text-black">
        {/* 上段 */}
        <div className="grid grid-cols-[40mm_1fr_46mm_52mm] gap-[2mm]">
          <div className="flex flex-col border-2 border-black">
            <div className="border-b border-black py-[1mm] text-center text-[18px] font-bold leading-tight">{formatDateJa(date)}</div>
            <div className="flex-1 px-[2mm] py-[1mm] text-[10px] leading-snug">
              <div>
                利用 午前 <b>{present("am")}</b>名 / 午後 <b>{present("pm")}</b>名
              </div>
              <div>
                出勤 午前 <b>{qual.am}</b>名 / 午後 <b>{qual.pm}</b>名
              </div>
              <div className="mt-[1mm] text-[8px] text-slate-600">{store.display_name || store.name}</div>
            </div>
          </div>
          <table className="w-full border-collapse text-[9px] leading-tight">
            <thead>
              <tr>
                <th className={`${head} w-[24mm]`}>出勤状況</th>
                <th className={head}>午前</th>
                <th className={head}>午後</th>
              </tr>
            </thead>
            <tbody>
              {qual.rows.map((r) => (
                <tr key={r.qualification}>
                  <td className={`${cell} font-semibold`}>{r.qualification}</td>
                  <td className={cell}>
                    <b className="mr-1">{r.am.length}</b>
                    {r.am.join(" ")}
                  </td>
                  <td className={cell}>
                    <b className="mr-1">{r.pm.length}</b>
                    {r.pm.join(" ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-col border border-black">
            <div className={`${head} border-0 border-b`}>利用者様休み（{absent.length}）</div>
            <div className="flex-1 p-[1mm] text-[9px] leading-tight">
              {absent.map((a) => (
                <div key={`${a.client_id}${a.session}`}>
                  {cn(a.client_id)}さん<span className="text-[8px]">（{a.session === "am" ? "前" : "後"}・{a.reason}）</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col border border-black">
            <div className={`${head} border-0 border-b`}>特記事項</div>
            <div className="flex-1 whitespace-pre-wrap p-[1mm] text-[9px] leading-tight">{d.memo}</div>
          </div>
        </div>

        {/* 下段 */}
        <div className="grid flex-1 grid-cols-[92mm_1fr_60mm] gap-[2mm] border-t-2 border-black pt-[1.5mm]">
          <div>{RUNS.map((r) => runTable(r.key))}</div>
          <div className="grid grid-cols-2 gap-[2mm]">
            {timetable("am")}
            {timetable("pm")}
          </div>
          <div className="flex flex-col gap-[2mm]">
            <table className="w-full border-collapse text-[9px] leading-tight">
              <thead>
                <tr>
                  <th className={head}>担当</th>
                  {SESSIONS.map((s) => (
                    <th key={s.key} className={head}>
                      {s.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DUTIES.map((duty) => (
                  <tr key={duty}>
                    <td className={`${cell} font-semibold`}>{duty}</td>
                    {SESSIONS.map((s) => (
                      <td key={s.key} className={cell}>
                        {sn(d.duties.find((x) => x.session === s.key && x.duty === duty)?.staff_id)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <div>
              <div className="text-[10px] font-bold">空いているスタッフ</div>
              <table className="w-full border-collapse text-[8px] leading-tight">
                <tbody>
                  {blocks.map((b) => (
                    <tr key={b.key}>
                      <td className={`${cell} w-[17mm] whitespace-nowrap`}>{b.label.replace("体操・メディカルケア・FIT", "体操等")}</td>
                      <td className={cell}>{b.free.map((id) => sn(id)).join(" ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex-1">
              <div className="text-[10px] font-bold">担当業務</div>
              <div className="min-h-[15mm] border border-black p-[1mm] text-[9px] leading-tight">
                {tasks.map((t) => (
                  <div key={t.staff_id}>
                    <b>{sn(t.staff_id)}</b>：{t.task}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
