import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { parseDelimited } from "./csv";
import { parseCareManagers } from "./caremanager-import";
import { buildXlsx, crc32 } from "./xlsx";

test("CSV: 引用符・カンマ・改行・BOM に対応し、タブ区切りも読める", () => {
  assert.deepEqual(parseDelimited('﻿a,"b,c","d ""e"""\r\n"f\ng",h\n'), [
    ["a", "b,c", 'd "e"'],
    ["f\ng", "h"],
  ]);
  assert.deepEqual(parseDelimited("x\ty\n\n1\t2"), [
    ["x", "y"],
    ["1", "2"],
  ]);
});

test("ケアマネ取り込み: 見出しの列名から読み、列の順番が違っても読める", () => {
  const csv = "ケアマネ名,電話番号,居宅介護支援事業所名,FAX,備考\n山田 花子,055-111-1111,ひまわり居宅,055-111-2222,月曜不在\n,,空行,,\n山田　花子,,ひまわり居宅,,";
  const r = parseCareManagers(csv);
  assert.equal(r.header, true);
  assert.deepEqual(r.list, [{ office: "ひまわり居宅", name: "山田 花子", phone: "055-111-1111", fax: "055-111-2222", note: "月曜不在" }]);
});

test("ケアマネ取り込み: 見出しが無いときは「事業所・ケアマネ名・電話・FAX・メモ」の順", () => {
  const r = parseCareManagers("さくら居宅\t佐藤 一郎\t055-000-0000\t055-000-0001\t");
  assert.equal(r.header, false);
  assert.deepEqual(r.list, [{ office: "さくら居宅", name: "佐藤 一郎", phone: "055-000-0000", fax: "055-000-0001", note: "" }]);
});

test("Excel 出力: 正しい ZIP（CRC・中身）になっている", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
  const bytes = buildXlsx("ケアマネ一覧", [["事業所", "ケアマネ名", "担当"], ["ひまわり<居宅>", "山田 & 花子", 3]], [30, 16, 8]);
  assert.equal(new DataView(bytes.buffer).getUint32(0, true), 0x04034b50);
  const text = new TextDecoder().decode(bytes);
  assert.ok(text.includes("ひまわり&lt;居宅&gt;"));
  assert.ok(text.includes("<v>3</v>"));
  if (process.env.XLSX_OUT) writeFileSync(process.env.XLSX_OUT, bytes);
});
