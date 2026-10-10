"use client";

import { useState, useTransition } from "react";
import { importStaffAction } from "@/app/actions/masters";
import { btnPrimary, input } from "./ui";

export default function StaffImport({ stores }: { stores: { id: number; name: string }[] }) {
  const [storeId, setStoreId] = useState(stores[0]?.id ?? 0);
  const [tsv, setTsv] = useState("");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2 text-sm">
      <p className="text-slate-600">
        現行のシフト表（スプレッドシート）で「資格」〜「スタッフ名」の列（A〜D列）をスタッフの行ごと選択してコピーし、下に貼り付けてください。
        同じ名前のスタッフは新規作成せず、店舗の所属だけ追加します。取り込み後、各スタッフの「できること」を設定してください。
      </p>
      <div className="flex items-center gap-2">
        <span>取り込み先の店舗</span>
        <select value={storeId} onChange={(e) => setStoreId(Number(e.target.value))} className={input}>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <textarea value={tsv} onChange={(e) => setTsv(e.target.value)} rows={5} className={`${input} w-full font-mono text-xs`} placeholder="管理者	（空）	Ａ	山田 …" />
      <div className="flex items-center gap-3">
        <button
          className={btnPrimary}
          disabled={pending || !tsv.trim()}
          onClick={() =>
            start(async () => {
              const r = await importStaffAction(storeId, tsv);
              setMsg(`読み取り ${r.found}名 / 新規登録 ${r.created}名 / 店舗に追加 ${r.linked}名`);
              setTsv("");
            })
          }
        >
          取り込む
        </button>
        <span className="text-slate-600">{pending ? "取り込み中…" : msg}</span>
      </div>
    </div>
  );
}
