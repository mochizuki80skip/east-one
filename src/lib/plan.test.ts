import { test } from "node:test";
import assert from "node:assert/strict";
import { planTransport, type TRoute, type TVehicle } from "./transport";
import { planTraining } from "./timetable";

const times = (m: string) => ({ morning: m, noon_drop: "11:00", noon_pick: "13:20", evening: "15:30" });
const vehicles: TVehicle[] = [
  { id: 1, capacity: 3, sortOrder: 1, allowedDriverIds: [] },
  { id: 2, capacity: 3, sortOrder: 2, allowedDriverIds: [] },
  { id: 3, capacity: 2, sortOrder: 3, allowedDriverIds: [30] },
];
const routes: TRoute[] = [
  { id: 10, vehicleId: 1, sortOrder: 1, times: times("8:10") },
  { id: 11, vehicleId: 2, sortOrder: 2, times: times("8:20") },
];
const drivers = [
  { id: 20, sortOrder: 1 },
  { id: 21, sortOrder: 2 },
  { id: 30, sortOrder: 3 },
];
const noHistory = { lastDriver: new Map(), driveCounts: new Map() };
const r = (clientId: number, routeId: number | null, routeOrder = 0) => ({ clientId, routeId, routeOrder });

test("送迎: ルートの既定車両に乗せ、ルート順に並べる", () => {
  const res = planTransport({
    amRiders: [r(2, 10, 2), r(1, 10, 1), r(3, 11, 1)],
    pmRiders: [],
    vehicles,
    routes,
    drivers: { morning: drivers, noon_drop: drivers, noon_pick: drivers, evening: drivers },
    history: noHistory,
  });
  const morning = res.runs.filter((x) => x.run === "morning");
  assert.deepEqual(morning.find((x) => x.vehicleId === 1)!.riders.map((x) => x.clientId), [1, 2]);
  assert.equal(morning.find((x) => x.vehicleId === 1)!.departTime, "8:10");
  assert.deepEqual(morning.find((x) => x.vehicleId === 2)!.riders.map((x) => x.clientId), [3]);
});

test("送迎: 乗車可能人数を超えたら空きのある車両へ回す", () => {
  const res = planTransport({
    amRiders: [r(1, 10, 1), r(2, 10, 2), r(3, 10, 3), r(4, 10, 4)],
    pmRiders: [],
    vehicles,
    routes,
    drivers: { morning: drivers, noon_drop: drivers, noon_pick: drivers, evening: drivers },
    history: noHistory,
  });
  const morning = res.runs.filter((x) => x.run === "morning");
  assert.equal(morning.find((x) => x.vehicleId === 1)!.riders.length, 3);
  assert.equal(morning.reduce((n, x) => n + x.riders.length, 0), 4);
  assert.equal(res.unassigned.length, 0);
});

test("送迎: 同じ便で1人が2台を運転せず、車両の運転制限と前回担当の回避を守る", () => {
  const res = planTransport({
    amRiders: [r(1, 10), r(2, 11), r(3, null), r(4, null), r(5, null), r(6, null), r(7, null), r(8, null)],
    pmRiders: [],
    vehicles,
    routes,
    drivers: { morning: drivers, noon_drop: drivers, noon_pick: drivers, evening: drivers },
    history: { lastDriver: new Map([["morning|1", 20]]), driveCounts: new Map() },
  });
  const morning = res.runs.filter((x) => x.run === "morning");
  const ids = morning.map((x) => x.driverId);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(morning.find((x) => x.vehicleId === 3)!.driverId, 30);
  assert.notEqual(morning.find((x) => x.vehicleId === 1)!.driverId, 20);
});

test("送迎: 昼送車と昼迎車に分け、同じ車両は同じ運転者が乗る", () => {
  const res = planTransport({
    amRiders: [r(1, 10), r(2, 10), r(3, 11)],
    pmRiders: [r(4, 10), r(5, 11), r(6, 11)],
    vehicles,
    routes,
    drivers: { morning: drivers, noon_drop: drivers, noon_pick: drivers, evening: drivers },
    history: noHistory,
  });
  const drop = res.runs.filter((x) => x.run === "noon_drop");
  const pick = res.runs.filter((x) => x.run === "noon_pick");
  assert.deepEqual(drop.find((x) => x.vehicleId === 1)!.riders.map((x) => x.clientId), [1, 2]);
  assert.deepEqual(pick.find((x) => x.vehicleId === 1)!.riders.map((x) => x.clientId), [4]);
  assert.equal(pick.find((x) => x.vehicleId === 1)!.departTime, "13:20");
  for (const v of [1, 2]) {
    assert.equal(drop.find((x) => x.vehicleId === v)!.driverId, pick.find((x) => x.vehicleId === v)!.driverId);
  }
  assert.notEqual(drop.find((x) => x.vehicleId === 1)!.driverId, drop.find((x) => x.vehicleId === 2)!.driverId);
});

test("送迎: 昼の運転者は昼送車・昼迎車の両方の時間に勤務している人から選ぶ", () => {
  const res = planTransport({
    amRiders: [r(1, 10)],
    pmRiders: [r(2, 10)],
    vehicles,
    routes,
    drivers: { morning: drivers, noon_drop: [drivers[0], drivers[1]], noon_pick: [drivers[1]], evening: drivers },
    history: noHistory,
  });
  assert.ok(res.runs.filter((x) => x.run.startsWith("noon")).every((x) => x.driverId === 21));
});

test("送迎: 午前と午後でルートの車両が違っても、昼迎車は昼送車の車両に寄せる", () => {
  const rs: TRoute[] = [...routes, { id: 12, vehicleId: 3, sortOrder: 3, times: times("8:30") }];
  const res = planTransport({
    amRiders: [r(1, 10), r(2, 10)],
    pmRiders: [r(3, 12), r(4, 12)],
    vehicles,
    routes: rs,
    drivers: { morning: drivers, noon_drop: drivers, noon_pick: drivers, evening: drivers },
    history: noHistory,
  });
  const pick = res.runs.filter((x) => x.run === "noon_pick");
  assert.deepEqual(pick.map((x) => x.vehicleId), [1]);
  assert.deepEqual(pick[0].riders.map((x) => x.clientId), [3, 4]);
  // 帰り送車はルートどおりの車両
  assert.deepEqual(res.runs.filter((x) => x.run === "evening").map((x) => x.vehicleId), [3]);
  const drop = res.runs.find((x) => x.run === "noon_drop")!;
  assert.equal(drop.driverId, pick[0].driverId);
});

test("送迎: 運転できる人がいなければ警告", () => {
  const res = planTransport({
    amRiders: [r(1, 10)],
    pmRiders: [],
    vehicles,
    routes,
    drivers: { morning: [], noon_drop: [], noon_pick: [], evening: [] },
    history: noHistory,
  });
  assert.equal(res.runs[0].driverId, null);
  assert.ok(res.warnings.length > 0);
});

test("時間割: 同じ枠に同じ担当が重ならず、前回の担当を避ける", () => {
  const { result, overflow } = planTraining({
    clientIds: [1, 2, 3, 4, 5],
    slots: ["9:45", "10:00"],
    capacity: 5,
    staff: [
      { id: 7, sortOrder: 1 },
      { id: 8, sortOrder: 2 },
      { id: 9, sortOrder: 3 },
    ],
    history: { lastStaff: new Map([[1, 7]]), counts: new Map() },
  });
  assert.equal(overflow.length, 0);
  const slot1 = [1, 2, 3].map((c) => result.get(c)!);
  assert.ok(slot1.every((a) => a.slot === "9:45"));
  assert.equal(new Set(slot1.map((a) => a.staffId)).size, 3);
  assert.notEqual(result.get(1)!.staffId, 7);
  assert.equal(result.get(4)!.slot, "10:00");
});

test("時間割: 枠が足りなければ未定として返す", () => {
  const { overflow } = planTraining({
    clientIds: [1, 2, 3],
    slots: ["9:45"],
    capacity: 2,
    staff: [
      { id: 7, sortOrder: 1 },
      { id: 8, sortOrder: 2 },
    ],
    history: { lastStaff: new Map(), counts: new Map() },
  });
  assert.deepEqual(overflow, [3]);
});
