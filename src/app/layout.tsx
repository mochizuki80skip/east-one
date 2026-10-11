import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import HeaderMenu from "@/components/HeaderMenu";
import "./globals.css";

export const metadata: Metadata = {
  title: "East-one 業務サポート",
  description: "機能訓練型デイサービス向け シフト・日々のスケジュール・月次報告 作成支援",
  // 社内システムなので検索エンジンに載せない
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <header className="no-print bg-brand-600 text-white shadow-sm">
          <div className="mx-auto max-w-7xl px-4 py-2 flex flex-wrap items-center gap-x-6 gap-y-1">
            <Link href="/" className="flex items-center gap-2">
              <Image src="/brand/mark.png" alt="" width={36} height={36} className="rounded-lg ring-2 ring-white/70" priority />
              <span className="leading-tight">
                <span className="block text-[10px] font-medium text-brand-100">機能訓練施設</span>
                <span className="block font-bold tracking-wide">East-one 業務サポート</span>
              </span>
            </Link>
            {/* メニューはログイン後だけ表示 */}
            <HeaderMenu />
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 py-5 flex-1 print:max-w-none print:p-0">
          <AuthGate>{children}</AuthGate>
        </main>
      </body>
    </html>
  );
}
