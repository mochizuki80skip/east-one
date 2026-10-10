import Link from "next/link";
import { notFound } from "next/navigation";
import { getDaily, getStore, listClients, listStaff, listVehicles } from "@/lib/repo";
import { formatDateJa, isValidDate } from "@/lib/date";
import { RUNS, shiftWorks, splitList, type RunKind, type Session } from "@/lib/constants";
import PrintButton from "@/components/PrintButton";

export default async function DailyPrintPage({ params }: { params: Promise<{ storeId: string; date: string }> }) {
  const { storeId, date } = await params;
  if (!isValidDate(date)) notFound();
  const store = getStore(Number(storeId));
  if (!store) notFound();
  const d = getDaily(store.id, date);
  const staff = new Map(listStaff({ storeId: store.id }).map((s) => [s.id, s]));
  const clients = new Map(listClients(store.id, { includeEnded: true }).map((c) => [c.id, c]));
  const vehicles = new Map(listVehicles(store.id).map((v) => [v.id, v]));
  const sn = (id: number | null) => (id != null ? (staff.get(id)?.name ?? "") : "");
  const cn = (id: number) => clients.get(id)?.name ?? "";

  const onDuty = d.shifts
    .filter((s) => {
      const w = shiftWorks(s.code);
      return w.am || w.pm;
    })
    .map((s) => ({ name: sn(s.staff_id), code: s.code }));
  const absent = d.attendance.filter((a) => a.status === "absent");

  const runTable = (run: RunKind) => {
    const runs = d.runs.filter((r) => r.run === run);
    const label = RUNS.find((r) => r.key === run)!.label;
    return (
      <div>
        <div className="text-[10px] font-bold">{label}</div>
        <table className="w-full border-collapse text-[10px]">
          <tbody>
            {runs.map((r, i) => {
              const names = (dir: "pickup" | "dropoff") =>
                r.riders
                  .filter((x) => x.direction === dir)
                  .sort((a, b) => a.seq - b.seq)
                  .map((x) => cn(x.client_id));
              const drop = names("dropoff");
              const pick = names("pickup");
              return (
                <tr key={i}>
                  <td className="w-16 border border-black px-1">{r.vehicle_id ? vehicles.get(r.vehicle_id)?.name : "未定"}</td>
                  <td className="w-12 border border-black px-1">{sn(r.driver_id)}</td>
                  <td className="w-12 border border-black px-1 text-[9px]">{r.escort_id ? `添:${sn(r.escort_id)}` : ""}</td>
                  <td className="border border-black px-1">
                    <span className="mr-1 font-semibold">{r.depart_time}</span>
                    {drop.join("　")}
                    {drop.length > 0 && pick.length > 0 && " → "}
                    {pick.join("　")}
                  </td>
                </tr>
              );
            })}
            {runs.length === 0 && (
              <tr>
                <td className="border border-black px-1 text-slate-400">なし</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  };

  const timetable = (session: Session) => {
    const slots = splitList(session === "am" ? store.am_slots : store.pm_slots);
    const list = d.training.filter((t) => t.session === session);
    const cols = [...slots, ...(list.some((t) => !t.slot_time) ? [""] : [])];
    return (
      <div>
        <div className="text-[10px] font-bold">{session === "am" ? "午前" : "午後"} 個別機能訓練・整体</div>
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.max(cols.length, 1)}, minmax(0, 1fr))` }}>
          {cols.map((slot) => (
            <div key={slot || "none"}>
              <div className="border-b border-black text-center text-[10px] font-semibold">{slot || "未定"}</div>
              <table className="w-full border-collapse text-[10px]">
                <tbody>
                  {list
                    .filter((t) => t.slot_time === slot)
                    .map((t) => (
                      <tr key={t.client_id}>
                        <td className="border border-black px-0.5">{cn(t.client_id)}</td>
                        <td className="w-10 border border-black px-0.5">{sn(t.staff_id)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="no-print mb-3 flex items-center gap-3">
        <Link href={`/s/${store.id}/daily/${date}`} className="text-sm text-blue-700 underline">
          ← 編集に戻る
        </Link>
        <PrintButton />
        <span className="text-xs text-slate-500">印刷画面で「送信先: PDFに保存」を選ぶとPDFになります（用紙: A4 横）。</span>
        {!d.saved && <span className="text-xs text-amber-700">この日はまだ保存されていません。</span>}
      </div>
      <div className="sheet-landscape flex flex-col gap-2 text-black">
        <div className="grid grid-cols-[150px_1fr_150px_150px] gap-2">
          <div>
            <div className="border border-black text-center text-lg font-bold">{formatDateJa(date)}</div>
            <div className="border border-t-0 border-black text-center text-[10px]">出勤スタッフ</div>
            <div className="min-h-12 border border-t-0 border-black p-1 text-[10px] leading-tight">
              {onDuty.map((s) => (
                <span key={s.name} className="mr-1 inline-block">
                  {s.name}
                  {s.code !== "〇" && <span className="text-[8px]">({s.code})</span>}
                </span>
              ))}
            </div>
          </div>
          {runTable("morning")}
          <div>
            <div className="border border-black text-center text-[10px] font-bold">利用者様休み</div>
            <div className="min-h-16 border border-t-0 border-black p-1 text-[10px] leading-tight">
              {absent.map((a) => (
                <div key={`${a.client_id}${a.session}`}>
                  {cn(a.client_id)}さん<span className="text-[8px]">（{a.session === "am" ? "前" : "後"}・{a.reason}）</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="border border-black text-center text-[10px] font-bold">特記事項</div>
            <div className="min-h-16 whitespace-pre-wrap border border-t-0 border-black p-1 text-[10px] leading-tight">{d.memo}</div>
          </div>
        </div>
        <div className="grid flex-1 grid-cols-[1fr_300px] gap-2 border-t border-black pt-1">
          {timetable("am")}
          {runTable("noon")}
        </div>
        <div className="grid flex-1 grid-cols-[1fr_300px] gap-2 border-t border-black pt-1">
          {timetable("pm")}
          {runTable("evening")}
        </div>
        <div className="text-right text-[8px] text-slate-500">{store.display_name || store.name}</div>
      </div>
    </div>
  );
}
