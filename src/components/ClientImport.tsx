"use client";

import { useState, useTransition } from "react";
import { importClientsTsv } from "@/lib/forms";
import { btnPrimary, input } from "./ui";

export default function ClientImport({ storeId, onDone }: { storeId: number; onDone?: () => void }) {
  const [tsv, setTsv] = useState("");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2 text-sm">
      <p className="text-slate-600">
        スプレッドシートの「曜日別出席リスト」シートで、「月 火 水…」の見出し行から午後の「計」の行まで（A列〜AK列）を選択してコピーし、下に貼り付けてください。
        同じ名前の方は介護度などを更新し、曜日枠を置き換えます。新しい方は利用者として登録されます。
      </p>
      <textarea value={tsv} onChange={(e) => setTsv(e.target.value)} rows={6} className={`${input} w-full font-mono text-xs`} placeholder="（ここに貼り付け）" />
      <div className="flex items-center gap-3">
        <button
          className={btnPrimary}
          disabled={pending || !tsv.trim()}
          onClick={() =>
            start(async () => {
              try {
                const r = await importClientsTsv(storeId, tsv);
                setMsg(
                  `読み取り ${r.found}名 / 新規登録 ${r.created}名 / 更新 ${r.updated}名` +
                    (r.skipped ? ` / 名前が空欄の行 ${r.skipped}件は取り込んでいません` : ""),
                );
                setTsv("");
                onDone?.();
              } catch (e) {
                setMsg(`取り込みに失敗しました: ${(e as Error).message}`);
              }
            })
          }
        >
          取り込む
        </button>
        <span className="text-slate-600">{pending ? "取り込み中…" : msg}</span>
      </div>
      <p className="text-xs text-slate-500">取り込み後、担当ケアマネ・送迎ルートは利用者ごとに設定してください。</p>
    </div>
  );
}
