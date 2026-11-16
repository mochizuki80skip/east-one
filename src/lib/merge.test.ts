import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeCells } from "./merge";

test("シフト表の合わせ方: 別々のマスの変更は両方残る", () => {
  const base = { "1|10-01": "〇", "2|10-01": "休" };
  const mine = { "1|10-01": "休", "2|10-01": "休" }; // こちらは 1 を変更
  const theirs = { "1|10-01": "〇", "2|10-01": "〇", "3|10-02": "午前" }; // 向こうは 2 を変更・3 を追加
  const r = mergeCells(base, mine, theirs);
  assert.deepEqual(r.merged, { "1|10-01": "休", "2|10-01": "〇", "3|10-02": "午前" });
  assert.deepEqual(r.conflicts, []);
  assert.equal(r.fromOthers, 2);
});

test("シフト表の合わせ方: 同じマスを違う内容に変えたら確認、優先を選べば合わせられる", () => {
  const base = { "1|10-01": "〇" };
  const mine = { "1|10-01": "休" };
  const theirs = { "1|10-01": "有" };
  assert.deepEqual(mergeCells(base, mine, theirs).conflicts, [{ key: "1|10-01", base: "〇", mine: "休", theirs: "有" }]);
  assert.deepEqual(mergeCells(base, mine, theirs, "mine").merged, { "1|10-01": "休" });
  assert.deepEqual(mergeCells(base, mine, theirs, "theirs").merged, { "1|10-01": "有" });
  // 両方で同じ内容に変えたのは確認不要
  assert.deepEqual(mergeCells(base, { "1|10-01": "有" }, theirs).conflicts, []);
  // こちらで消したマスは消える（向こうが変えていなければ）
  assert.deepEqual(mergeCells({ a: "〇", b: "休" }, { b: "休" }, { a: "〇", b: "休" }).merged, { b: "休" });
});
