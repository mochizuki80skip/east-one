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

// 実際のシート（曜日別出席リスト）と同じ並び。名前は架空
const header = (labels: string[]) => ["", ...labels.flatMap((w) => [w, "", "", "", "", ""])].join("\t");
const colHead = (first: string) => [first, ...Array.from({ length: 6 }, () => ["名前", "", "介護度", "性別", "年齢", "新・再"]).flat()].join("\t");
const dataRow = (no: string, people: [string, string, string, string, string][]) =>
  [no, ...people.flatMap(([n, l, g, a, f]) => [n, "", l, g, a, f])].join("\t");
const six = <T,>(x: T) => [x, x, x, x, x, x];
const fullSheet = [
  header(["月", "火", "水", "木", "金", "土"]),
  colHead("午前"),
  dataRow("1", [["朝日花子", "要介護1", "女", "91", ""], ["夕月太郎", "要支援2", "男", "80", "新規"], ...six(["", "", "", "", ""] as [string, string, string, string, string]).slice(0, 4)]),
  dataRow("2", [["", "要支援1", "女", "70", ""], ...six(["", "", "", "", ""] as [string, string, string, string, string]).slice(0, 5)]),
  ["計", "総計", "1", "事業対象者", "0", "新規", "0"].join("\t"),
  ["", "男", "3", "要支援1", "3", "再開", "0"].join("\t"),
  header(["月", "火", "水", "木", "金", "土"]),
  colHead("午後"),
  dataRow("1", [["", "", "", "", ""], ["", "", "", "", ""], ["朝日花子", "要介護１", "女", "91", ""], ["", "", "", "", ""], ["", "", "", "", ""], ["", "", "", "", ""]]),
  ["計", "総計", "1"].join("\t"),
];

test("曜日別出席リスト: A列から貼り付け（見出し・計・男女の集計行を含む）", () => {
  const r = parseWeeklyList(fullSheet.join("\n"));
  assert.equal(r.clients.length, 2);
  assert.equal(r.skipped, 1);
  assert.deepEqual(r.clients.find((c) => c.name === "朝日花子")!.slots, [
    { weekday: 1, session: "am" },
    { weekday: 3, session: "pm" },
  ]);
  assert.equal(r.clients.find((c) => c.name === "夕月太郎")!.new_flag, "新規");
});

test("曜日別出席リスト: B列（「月」の見出し）から貼り付け", () => {
  const withoutA = fullSheet.map((line) => line.split("\t").slice(1).join("\t")).join("\n");
  const r = parseWeeklyList(withoutA);
  assert.equal(r.clients.length, 2);
  assert.deepEqual(r.clients.find((c) => c.name === "朝日花子")!.slots, [
    { weekday: 1, session: "am" },
    { weekday: 3, session: "pm" },
  ]);
});

test("曜日別出席リスト: 見出しなしで名前の行だけ（午前・午後を指定）", () => {
  const onlyRows = fullSheet.slice(2, 4).map((line) => line.split("\t").slice(1).join("\t")).join("\n");
  assert.equal(parseWeeklyList(onlyRows).clients.length, 0);
  assert.ok(parseWeeklyList(onlyRows).hint);
  const r = parseWeeklyList(onlyRows, "pm");
  assert.deepEqual(r.clients.find((c) => c.name === "夕月太郎")!.slots, [{ weekday: 2, session: "pm" }]);
});

test("曜日別出席リスト: 何も読めないときは理由を返す", () => {
  const r = parseWeeklyList("あいう\tえお");
  assert.equal(r.clients.length, 0);
  assert.ok(r.hint);
});
