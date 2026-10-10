import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "East-one 業務サポート",
  description: "機能訓練型デイサービス向け シフト・日々のスケジュール・月次報告 作成支援",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <header className="no-print bg-slate-800 text-white">
          <div className="mx-auto max-w-7xl px-4 py-2.5 flex flex-wrap items-center gap-x-6 gap-y-1">
            <Link href="/" className="font-bold">
              East-one 業務サポート
            </Link>
            <nav className="flex flex-wrap gap-x-4 text-sm">
              <Link href="/" className="hover:underline">
                店舗一覧
              </Link>
              <Link href="/staff" className="hover:underline">
                スタッフ
              </Link>
              <Link href="/caremanagers" className="hover:underline">
                ケアマネ
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 py-5 flex-1 print:max-w-none print:p-0">{children}</main>
      </body>
    </html>
  );
}
