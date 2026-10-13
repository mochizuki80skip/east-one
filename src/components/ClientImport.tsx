"use client";

import { useState, useTransition } from "react";
import { importClientsTsv } from "@/lib/forms";
import type { Session } from "@/lib/constants";
import { btnPrimary, input } from "./ui";

export default function ClientImport({ storeId, onDone }: { storeId: number; onDone?: () => void }) {
  const [tsv, setTsv] = useState("");
  const [session, setSession] = useState<"" | Session>("");
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2 text-sm">
      <ol className="list-decimal space-y-0.5 pl-5 text-slate-600">
        <li>スプレッドシートの「曜日別出席リスト」シートを開きます。</li>
        <li>
          左上の「月 火 水…」の見出し行から、午後の表の「計」の行までを選択します（A列〜AK列。B列からでも大丈夫です）。
        </li>
        <li>コピー（Ctrl + C）して、下の枠に貼り付け（Ctrl + V）、「取り込む」を押します。</li>
      </ol>
      <p className="text-xs text-slate-500">同じ名前の方は介護度などを更新し、曜日枠を置き換えます。新しい方は利用者として登録されます。</p>
      <textarea
        value={tsv}
        onChange={(e) => {
          setTsv(e.target.value);
          setMsg(null);
        }}
        rows={6}
        className={`${input} w-full font-mono text-xs`}
        placeholder="（ここに貼り付け）"
      />
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1 text-xs text-slate-600">
          貼り付けた範囲
          <select value={session} onChange={(e) => setSession(e.target.value as "" | Session)} className={input}>
            <option value="">自動（見出しから判定）</option>
            <option value="am">午前の表だけ</option>
            <option value="pm">午後の表だけ</option>
          </select>
        </label>
        <button
          className={btnPrimary}
          disabled={pending || !tsv.trim()}
          onClick={() =>
            start(async () => {
              try {
                const r = await importClientsTsv(storeId, tsv, session || undefined);
                if (r.found === 0) {
                  setMsg({ text: r.hint ?? "読み取れる利用者がいませんでした。", bad: true });
                  return;
                }
                setMsg({
                  text:
                    `読み取り ${r.found}名 / 新規登録 ${r.created}名 / 更新 ${r.updated}名` +
                    (r.skipped ? ` / 名前が空欄の行 ${r.skipped}件は取り込んでいません` : ""),
                });
                setTsv("");
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
      {tsv.trim() && (
        <p className="text-xs text-slate-500">
          貼り付けた内容: {tsv.trim().split(/\r?\n/).length} 行 × 最大 {Math.max(...tsv.split(/\r?\n/).map((l) => l.split("\t").length))} 列
          {!tsv.includes("\t") && <span className="ml-1 text-red-700">（区切りが見つかりません。スプレッドシートから直接コピーしてください）</span>}
        </p>
      )}
      <p className="text-xs text-slate-500">取り込み後、担当ケアマネ・送迎ルートは利用者ごとに設定してください。</p>
    </div>
  );
}
