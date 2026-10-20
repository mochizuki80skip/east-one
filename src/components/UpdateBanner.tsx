"use client";

import Link from "next/link";
import { useState } from "react";
import { formatDateJa } from "@/lib/date";
import { getSeenUpdateId, markUpdatesSeen, unseenUpdates } from "@/lib/updates";
import { btnPrimary } from "./ui";

/** まだ見ていない更新のお知らせがあるときだけ、店舗一覧の上に出す */
export default function UpdateBanner() {
  const [unseen, setUnseen] = useState(() => unseenUpdates(getSeenUpdateId()));
  if (unseen.length === 0) return null;
  const close = () => {
    markUpdatesSeen();
    setUnseen([]);
  };
  return (
    <div className="no-print rounded-lg border border-brand-300 bg-brand-50 p-3 text-sm">
      <div className="flex flex-wrap items-start gap-3">
        <span className="rounded bg-red-600 px-1.5 py-0.5 text-[11px] font-bold text-white">NEW</span>
        <div className="flex-1 space-y-0.5">
          <p className="font-semibold text-brand-900">新しい機能・変更のお知らせがあります（{unseen.length}件）</p>
          <ul className="text-slate-700">
            {unseen.slice(0, 3).map((u) => (
              <li key={u.id}>
                ・{formatDateJa(u.date)}　{u.title}
              </li>
            ))}
            {unseen.length > 3 && <li className="text-slate-500">ほか {unseen.length - 3} 件</li>}
          </ul>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/updates/" className={btnPrimary}>
            内容を見る
          </Link>
          <button onClick={close} className="text-xs text-slate-500 underline">
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
