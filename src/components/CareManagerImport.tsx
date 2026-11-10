"use client";

import { useState, useTransition } from "react";
import { parseCareManagers } from "@/lib/caremanager-import";
import { decodeText } from "@/lib/csv";
import { importCareManagers } from "@/lib/data";
import { btnPrimary, input, td, th } from "./ui";

/** ケアマネ一覧を CSV ファイル、またはスプレッドシートからの貼り付けで取り込む */
export default function CareManagerImport({ onDone }: { onDone?: () => void }) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [pending, start] = useTransition();
  const parsed = text.trim() ? parseCareManagers(text) : null;

  return (
    <div className="space-y-2 text-sm">
      <p className="text-slate-600">
        スプレッドシートでケアマネの一覧を選択してコピーし下に貼り付けるか、CSV ファイルを選んでください。1行目に「事業所」「ケアマネ名」「電話」「FAX」「メモ」などの見出しがあれば、列の順番は自由です（見出しが無いときはこの順番で読みます）。
        同じ事業所・同じ名前の方は、空欄でない項目だけ上書きします。
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-50">
          📁 CSV ファイルを選ぶ
          <input
            type="file"
            accept=".csv,.tsv,.txt,text/csv"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setText(decodeText(await f.arrayBuffer()));
              setFileName(f.name);
              setMsg(null);
              e.target.value = "";
            }}
          />
        </label>
        {fileName && <span className="text-slate-500">{fileName}</span>}
      </div>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setFileName("");
          setMsg(null);
        }}
        rows={5}
        className={`${input} w-full font-mono text-xs`}
        placeholder={"事業所\tケアマネ名\t電話\tFAX\tメモ\nひまわり居宅介護支援事業所\t山田 花子\t055-000-0000\t055-000-0001\t"}
      />
      {parsed && (
        <div className="space-y-1">
          {parsed.hint ? (
            <p className="text-red-700">{parsed.hint}</p>
          ) : (
            <>
              <p className="text-slate-700">
                読み取り {parsed.list.length}名（{parsed.header ? "見出しの列名から読み取り" : "見出しなし: 事業所・ケアマネ名・電話・FAX・メモの順"}）
                {parsed.list.length > 5 && "。先頭 5 名を表示しています"}
              </p>
              <table className="border">
                <thead>
                  <tr>
                    {["事業所", "ケアマネ名", "電話", "FAX", "メモ"].map((h) => (
                      <th key={h} className={th}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsed.list.slice(0, 5).map((c, i) => (
                    <tr key={i}>
                      <td className={td}>{c.office}</td>
                      <td className={td}>{c.name}</td>
                      <td className={td}>{c.phone}</td>
                      <td className={td}>{c.fax}</td>
                      <td className={td}>{c.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
      <div className="flex items-center gap-3">
        <button
          className={btnPrimary}
          disabled={pending || !parsed || parsed.list.length === 0}
          onClick={() =>
            start(async () => {
              try {
                const r = await importCareManagers(parsed!.list);
                setMsg({ text: `取り込みました（新規 ${r.created}名 / 更新 ${r.updated}名）` });
                setText("");
                setFileName("");
                onDone?.();
              } catch (e) {
                setMsg({ text: `取り込みに失敗しました: ${(e as Error).message}`, bad: true });
              }
            })
          }
        >
          取り込む
        </button>
        {pending ? <span className="text-slate-600">取り込み中…</span> : msg && <span className={msg.bad ? "text-red-700" : "text-slate-700"}>{msg.text}</span>}
      </div>
    </div>
  );
}
