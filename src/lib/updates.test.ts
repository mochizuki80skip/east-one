import { test } from "node:test";
import assert from "node:assert/strict";
import { LATEST_UPDATE_ID, UPDATES, unseenUpdates } from "./updates";

test("更新のお知らせ: id が重ならず、新しい順に並んでいる", () => {
  assert.equal(new Set(UPDATES.map((u) => u.id)).size, UPDATES.length);
  for (let i = 1; i < UPDATES.length; i++) assert.ok(UPDATES[i - 1].date >= UPDATES[i].date, UPDATES[i].id);
  assert.equal(LATEST_UPDATE_ID, UPDATES[0].id);
});

test("更新のお知らせ: 最後に見たものより新しいものだけが未読になる", () => {
  assert.deepEqual(unseenUpdates(LATEST_UPDATE_ID), []);
  assert.deepEqual(unseenUpdates(UPDATES[2].id).map((u) => u.id), [UPDATES[0].id, UPDATES[1].id]);
  assert.equal(unseenUpdates("").length, UPDATES.length); // 初めての端末はすべて未読
});
