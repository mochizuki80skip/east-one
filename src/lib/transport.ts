/**
 * 送迎計画の自動作成（純粋関数・DB非依存）。
 *
 *  - 朝送迎: 午前利用者のお迎え / 昼送迎: 午前利用者のお送り → 午後利用者のお迎え / 帰り送迎: 午後利用者のお送り
 *  - 利用者はルートごとにまとめ、ルートの既定車両に乗せる。乗車可能人数を超えた分や未設定の方は空きのある車両へ
 *  - 運転者は当日その時間帯に出勤している運転可能スタッフから選ぶ（車両ごとの運転可能スタッフの制限を守る）
 *  - 同じ便で 1 人が 2 台を運転しない / 前回その便でその車両を運転した人を避ける / 担当数を平準化する
 */
import type { RunKind } from "./constants";
import { inc, pickBest, SAME_AS_LAST_PENALTY, TODAY_LOAD_WEIGHT, timeToMinutes } from "./pick";

export type Direction = "pickup" | "dropoff";

export type TRider = { clientId: number; routeId: number | null; routeOrder: number };
export type TVehicle = { id: number; capacity: number; sortOrder: number; allowedDriverIds: number[] };
export type TRoute = { id: number; vehicleId: number | null; sortOrder: number; times: Record<RunKind, string> };
export type TDriver = { id: number; sortOrder: number };

export type TransportHistory = {
  /** `${run}|${vehicleId}` -> 前回の運転者 */
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
  /** 便ごとの乗車対象（朝=午前利用者お迎え、昼=午前お送り＋午後お迎え、帰り=午後お送り） */
  amRiders: TRider[];
  pmRiders: TRider[];
  vehicles: TVehicle[];
  routes: TRoute[];
  /** 便ごとの運転可能な出勤者 */
  drivers: Record<RunKind, TDriver[]>;
  history: TransportHistory;
};

export type TransportResult = {
  runs: PlannedRun[];
  unassigned: { run: RunKind; clientId: number; direction: Direction }[];
  warnings: string[];
};

type Allocation = { byVehicle: Map<number, number[]>; unassigned: number[]; usedRoutes: Map<number, Set<number>> };

/** 乗車対象を車両に振り分ける（1 方向分） */
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
    // 既に使っている車両の空きを優先し、無ければ未使用の車両
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
  const runs: PlannedRun[] = [];
  const unassigned: TransportResult["unassigned"] = [];
  const warnings: string[] = [];
  const todayLoad = new Map<number, number>();

  const plan: { run: RunKind; legs: { dir: Direction; riders: TRider[] }[] }[] = [
    { run: "morning", legs: [{ dir: "pickup", riders: input.amRiders }] },
    {
      run: "noon",
      legs: [
        { dir: "dropoff", riders: input.amRiders },
        { dir: "pickup", riders: input.pmRiders },
      ],
    },
    { run: "evening", legs: [{ dir: "dropoff", riders: input.pmRiders }] },
  ];

  for (const { run, legs } of plan) {
    const perVehicle = new Map<number, PlannedRider[]>();
    const routesPerVehicle = new Map<number, Set<number>>();
    for (const leg of legs) {
      const a = allocate(leg.riders, vehicles, routes);
      for (const c of a.unassigned) unassigned.push({ run, clientId: c, direction: leg.dir });
      for (const [vid, clients] of a.byVehicle) {
        const list = perVehicle.get(vid) ?? [];
        clients.forEach((clientId, i) => list.push({ clientId, direction: leg.dir, seq: i + 1 }));
        perVehicle.set(vid, list);
      }
      for (const [vid, rs] of a.usedRoutes) routesPerVehicle.set(vid, new Set([...(routesPerVehicle.get(vid) ?? []), ...rs]));
    }

    // 運転者の割り当て（選択肢が少ない車両から）
    const used = vehicles
      .filter((v) => perVehicle.has(v.id))
      .sort((a, b) => (a.allowedDriverIds.length || 1e6) - (b.allowedDriverIds.length || 1e6) || a.sortOrder - b.sortOrder);
    const takenThisRun = new Set<number>();
    const driverOf = new Map<number, number | null>();
    for (const v of used) {
      const cands = input.drivers[run].filter(
        (d) => !takenThisRun.has(d.id) && (v.allowedDriverIds.length === 0 || v.allowedDriverIds.includes(d.id)),
      );
      const best = pickBest(
        [...cands].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id),
        (d) =>
          (history.lastDriver.get(`${run}|${v.id}`) === d.id ? SAME_AS_LAST_PENALTY : 0) +
          (todayLoad.get(d.id) ?? 0) * TODAY_LOAD_WEIGHT +
          (history.driveCounts.get(d.id) ?? 0),
      );
      driverOf.set(v.id, best?.id ?? null);
      if (best) {
        takenThisRun.add(best.id);
        inc(todayLoad, best.id);
      }
    }

    for (const v of [...used].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)) {
      const times = [...(routesPerVehicle.get(v.id) ?? [])]
        .map((rid) => routeById.get(rid)?.times[run] ?? "")
        .filter(Boolean)
        .sort((a, b) => timeToMinutes(a) - timeToMinutes(b));
      const driverId = driverOf.get(v.id) ?? null;
      if (driverId == null) warnings.push(`${run === "morning" ? "朝" : run === "noon" ? "昼" : "帰り"}送迎: 運転できる出勤者が足りません`);
      runs.push({ run, vehicleId: v.id, driverId, escortId: null, departTime: times[0] ?? "", riders: perVehicle.get(v.id)! });
    }
  }
  if (unassigned.length) warnings.push(`車両の乗車可能人数が足りず、${unassigned.length}件の送迎が未割り当てです`);
  return { runs, unassigned, warnings: [...new Set(warnings)] };
}
