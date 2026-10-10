"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { links } from "@/lib/links";
import { currentYm, todayStr } from "@/lib/date";

export default function StoreNav({ storeId }: { storeId: number }) {
  const path = usePathname();
  const items = [
    { href: links.daily(storeId, todayStr()), match: "/store/daily", label: "日々のスケジュール" },
    { href: links.shifts(storeId, currentYm()), match: "/store/shifts", label: "シフト" },
    { href: links.weekly(storeId), match: "/store/weekly", label: "曜日別利用者" },
    { href: links.clients(storeId), match: "/store/clients", label: "利用者" },
    { href: links.monthly(storeId, currentYm()), match: "/store/monthly", label: "月次報告" },
    { href: links.settings(storeId), match: "/store/settings", label: "店舗設定" },
  ];
  return (
    <nav className="flex flex-wrap gap-1 text-sm">
      {items.map((i) => {
        const active = path.startsWith(i.match);
        return (
          <Link key={i.match} href={i.href} className={`rounded px-3 py-1 ${active ? "bg-slate-800 text-white" : "text-slate-700 hover:bg-slate-200"}`}>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
