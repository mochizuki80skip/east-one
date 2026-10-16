import { test } from "node:test";
import assert from "node:assert/strict";
import { autoShift, type ShiftStaff } from "./shift-auto";

// 2026-10-05(月) 〜 2026-10-11(日)
const week = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"];
const rules = { required: 3, minNurse: 1, minTrainer: 1, closedWeekdays: [0] };
const all = [1, 2, 3, 4, 5, 6];
const s = (id: number, role: string, days: number, avail = all): ShiftStaff => ({
  id,
  role,
  days_per_week: days,
  available_weekdays: avail,
  sort_order: id,
});

const base = { requests: new Map(), locked: new Map(), busyElsewhere: new Set<string>() };

test("定休日は全員「日」、常勤は週の勤務日数どおりに入る", () => {
  const staff = [s(1, "管理者", 5), s(2, "看護師", 5), s(3, "機能訓練指導員", 5), s(4, "介護職員", 5)];
  const { grid } = autoShift({ ...base, dates: week, staff, rules });
  for (const st of staff) assert.equal(grid.get(`${st.id}|2026-10-11`), "日");
  for (const st of staff) {
    const n = week.filter((d) => grid.get(`${st.id}|${d}`) === "〇").length;
    assert.equal(n, 5, `staff ${st.id}`);
  }
});

test("人数が足りていれば希望休は休みになり、勤務日数は別の日で満たす", () => {
  const staff = [s(1, "看護師", 5), s(2, "看護師", 5), s(3, "機能訓練指導員", 6), s(4, "介護職員", 6), s(5, "介護職員", 6)];
  const requests = new Map([["1|2026-10-07", "希休"]]);
  const { grid, overridden } = autoShift({ ...base, requests, dates: week, staff, rules });
  assert.equal(grid.get("1|2026-10-07"), "希休");
  assert.equal(week.filter((d) => grid.get(`1|${d}`) === "〇").length, 5);
  assert.deepEqual(overridden, []);
});

test("希望休でも、その日に看護師が他にいなければ出勤にして知らせる", () => {
  const staff = [s(1, "看護師", 5), s(2, "機能訓練指導員", 6), s(3, "介護職員", 6), s(4, "介護職員", 6)];
  const requests = new Map([["1|2026-10-07", "希休"]]);
  const { grid, checks, overridden } = autoShift({ ...base, requests, dates: week, staff, rules });
  assert.equal(grid.get("1|2026-10-07"), "〇");
  assert.deepEqual(overridden, [{ staff_id: 1, date: "2026-10-07" }]);
  assert.ok(checks.find((c) => c.date === "2026-10-07")!.nurses >= 1);
  // 勤務日数は増やさない（別の日が休みになる）
  assert.equal(week.filter((d) => grid.get(`1|${d}`) === "〇").length, 5);
});

test("有給は人数が足りなくても必ず休み", () => {
  const staff = [s(1, "看護師", 5), s(2, "機能訓練指導員", 6), s(3, "介護職員", 6), s(4, "介護職員", 6)];
  const requests = new Map([["1|2026-10-07", "有"]]);
  const { grid, overridden } = autoShift({ ...base, requests, dates: week, staff, rules });
  assert.equal(grid.get("1|2026-10-07"), "有");
  assert.deepEqual(overridden, []);
});

test("看護師の最低人数を優先して配置する", () => {
  const staff = [s(1, "介護職員", 6), s(2, "介護職員", 6), s(3, "介護職員", 6), s(4, "看護師", 3), s(5, "看護師", 3), s(6, "機能訓練指導員", 6)];
  const { checks } = autoShift({ ...base, dates: week, staff, rules });
  for (const c of checks.filter((c) => c.date !== "2026-10-11")) assert.ok(c.nurses >= 1, c.date);
});

test("人が足りない日は警告を出し、勤務日数を超えて入れない", () => {
  const staff = [s(1, "看護師", 2), s(2, "機能訓練指導員", 2)];
  const { grid, checks } = autoShift({ ...base, dates: week, staff, rules });
  assert.equal(week.filter((d) => grid.get(`1|${d}`) === "〇").length, 2);
  assert.ok(checks.some((c) => c.messages.length > 0));
});

test("他店舗で勤務の日は「他店」、勤務できない曜日は「休」", () => {
  const staff = [s(1, "看護師", 3, [1, 3, 5]), s(2, "機能訓練指導員", 5)];
  const busy = new Set(["2|2026-10-06"]);
  const { grid } = autoShift({ ...base, busyElsewhere: busy, dates: week, staff, rules });
  assert.equal(grid.get("2|2026-10-06"), "他店");
  assert.equal(grid.get("1|2026-10-06"), "休");
});

test("手入力で固定したセルは上書きしない", () => {
  const staff = [s(1, "看護師", 5), s(2, "機能訓練指導員", 5)];
  const locked = new Map([["1|2026-10-05", "午前"]]);
  const { grid } = autoShift({ ...base, locked, dates: week, staff, rules });
  assert.equal(grid.get("1|2026-10-05"), "午前");
});

test("出勤人数を週の中で平準化する", () => {
  const staff = [1, 2, 3, 4, 5, 6, 7, 8].map((id) => s(id, id === 1 ? "看護師" : id === 2 ? "機能訓練指導員" : "介護職員", 5));
  const { checks } = autoShift({ ...base, dates: week, staff, rules });
  const open = checks.filter((c) => c.date !== "2026-10-11").map((c) => c.workers);
  assert.ok(Math.max(...open) - Math.min(...open) <= 1, open.join(","));
});

test("出勤日には、その人のいつもの勤務時間を入れる（半日勤務は 0.5 人と数える）", () => {
  const staff = [
    { ...s(1, "看護師", 5), workCode: "8:30-17:30" },
    { ...s(2, "機能訓練指導員", 5), workCode: "9:00-16:00" },
    { ...s(3, "介護職員", 3), workCode: "9:00-13:30" },
  ];
  const { grid, checks } = autoShift({ ...base, dates: week, staff, rules: { ...rules, required: 2 } });
  assert.ok(week.some((d) => grid.get(`3|${d}`) === "9:00-13:30"));
  assert.equal(grid.get("1|2026-10-05"), "8:30-17:30");
  const day = checks.find((c) => grid.get(`3|${c.date}`) === "9:00-13:30")!;
  assert.equal(day.workers % 1, 0.5);
});
