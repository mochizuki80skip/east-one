"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatDateJa } from "@/lib/date";
import { getSeenUpdateId, markUpdatesSeen, UPDATES, unseenUpdates, type UpdateKind } from "@/lib/updates";
import { PageTitle, btnSecondary } from "@/components/ui";

const KIND_STYLE: Record<UpdateKind, string> = {
  新機能: "bg-brand-600 text-white",
  改善: "bg-sky-100 text-sky-800",
  変更: "bg-amber-100 text-amber-900",
  修正: "bg-slate-200 text-slate-700",
};

export default function UpdatesView() {
  // 開く前に見ていなかったお知らせに NEW を付け、開いたら既読にする
  const [unseen] = useState(() => new Set(unseenUpdates(getSeenUpdateId()).map((u) => u.id)));
  useEffect(() => markUpdatesSeen(), []);

  return (
    <div className="space-y-4">
      <PageTitle sub="機能の追加・変更の履歴です（新しい順）。">更新のお知らせ</PageTitle>
      <ol className="space-y-4">
        {UPDATES.map((u) => (
          <li key={u.id} id={u.id} className={`rounded-lg border bg-white p-4 ${unseen.has(u.id) ? "border-brand-400 shadow-sm" : ""}`}>
            <div className="flex flex-wrap items-center gap-2">
              <time className="text-sm text-slate-500">
                {Number(u.date.slice(0, 4))}年{formatDateJa(u.date)}
              </time>
              <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${KIND_STYLE[u.kind]}`}>{u.kind}</span>
              {unseen.has(u.id) && <span className="rounded bg-red-600 px-1.5 py-0.5 text-[11px] font-bold text-white">NEW</span>}
            </div>
            <h2 className="mt-1 text-lg font-bold text-brand-900">{u.title}</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
              {u.items.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
            {(u.where || u.link) && (
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                {u.where && (
                  <span className="rounded bg-slate-50 px-2 py-1 text-slate-600">
                    <span className="font-semibold">使う場所:</span> {u.where}
                  </span>
                )}
                {u.link && (
                  <Link href={u.link.href} className={btnSecondary}>
                    {u.link.label} →
                  </Link>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
