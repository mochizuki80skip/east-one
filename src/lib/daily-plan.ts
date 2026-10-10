import { DRIVE_SKILL, shiftWorks, splitList, TRAINING_SKILLS, type RunKind, type Session } from "./constants";
import { buildTrainingHistory, buildTransportHistory, getStore, listClients, listRoutes, listStaff, listVehicles } from "./repo";
import { planTransport, type TRider } from "./transport";
import { planTraining } from "./timetable";
import { planDuties } from "./staffing";
import type { DailyDetail, DailyRun, DailyTraining } from "./types";

/** 日々のスケジュールの自動作成（送迎＋機能訓練・整体の時間割）。DB には保存しない。 */
export function autoPlanDaily(detail: DailyDetail): { detail: DailyDetail; warnings: string[] } {
  const storeId = detail.store_id;
  const store = getStore(storeId);
  if (!store) throw new Error("store not found");
  const staff = listStaff({ storeId, activeOnly: true });
  const clients = new Map(listClients(storeId, { includeEnded: true }).map((c) => [c.id, c]));
  const vehicles = listVehicles(storeId, true);
  const routes = listRoutes(storeId);
  const warnings: string[] = [];

  const codeOf = new Map(detail.shifts.map((s) => [s.staff_id, s.code]));
  if (![...codeOf.values()].some(Boolean)) warnings.push("この日のシフトが未入力です。出勤スタッフの勤務を選んでから自動作成してください。");
  const works = (id: number) => shiftWorks(codeOf.get(id));
  const skills = (id: number) => splitList(staff.find((s) => s.id === id)?.skills);

  const present = (session: Session) =>
    detail.attendance.filter((a) => a.session === session && a.status === "present" && clients.has(a.client_id)).map((a) => a.client_id);
  const amIds = present("am");
  const pmIds = present("pm");

  // ---- 送迎 ----
  const toRider = (cid: number): TRider | null => {
    const c = clients.get(cid)!;
    return c.uses_transport ? { clientId: cid, routeId: c.route_id, routeOrder: c.route_order } : null;
  };
  const driversFor = (pred: (w: { am: boolean; pm: boolean }) => boolean) =>
    staff.filter((s) => skills(s.id).includes(DRIVE_SKILL) && pred(works(s.id))).map((s) => ({ id: s.id, sortOrder: s.sort_order }));

  const t = planTransport({
    amRiders: amIds.map(toRider).filter((x): x is TRider => x != null),
    pmRiders: pmIds.map(toRider).filter((x): x is TRider => x != null),
    vehicles: vehicles.map((v) => ({
      id: v.id,
      capacity: v.capacity,
      sortOrder: v.sort_order,
      allowedDriverIds: splitList(v.driver_ids).map(Number),
    })),
    routes: routes.map((r) => ({
      id: r.id,
      vehicleId: r.vehicle_id,
      sortOrder: r.sort_order,
      times: { morning: r.morning_time, noon_drop: r.noon_time, noon_pick: r.noon_pick_time, evening: r.evening_time },
    })),
    drivers: {
      morning: driversFor((w) => w.am),
      noon_drop: driversFor((w) => w.am),
      noon_pick: driversFor((w) => w.pm),
      evening: driversFor((w) => w.pm),
    },
    history: buildTransportHistory(storeId, detail.date),
  });
  if (vehicles.length === 0) warnings.push("車両が登録されていません（店舗設定で登録してください）。");
  warnings.push(...t.warnings);

  let n = 0;
  const runs: DailyRun[] = t.runs.map((r) => ({
    key: `new${n++}`,
    run: r.run,
    vehicle_id: r.vehicleId,
    driver_id: r.driverId,
    escort_id: null,
    depart_time: r.departTime,
    riders: r.riders.map((x) => ({ client_id: x.clientId, direction: x.direction, seq: x.seq })),
  }));
  // 送迎できなかった方も「車両未定」の便として残し、手で振り分けられるようにする
  const leftovers = new Map<RunKind, DailyRun>();
  for (const u of t.unassigned) {
    const run = leftovers.get(u.run) ?? { key: `new${n++}`, run: u.run, vehicle_id: null, driver_id: null, escort_id: null, depart_time: "", riders: [] };
    run.riders.push({ client_id: u.clientId, direction: u.direction, seq: run.riders.length + 1 });
    leftovers.set(u.run, run);
  }
  runs.push(...leftovers.values());

  // ---- 機能訓練・整体の時間割（到着順） ----
  const arrivalOrder = (run: RunKind) => {
    const order = new Map<number, number>();
    runs
      .filter((r) => r.run === run)
      .forEach((r, vi) =>
        r.riders.filter((x) => x.direction === "pickup").forEach((x) => order.set(x.client_id, vi * 100 + x.seq)),
      );
    return order;
  };
  const history = buildTrainingHistory(storeId, detail.date);
  const training: DailyTraining[] = [];
  for (const session of ["am", "pm"] as const) {
    const ids = (session === "am" ? amIds : pmIds).filter((id) => clients.get(id)!.needs_training);
    const order = arrivalOrder(session === "am" ? "morning" : "noon_pick");
    ids.sort((a, b) => (order.get(a) ?? 1e6) - (order.get(b) ?? 1e6) || a - b);
    const trainers = staff
      .filter((s) => skills(s.id).some((k) => TRAINING_SKILLS.includes(k as (typeof TRAINING_SKILLS)[number])) && works(s.id)[session])
      .map((s) => ({ id: s.id, sortOrder: s.sort_order }));
    const slots = splitList(session === "am" ? store.am_slots : store.pm_slots);
    const { result, overflow } = planTraining({ clientIds: ids, slots, capacity: store.slot_capacity, staff: trainers, history });
    if (ids.length && trainers.length === 0) warnings.push(`${session === "am" ? "午前" : "午後"}: 機能訓練・整体を担当できる出勤者がいません。`);
    if (overflow.length) warnings.push(`${session === "am" ? "午前" : "午後"}: 時間枠が足りず ${overflow.length} 名の時間が未定です。`);
    for (const id of ids) {
      const a = result.get(id)!;
      training.push({ session, client_id: id, slot_time: a.slot ?? "", staff_id: a.staffId });
    }
  }

  // ---- 体操・メディカルケア・FIT ----
  const staffLite = staff.map((s) => ({ id: s.id, name: s.name, role: s.role, skills: splitList(s.skills), sortOrder: s.sort_order }));
  const d = planDuties({ staff: staffLite, codeOf: (id) => codeOf.get(id), runs, training });
  warnings.push(...d.warnings);

  return { detail: { ...detail, runs, training, duties: d.duties }, warnings: [...new Set(warnings)] };
}
