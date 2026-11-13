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

import { autoPlanTraining, type PlanContext } from "./daily-plan";
import type { Client, DailyDetail, Staff, Store } from "./types";

test("整体の担当だけ自動振り分け: 「整体」にチェックがある出勤者だけに、送迎の到着順で振り分ける", () => {
  const st = (id: number, skills: string): Staff =>
    ({ id, name: `S${id}`, status: "在籍", employment: "A", role: "", skills, days_per_week: 5, available_weekdays: "", note: "", sort_order: id, store_ids: "1" }) as Staff;
  const cl = (id: number, needs = 1): Client => ({ id, name: `C${id}`, needs_training: needs, uses_transport: 1, status: "利用中" }) as Client;
  const ctx: PlanContext = {
    store: { am_slots: "9:45,10:00", pm_slots: "14:05", slot_capacity: 2 } as Store,
    staff: [st(1, "整体"), st(2, "整体,個別機能訓練"), st(3, "運転"), st(4, "整体"), st(5, "個別機能訓練")],
    clients: [cl(10), cl(11), cl(12), cl(13, 0)],
    vehicles: [],
    routes: [],
    history: { transport: { lastDriver: new Map(), driveCounts: new Map() }, training: { lastStaff: new Map(), counts: new Map() } },
  };
  const present = (client_id: number) => ({ client_id, session: "am" as const, status: "present" as const, reason: "", extra: 0, note: "" });
  const detail = {
    shifts: [
      { staff_id: 1, code: "〇" },
      { staff_id: 2, code: "〇" },
      { staff_id: 3, code: "〇" },
      { staff_id: 4, code: "休" },
      { staff_id: 5, code: "〇" },
    ],
    attendance: [present(10), present(11), present(12), present(13)],
  } as DailyDetail;
  // 朝迎車の乗車順: 12 → 10 → 11
  const runs = [{ key: "a", run: "morning" as const, vehicle_id: 1, driver_id: 3, escort_id: null, depart_time: "", riders: [12, 10, 11].map((c, i) => ({ client_id: c, direction: "pickup" as const, seq: i + 1 })) }];
  const { training, warnings } = autoPlanTraining(detail, ctx, runs);
  assert.deepEqual(training.map((t) => t.client_id), [12, 10, 11]); // 13 は機能訓練なし
  assert.deepEqual(training.map((t) => t.slot_time), ["9:45", "9:45", "10:00"]);
  assert.ok(training.every((t) => t.staff_id === 1 || t.staff_id === 2)); // 運転のみ・個別機能訓練のみ・休みの人は入らない
  assert.notEqual(training[0].staff_id, training[1].staff_id); // 同じ時間に同じ人が2人を見ない
  assert.deepEqual(warnings, []);

  const none = autoPlanTraining(detail, { ...ctx, staff: [st(3, "運転")] }, runs);
  assert.ok(none.warnings.some((w) => w.includes("できることを一括登録")));
});

import { noonRows, noonText } from "./noon";

test("昼送迎: 車両ごとに送りと迎えを1つにまとめ、「送り：A→B」「迎え：→C→D」で表す", () => {
  const run = (key: string, run: "noon_drop" | "noon_pick" | "morning", vehicle_id: number | null, driver_id: number | null, depart_time: string, ids: number[]) => ({
    key,
    run,
    vehicle_id,
    driver_id,
    escort_id: null,
    depart_time,
    riders: ids.map((client_id, i) => ({ client_id, direction: (run === "noon_pick" ? "pickup" : "dropoff") as "pickup" | "dropoff", seq: i + 1 })),
  });
  const rows = noonRows([
    run("m", "morning", 1, 5, "8:10", [9]),
    run("a", "noon_drop", 1, 5, "11:00", [2, 1]),
    run("b", "noon_pick", 2, 6, "13:20", [7]),
    run("c", "noon_pick", 1, 5, "13:10", [3, 4]),
  ]);
  assert.deepEqual(
    rows.map((r) => [r.vehicle_id, r.driver_ids, r.drop_time, r.pick_time, r.drop, r.pick]),
    [
      [1, [5], "11:00", "13:10", [2, 1], [3, 4]],
      [2, [6], "", "13:20", [], [7]],
    ],
  );
  assert.deepEqual(noonText(["山田", "佐藤"], ["鈴木", "田中"]), { drop: "送り：山田→佐藤", pick: "迎え：→鈴木→田中" });
  assert.deepEqual(noonText([], ["鈴木"]), { drop: "送り：なし", pick: "迎え：→鈴木" });
});

test("送迎: 車イスの方は車イス対応の車両（台数まで）にだけ乗せる", () => {
  const vs: TVehicle[] = [
    { id: 1, capacity: 4, sortOrder: 1, allowedDriverIds: [] },
    { id: 2, capacity: 4, sortOrder: 2, allowedDriverIds: [], wheelchairSeats: 1 },
  ];
  const res = planTransport({
    amRiders: [
      { clientId: 1, routeId: null, routeOrder: 0, wheelchair: true },
      { clientId: 2, routeId: null, routeOrder: 0 },
      { clientId: 3, routeId: null, routeOrder: 0, wheelchair: true },
    ],
    pmRiders: [],
    vehicles: vs,
    routes: [],
    drivers: { morning: drivers, noon_drop: drivers, noon_pick: drivers, evening: drivers },
    history: noHistory,
  });
  const morning = res.runs.filter((x) => x.run === "morning");
  const inV2 = morning.find((x) => x.vehicleId === 2)?.riders.map((x) => x.clientId) ?? [];
  const inV1 = morning.find((x) => x.vehicleId === 1)?.riders.map((x) => x.clientId) ?? [];
  assert.equal(inV2.filter((c) => c === 1 || c === 3).length, 1); // 車イス 1 台まで
  assert.ok(!inV1.includes(1) && !inV1.includes(3)); // 非対応の車両には乗らない
  assert.equal(res.unassigned.filter((u) => u.run === "morning").length, 1); // 2 人目の車イスは未割り当て
});

import { distanceKm, sortByDistance } from "./geo";
import { parseAddressBook } from "./address-book";

test("距離: 店舗から近い順・遠い順に並べ、位置が分からない方は最後", () => {
  const shop = { lat: 35.118, lng: 138.918 }; // 三島駅あたり
  const near = { id: 1, p: { lat: 35.12, lng: 138.92 } };
  const far = { id: 2, p: { lat: 35.2, lng: 138.9 } };
  const none = { id: 3, p: null };
  assert.ok(distanceKm(shop, far.p) > 8 && distanceKm(shop, far.p) < 11);
  assert.deepEqual(sortByDistance([far, none, near], (x) => x.p, shop, "near").map((x) => x.id), [1, 2, 3]);
  assert.deepEqual(sortByDistance([near, none, far], (x) => x.p, shop, "far").map((x) => x.id), [2, 1, 3]);
});

test("住所録: 見出しの列名から名前・住所・緯度経度を読み、名前は空白と様を除く", () => {
  const csv = "郵便番号,利用者名,住所,電話,緯度,経度\n411-0000,朝日 花子様,静岡県三島市一番町1-1,055,35.1,138.9\n,夕月　太郎,静岡県三島市二番町2-2,,,\n,,住所だけ,,,";
  const r = parseAddressBook(csv);
  assert.equal(r.header, true);
  assert.deepEqual(r.list, [
    { name: "朝日花子", address: "静岡県三島市一番町1-1", lat: 35.1, lng: 138.9 },
    { name: "夕月太郎", address: "静岡県三島市二番町2-2", lat: null, lng: null },
  ]);
  assert.deepEqual(parseAddressBook("朝日花子\t静岡県三島市一番町1-1").list[0].address, "静岡県三島市一番町1-1");
});

import { placeRider, sortRunByDistance } from "./dispatch";

test("配車ボード: ドラッグで別のグループ・新しいグループ・未割り当てへ移し、順番を振り直す", () => {
  const g = (key: string, ids: number[], run: "morning" | "evening" = "morning") => ({
    key,
    run,
    vehicle_id: null,
    driver_id: null,
    escort_id: null,
    depart_time: "",
    riders: ids.map((client_id, i) => ({ client_id, direction: (run === "morning" ? "pickup" : "dropoff") as "pickup" | "dropoff", seq: i + 1 })),
  });
  const runs = [g("a", [1, 2, 3]), g("b", [4]), g("e", [1], "evening")];
  // 2 を b の先頭へ
  let r = placeRider(runs, "morning", 2, "b", 0);
  assert.deepEqual(r.find((x) => x.key === "a")!.riders.map((x) => [x.client_id, x.seq]), [[1, 1], [3, 2]]);
  assert.deepEqual(r.find((x) => x.key === "b")!.riders.map((x) => [x.client_id, x.seq]), [[2, 1], [4, 2]]);
  assert.deepEqual(r.find((x) => x.key === "e")!.riders.map((x) => x.client_id), [1]); // 別の便は変わらない
  // 未割り当ての 9 を新しいグループへ
  r = placeRider(r, "morning", 9, "n1", undefined, { key: "n1" });
  assert.deepEqual(r.find((x) => x.key === "n1")!.riders, [{ client_id: 9, direction: "pickup", seq: 1 }]);
  assert.equal(r.find((x) => x.key === "n1")!.vehicle_id, null); // 車両はあとで
  // 未割り当てに戻す
  r = placeRider(r, "morning", 4, null);
  assert.ok(!r.some((x) => x.run === "morning" && x.riders.some((y) => y.client_id === 4)));
  // 同じグループ内で並べ替え（1 を最後へ）
  r = placeRider(r, "morning", 1, "a", 1);
  assert.deepEqual(r.find((x) => x.key === "a")!.riders.map((x) => x.client_id), [3, 1]);
  // 近い順・遠い順
  const pts: Record<number, { lat: number; lng: number } | null> = { 3: { lat: 35.2, lng: 138.9 }, 1: { lat: 35.12, lng: 138.92 } };
  const shop = { lat: 35.118, lng: 138.918 };
  assert.deepEqual(sortRunByDistance(r.find((x) => x.key === "a")!, (c) => pts[c] ?? null, shop, "near").riders.map((x) => x.client_id), [1, 3]);
  assert.deepEqual(sortRunByDistance(r.find((x) => x.key === "a")!, (c) => pts[c] ?? null, shop, "far").riders.map((x) => x.client_id), [3, 1]);
});
