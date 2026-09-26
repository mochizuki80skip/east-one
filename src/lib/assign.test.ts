import { test } from "node:test";
import assert from "node:assert/strict";
import { assignCourses, assignSeitai, emptyHistory, type AssignStaff } from "./assign";

const staff: AssignStaff[] = [
  { id: 1, name: "A", can_drive: 1, can_seitai: 1, sort_order: 1 },
  { id: 2, name: "B", can_drive: 1, can_seitai: 1, sort_order: 2 },
  { id: 3, name: "C", can_drive: 0, can_seitai: 1, sort_order: 3 },
];

test("送迎: 前回と同じ担当を避ける", () => {
  const h = emptyHistory();
  h.lastCourseDriver.set(10, 1);
  const r = assignCourses([{ id: 10, kind: "pickup", slot: 1, sort_order: 1 }], staff, h);
  assert.equal(r.get(10), 2);
});

test("送迎: 同じ時間帯のコースを1人が2つ持たない", () => {
  const r = assignCourses(
    [
      { id: 10, kind: "pickup", slot: 1, sort_order: 1 },
      { id: 11, kind: "pickup", slot: 1, sort_order: 2 },
    ],
    staff,
    emptyHistory(),
  );
  assert.notEqual(r.get(10), r.get(11));
  assert.ok(r.get(10) != null && r.get(11) != null);
});

test("送迎: 運転できる人がいなければ null", () => {
  const r = assignCourses([{ id: 10, kind: "pickup", slot: 1, sort_order: 1 }], [staff[2]], emptyHistory());
  assert.equal(r.get(10), null);
});

test("送迎: 手動固定を尊重する", () => {
  const h = emptyHistory();
  h.lastCourseDriver.set(10, 2);
  const r = assignCourses([{ id: 10, kind: "pickup", slot: 1, sort_order: 1 }], staff, h, new Map([[10, 2]]));
  assert.equal(r.get(10), 2);
});

test("整体: 前回と同じ担当を避け、負荷を平準化する", () => {
  const h = emptyHistory();
  h.lastSeitaiStaff.set(100, 1);
  h.lastSeitaiStaff.set(101, 1);
  h.lastSeitaiStaff.set(102, 2);
  const r = assignSeitai([100, 101, 102], staff, h);
  assert.notEqual(r.get(100), 1);
  assert.notEqual(r.get(101), 1);
  assert.notEqual(r.get(102), 2);
  const counts = new Map<number | null, number>();
  for (const v of r.values()) counts.set(v, (counts.get(v) ?? 0) + 1);
  assert.ok(Math.max(...counts.values()) <= 1, "3人に分散する");
});

test("整体: 直近の担当回数が少ない人を優先する", () => {
  const h = emptyHistory();
  h.seitaiCounts.set(1, 5);
  h.seitaiCounts.set(2, 1);
  h.seitaiCounts.set(3, 3);
  const r = assignSeitai([100], staff, h);
  assert.equal(r.get(100), 2);
});

test("整体: 当日の送迎担当が多い人より少ない人を優先する", () => {
  const drive = new Map([[1, 2], [2, 2]]);
  const r = assignSeitai([100], staff, emptyHistory(), new Map(), drive);
  assert.equal(r.get(100), 3);
});
