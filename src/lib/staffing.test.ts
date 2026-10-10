import { test } from "node:test";
import assert from "node:assert/strict";
import { freeStaffBlocks, planDuties, qualificationSummary, type StaffLite } from "./staffing";

const staff: StaffLite[] = [
  { id: 1, name: "A", role: "管理者", skills: ["運転", "体操"] },
  { id: 2, name: "B", role: "生活相談員兼介護職員", skills: ["運転", "体操", "メディカルケア", "FIT"] },
  { id: 3, name: "C", role: "機能訓練指導員", skills: ["整体"] },
  { id: 4, name: "D", role: "看護師", skills: [] },
  { id: 5, name: "E", role: "介護職員", skills: ["体操"] },
];
const codes = new Map<number, string>([
  [1, "〇"],
  [2, "〇"],
  [3, "〇"],
  [4, "午前"],
  [5, "午後"],
]);
const codeOf = (id: number) => codes.get(id);

test("資格ごとの出勤人数: 兼務は両方に数え、午前・午後を分ける", () => {
  const { rows, am, pm } = qualificationSummary(staff, codeOf);
  const get = (q: string) => rows.find((r) => r.qualification === q)!;
  assert.deepEqual(get("生活相談員").am, ["B"]);
  assert.deepEqual(get("介護職員").am, ["B"]);
  assert.deepEqual(get("介護職員").pm, ["B", "E"]);
  assert.deepEqual(get("看護師").pm, []);
  assert.equal(am, 4);
  assert.equal(pm, 4);
});

test("空いているスタッフ: 送迎・訓練・体操等の担当がない出勤者を時間帯ごとに出す", () => {
  const blocks = freeStaffBlocks({
    staff,
    codeOf,
    slots: { am: ["9:45"], pm: ["14:05"] },
    runs: [
      { run: "morning", driver_id: 1, escort_id: null },
      { run: "noon_drop", driver_id: 2, escort_id: null },
      { run: "noon_pick", driver_id: 2, escort_id: null },
    ],
    training: [{ session: "am", slot_time: "9:45", staff_id: 3 }],
    duties: [{ session: "pm", duty: "体操", staff_id: 5 }],
  });
  const free = (key: string) => blocks.find((b) => b.key === key)!.free;
  assert.deepEqual(free("morning"), [2, 3, 4]);
  assert.deepEqual(free("am-9:45"), [1, 2, 4]);
  assert.deepEqual(free("noon_pick"), [1, 3, 5]);
  assert.deepEqual(free("pm-duty"), [1, 2, 3]);
  assert.deepEqual(free("evening"), [1, 2, 3, 5]);
});

test("体操等の担当: 3つを持てる人を優先し、昼の運転者は避ける", () => {
  const { duties } = planDuties({ staff, codeOf, runs: [], training: [] });
  assert.ok(duties.filter((d) => d.session === "am").every((d) => d.staff_id === 2));
  const r2 = planDuties({ staff, codeOf, runs: [{ run: "noon_drop", driver_id: 2, escort_id: null }], training: [] });
  const am = r2.duties.filter((d) => d.session === "am");
  assert.equal(am.find((d) => d.duty === "体操")!.staff_id, 1);
  assert.ok(am.every((d) => d.staff_id !== 2));
});
