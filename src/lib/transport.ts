/**
 * 送迎計画の自動作成（純粋関数・DB非依存）。
 *
 *  - 朝迎車: 午前利用者のお迎え / 昼送車: 午前利用者のお送り / 昼迎車: 午後利用者のお迎え / 帰り送車: 午後利用者のお送り
 *  - 昼送車と昼迎車は、同じ車両には同じ運転者が乗る（車両ごとに運転者を共有）
 *  - 利用者はルートごとにまとめ、ルートの既定車両に乗せる。乗車可能人数を超えた分や未設定の方は空きのある車両へ
 *  - 運転者は当日その時間帯に出勤している運転可能スタッフから選ぶ（車両ごとの運転可能スタッフの制限を守る）
 *  - 同じ時間帯に 1 人が 2 台を運転しない / 前回その時間帯にその車両を運転した人を避ける / 担当数を平準化する
 */
import { runLabel, type RunKind } from "./constants";
import { inc, pickBest, SAME_AS_LAST_PENALTY, TODAY_LOAD_WEIGHT, timeToMinutes } from "./pick";

export type Direction = "pickup" | "dropoff";

export type TRider = { clientId: number; routeId: number | null; routeOrder: number };
export type TVehicle = { id: number; capacity: number; sortOrder: number; allowedDriverIds: number[] };
export type TRoute = { id: number; vehicleId: number | null; sortOrder: number; times: Record<RunKind, string> };
export type TDriver = { id: number; sortOrder: number };

/** 運転者を決める単位。昼送車と昼迎車は「昼」でまとめる */
export type DriverGroup = "morning" | "noon" | "evening";
export const driverGroupOf = (run: RunKind): DriverGroup => (run === "morning" ? "morning" : run === "evening" ? "evening" : "noon");

export type TransportHistory = {
  /** `${DriverGroup}|${vehicleId}` -> 前回の運転者 */
  lastDriver: Map<string, number>;
  /** 直近期間の運転回数 */
  driveCounts: Map<number, number>;
};

export type PlannedRider = { clientId: number; direction: Direction; seq: number };
export type PlannedRun = {
  run: RunKind;
  vehicleId: number;
  driverId: number | null;
  escortId: number | null;
  departTime: string;
  riders: PlannedRider[];
};

export type TransportInput = {
  amRiders: TRider[];
  pmRiders: TRider[];
  vehicles: TVehicle[];
  routes: TRoute[];
  /** 便ごとの運転可能な出勤者（その時間帯に勤務している人） */
  drivers: Record<RunKind, TDriver[]>;
  history: TransportHistory;
};

export type TransportResult = {
  runs: PlannedRun[];
  unassigned: { run: RunKind; clientId: number; direction: Direction }[];
  warnings: string[];
};

const LEGS: { run: RunKind; dir: Direction; from: "am" | "pm" }[] = [
  { run: "morning", dir: "pickup", from: "am" },
  { run: "noon_drop", dir: "dropoff", from: "am" },
  { run: "noon_pick", dir: "pickup", from: "pm" },
  { run: "evening", dir: "dropoff", from: "pm" },
];

type Allocation = { byVehicle: Map<number, number[]>; unassigned: number[]; usedRoutes: Map<number, Set<number>> };

/** 乗車対象を車両に振り分ける（1 便分） */
function allocate(riders: TRider[], vehicles: TVehicle[], routes: TRoute[]): Allocation {
  const routeById = new Map(routes.map((r) => [r.id, r]));
  const vehicleById = new Map(vehicles.map((v) => [v.id, v]));
  const byVehicle = new Map<number, number[]>();
  const usedRoutes = new Map<number, Set<number>>();
  const load = (vid: number) => byVehicle.get(vid)?.length ?? 0;
  const put = (vid: number, r: TRider) => {
    byVehicle.set(vid, [...(byVehicle.get(vid) ?? []), r.clientId]);
    if (r.routeId != null) usedRoutes.set(vid, (usedRoutes.get(vid) ?? new Set()).add(r.routeId));
  };

  const sorted = [...riders].sort((a, b) => {
    const ra = a.routeId != null ? routeById.get(a.routeId) : undefined;
    const rb = b.routeId != null ? routeById.get(b.routeId) : undefined;
    return (ra?.sortOrder ?? 1e9) - (rb?.sortOrder ?? 1e9) || a.routeOrder - b.routeOrder || a.clientId - b.clientId;
  });

  const leftover: TRider[] = [];
  for (const r of sorted) {
    const route = r.routeId != null ? routeById.get(r.routeId) : undefined;
    const v = route?.vehicleId != null ? vehicleById.get(route.vehicleId) : undefined;
    if (v && load(v.id) < v.capacity) put(v.id, r);
    else leftover.push(r);
  }

  const unassigned: number[] = [];
  const vs = [...vehicles].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  for (const r of leftover) {
    const inUse = vs.filter((v) => load(v.id) > 0 && load(v.id) < v.capacity);
    const unused = vs.filter((v) => load(v.id) === 0 && v.capacity > 0);
    const v = inUse.sort((a, b) => b.capacity - load(b.id) - (a.capacity - load(a.id)))[0] ?? unused[0];
    if (v) put(v.id, r);
    else unassigned.push(r.clientId);
  }
  return { byVehicle, unassigned, usedRoutes };
}

export function planTransport(input: TransportInput): TransportResult {
  const { vehicles, routes, history } = input;
  const routeById = new Map(routes.map((r) => [r.id, r]));
  const unassigned: TransportResult["unassigned"] = [];
  const warnings: string[] = [];
  const todayLoad = new Map<number, number>();

  // 1. 便ごとに車両へ振り分け
  const legPlans = LEGS.map((leg) => {
    const a = allocate(leg.from === "am" ? input.amRiders : input.pmRiders, vehicles, routes);
    for (const c of a.unassigned) unassigned.push({ run: leg.run, clientId: c, direction: leg.dir });
    return { ...leg, alloc: a };
  });

  // 1.5 昼は「お送りした車両がそのままお迎えに回る」ように、昼迎車だけで使う車両の乗車者を
  //     昼送車だけで使う車両へ寄せる（乗車可能人数と運転可能スタッフの制限が許す範囲で）
  const drop = legPlans.find((l) => l.run === "noon_drop")!.alloc;
  const pick = legPlans.find((l) => l.run === "noon_pick")!.alloc;
  const vehicleById = new Map(vehicles.map((v) => [v.id, v]));
  const dropOnly = [...drop.byVehicle.keys()].filter((id) => !pick.byVehicle.has(id));
  const pickOnly = [...pick.byVehicle.keys()].filter((id) => !drop.byVehicle.has(id));
  for (const pid of pickOnly.sort((a, b) => (pick.byVehicle.get(b)?.length ?? 0) - (pick.byVehicle.get(a)?.length ?? 0))) {
    const riders = pick.byVehicle.get(pid)!;
    const target = dropOnly
      .filter((did) => !pick.byVehicle.has(did) && (vehicleById.get(did)?.capacity ?? 0) >= riders.length)
      .sort((a, b) => (vehicleById.get(a)!.sortOrder - vehicleById.get(b)!.sortOrder) || a - b)[0];
    if (target == null) continue;
    pick.byVehicle.set(target, riders);
    pick.byVehicle.delete(pid);
    const routesOfP = pick.usedRoutes.get(pid);
    if (routesOfP) {
      pick.usedRoutes.set(target, routesOfP);
      pick.usedRoutes.delete(pid);
    }
  }

  // 2. 運転者（朝・昼・帰りの単位で、車両ごとに 1 人）
  const driverOf = new Map<string, number | null>(); // `${group}|${vid}`
  for (const group of ["morning", "noon", "evening"] as const) {
    const legs = legPlans.filter((l) => driverGroupOf(l.run) === group);
    const used = vehicles
      .filter((v) => legs.some((l) => l.alloc.byVehicle.has(v.id)))
      .sort((a, b) => (a.allowedDriverIds.length || 1e6) - (b.allowedDriverIds.length || 1e6) || a.sortOrder - b.sortOrder);
    const taken = new Set<number>();
    for (const v of used) {
      // その車両が走る便すべてで勤務している人だけ（昼は昼送車・昼迎車の両方）
      const runsOfV = legs.filter((l) => l.alloc.byVehicle.has(v.id)).map((l) => l.run);
      const avail = runsOfV
        .map((run) => new Set(input.drivers[run].map((d) => d.id)))
        .reduce((acc, s) => new Set([...acc].filter((x) => s.has(x))));
      const cands = input.drivers[runsOfV[0]]
        .filter((d) => avail.has(d.id) && !taken.has(d.id) && (v.allowedDriverIds.length === 0 || v.allowedDriverIds.includes(d.id)))
        .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
      const best = pickBest(
        cands,
        (d) =>
          (history.lastDriver.get(`${group}|${v.id}`) === d.id ? SAME_AS_LAST_PENALTY : 0) +
          (todayLoad.get(d.id) ?? 0) * TODAY_LOAD_WEIGHT +
          (history.driveCounts.get(d.id) ?? 0),
      );
      driverOf.set(`${group}|${v.id}`, best?.id ?? null);
      if (best) {
        taken.add(best.id);
        inc(todayLoad, best.id);
      } else {
        warnings.push(`${runsOfV.map(runLabel).join("・")}: 運転できる出勤者が足りません`);
      }
    }
  }

  // 3. 便ごとの結果
  const runs: PlannedRun[] = [];
  for (const leg of legPlans) {
    for (const v of [...vehicles].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)) {
      const clients = leg.alloc.byVehicle.get(v.id);
      if (!clients) continue;
      const times = [...(leg.alloc.usedRoutes.get(v.id) ?? [])]
        .map((rid) => routeById.get(rid)?.times[leg.run] ?? "")
        .filter(Boolean)
        .sort((a, b) => timeToMinutes(a) - timeToMinutes(b));
      runs.push({
        run: leg.run,
        vehicleId: v.id,
        driverId: driverOf.get(`${driverGroupOf(leg.run)}|${v.id}`) ?? null,
        escortId: null,
        departTime: times[0] ?? "",
        riders: clients.map((clientId, i) => ({ clientId, direction: leg.dir, seq: i + 1 })),
      });
    }
  }
  if (unassigned.length) warnings.push(`車両の乗車可能人数が足りず、${unassigned.length}件の送迎が未割り当てです`);
  return { runs, unassigned, warnings: [...new Set(warnings)] };
}
