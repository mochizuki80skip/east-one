import { test } from "node:test";
import assert from "node:assert/strict";
import { templateReport } from "./report-text";

test("テンプレート: 利用回数とキーワードから文章を作る", () => {
  const text = templateReport({
    clientName: "テスト",
    careLevel: "要支援2",
    ym: "2026-08",
    keywords: "身体機能に大きな変化なし\nペダル漕ぎ24分",
    notes: [
      { date: "2026-08-03", session: "am", status: "present", reason: "", note: "", trainer: "A" },
      { date: "2026-08-05", session: "am", status: "absent", reason: "通院", note: "", trainer: null },
    ],
  });
  assert.match(text, /^8月は1回ご利用いただきました（お休み 1 回）。/);
  assert.match(text, /身体機能に大きな変化なし。ペダル漕ぎ24分。/);
});

test("テンプレート: 利用が無い月は回数の文を出さない", () => {
  const text = templateReport({ clientName: "テスト", careLevel: "", ym: "2026-08", keywords: "", notes: [] });
  assert.doesNotMatch(text, /0回/);
});
