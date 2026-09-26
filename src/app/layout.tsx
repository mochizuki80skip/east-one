import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "East One 現場サポート",
  description: "機能訓練型デイサービス向け 日々のスケジュール・月次報告 作成支援",
};

const NAV = [
  { href: "/", label: "ホーム" },
  { href: "/schedule", label: "日々のスケジュール" },
  { href: "/monthly", label: "月次報告" },
  { href: "/clients", label: "利用者" },
  { href: "/staff", label: "スタッフ" },
  { href: "/courses", label: "送迎コース" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <header className="no-print bg-slate-800 text-white">
          <div className="mx-auto max-w-6xl px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link href="/" className="font-bold text-lg">
              East One 現場サポート
            </Link>
            <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="hover:underline">
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 py-6 flex-1">{children}</main>
      </body>
    </html>
  );
}
