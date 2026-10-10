"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function StoreNav({ storeId, today, ym }: { storeId: number; today: string; ym: string }) {
  const path = usePathname();
  const base = `/s/${storeId}`;
  const items = [
    { href: `${base}/daily/${today}`, match: `${base}/daily`, label: "日々のスケジュール" },
    { href: `${base}/shifts/${ym}`, match: `${base}/shifts`, label: "シフト" },
    { href: `${base}/weekly`, match: `${base}/weekly`, label: "曜日別利用者" },
    { href: `${base}/clients`, match: `${base}/clients`, label: "利用者" },
    { href: `${base}/monthly/${ym}`, match: `${base}/monthly`, label: "月次報告" },
    { href: `${base}/settings`, match: `${base}/settings`, label: "店舗設定" },
  ];
  return (
    <nav className="flex flex-wrap gap-1 text-sm">
      {items.map((i) => {
        const active = path.startsWith(i.match);
        return (
          <Link
            key={i.match}
            href={i.href}
            className={`rounded px-3 py-1 ${active ? "bg-slate-800 text-white" : "text-slate-700 hover:bg-slate-200"}`}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
