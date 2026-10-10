import { test } from "node:test";
import assert from "node:assert/strict";
import { parseStaffSheet, parseWeeklyList } from "./import";

const row = (...cells: string[]) => cells.join("\t");
const blank6 = ["", "", "", "", "", ""];

test("曜日別出席リスト: 午前・午後の曜日枠を読み取り、同名の方はまとめる", () => {
  const tsv = [
    row("", "月", "", "", "", "", "", "火"),
    row("午前", "名前", "", "介護度", "性別", "年齢", "新・再", "名前", "", "介護度", "性別", "年齢", "新・再"),
    row("1", "テスト 花子", "", "要支援２", "女", "80", "", "テスト太郎様", "", "要介護1", "男", "75", "新規"),
    row("2", "", "", "要支援1", "女", "70", "", ...blank6),
    row("計", "総計", "1"),
    row("", "月", "", "", "", "", "", "火"),
    row("午後", "名前", "", "介護度", "性別", "年齢", "新・再"),
    row("1", "テスト花子", "", "要支援2", "女", "80", ""),
  ].join("\n");
  const { clients, skipped } = parseWeeklyList(tsv);
  assert.equal(skipped, 1);
  const hanako = clients.find((c) => c.name === "テスト花子")!;
  assert.equal(hanako.care_level, "要支援2");
  assert.deepEqual(hanako.slots, [
    { weekday: 1, session: "am" },
    { weekday: 1, session: "pm" },
  ]);
  const taro = clients.find((c) => c.name === "テスト太郎")!;
  assert.deepEqual(taro.slots, [{ weekday: 2, session: "am" }]);
  assert.equal(taro.new_flag, "新規");
  assert.equal(taro.age, 75);
});

test("シフト表のスタッフ欄: 資格・勤務形態・名前を読み取る（全角の勤務形態にも対応）", () => {
  const tsv = [
    row("資格", "", "勤務形態", "スタッフ名", "木"),
    row("管理者", "", "Ａ", "山田", ""),
    row("看護師", "", "Ｄ", "佐藤", ""),
    row("", "", "出勤者数", "", "0"),
  ].join("\n");
  assert.deepEqual(parseStaffSheet(tsv), [
    { name: "山田", role: "管理者", employment: "A" },
    { name: "佐藤", role: "看護師", employment: "D" },
  ]);
});
