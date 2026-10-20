"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { importStaffTsv } from "@/lib/forms";
import { links } from "@/lib/links";
import { btnGreen, btnPrimary, input } from "./ui";

export default function StaffImport({ stores, onDone }: { stores: { id: number; name: string }[]; onDone?: () => void }) {
  const [storeId, setStoreId] = useState(stores[0]?.id ?? 0);
  const [tsv, setTsv] = useState("");
  const [msg, setMsg] = useState("");
  const [doneStore, setDoneStore] = useState(0);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2 text-sm">
      <p className="text-slate-600">
        現行のシフト表（スプレッドシート）で「資格」〜「スタッフ名」の列（A〜D列）をスタッフの行ごと選択してコピーし、下に貼り付けてください。
        同じ名前のスタッフは新規作成せず、店舗の所属だけ追加します。取り込み後、「できることを一括登録」で各スタッフのできることを設定してください。
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
              try {
                const r = await importStaffTsv(storeId, tsv);
                setMsg(`読み取り ${r.found}名 / 新規登録 ${r.created}名 / 店舗に追加 ${r.linked}名`);
                setTsv("");
                setDoneStore(storeId);
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
      {doneStore > 0 && !pending && (
        <div className="flex flex-wrap items-center gap-3 rounded bg-brand-50 px-3 py-2">
          <span>次に、取り込んだスタッフの「できること」（運転・整体など）を設定します。</span>
          <Link href={links.staffSkills(doneStore)} className={btnGreen}>
            次へ: できることを一括登録 →
          </Link>
        </div>
      )}
    </div>
  );
}
