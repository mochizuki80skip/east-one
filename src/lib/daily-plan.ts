import { DRIVE_SKILL, shiftWorks, splitList, TRAINING_SKILLS, type RunKind, type Session } from "./constants";
import { planTransport, type TransportHistory, type TRider } from "./transport";
import { planTraining, type TrainingHistory } from "./timetable";
import { planDuties } from "./staffing";
import type { Client, DailyDetail, DailyRun, DailyTraining, Route, Staff, Store, Vehicle } from "./types";

export type PlanContext = {
  store: Store;
  staff: Staff[];
  clients: Client[];
  vehicles: Vehicle[];
  routes: Route[];
  history: { transport: TransportHistory; training: TrainingHistory };
};

/** 日々のスケジュールの自動作成（送迎・時間割・体操等の担当）。純粋関数で、保存はしない。 */
export function autoPlanDaily(detail: DailyDetail, ctx: PlanContext): { detail: DailyDetail; warnings: string[] } {
  const staff = ctx.staff.filter((s) => s.status === "在籍");
  const clients = new Map(ctx.clients.map((c) => [c.id, c]));
  const vehicles = ctx.vehicles.filter((v) => v.active);
  const routes = ctx.routes;
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
    history: ctx.history.transport,
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
  const tr = autoPlanTraining(detail, ctx, runs);
  const training = tr.training;
  warnings.push(...tr.warnings);

  // ---- 体操・メディカルケアFIT ----
  const staffLite = staff.map((s) => ({ id: s.id, name: s.name, role: s.role, skills: splitList(s.skills), sortOrder: s.sort_order }));
  const d = planDuties({ staff: staffLite, codeOf: (id) => codeOf.get(id), runs, training });
  warnings.push(...d.warnings);

  return { detail: { ...detail, runs, training, duties: d.duties }, warnings: [...new Set(warnings)] };
}

/**
 * 整体・個別機能訓練の時間割と担当だけを自動で作る（送迎はそのまま）。
 * 利用者は送迎の到着順（朝迎車・昼迎車の乗車順）に早い枠から入れ、
 * 担当は「整体」「個別機能訓練」ができる出勤者から、前回と同じ人を避け、担当数をならして選ぶ。
 */
export function autoPlanTraining(detail: DailyDetail, ctx: PlanContext, runs: DailyRun[]): { training: DailyTraining[]; warnings: string[] } {
  const { store } = ctx;
  const staff = ctx.staff.filter((s) => s.status === "在籍");
  const clients = new Map(ctx.clients.map((c) => [c.id, c]));
  const codeOf = new Map(detail.shifts.map((s) => [s.staff_id, s.code]));
  const works = (id: number) => shiftWorks(codeOf.get(id));
  const canTrain = (s: Staff) => splitList(s.skills).some((k) => (TRAINING_SKILLS as string[]).includes(k));
  const warnings: string[] = [];
  if (!staff.some(canTrain)) warnings.push("「整体」「個別機能訓練」ができるスタッフが登録されていません（スタッフ →「できることを一括登録」で設定してください）。");

  const arrivalOrder = (run: RunKind) => {
    const order = new Map<number, number>();
    runs
      .filter((r) => r.run === run)
      .forEach((r, vi) =>
        r.riders.filter((x) => x.direction === "pickup").forEach((x) => order.set(x.client_id, vi * 100 + x.seq)),
      );
    return order;
  };
  const training: DailyTraining[] = [];
  for (const session of ["am", "pm"] as const) {
    const ids = detail.attendance
      .filter((a) => a.session === session && a.status === "present" && clients.get(a.client_id)?.needs_training)
      .map((a) => a.client_id);
    const order = arrivalOrder(session === "am" ? "morning" : "noon_pick");
    ids.sort((a, b) => (order.get(a) ?? 1e6) - (order.get(b) ?? 1e6) || a - b);
    const trainers = staff.filter((s) => canTrain(s) && works(s.id)[session]).map((s) => ({ id: s.id, sortOrder: s.sort_order }));
    const slots = splitList(session === "am" ? store.am_slots : store.pm_slots);
    const { result, overflow } = planTraining({ clientIds: ids, slots, capacity: store.slot_capacity, staff: trainers, history: ctx.history.training });
    const label = session === "am" ? "午前" : "午後";
    if (ids.length && trainers.length === 0) warnings.push(`${label}: 整体・個別機能訓練を担当できる出勤者がいません。`);
    if (overflow.length) warnings.push(`${label}: 時間枠が足りず ${overflow.length} 名の時間が未定です。`);
    for (const id of ids) {
      const a = result.get(id)!;
      training.push({ session, client_id: id, slot_time: a.slot ?? "", staff_id: a.staffId });
    }
  }
  return { training, warnings };
}
