"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import LogoutButton from "./LogoutButton";

/** ヘッダーのメニュー。ログイン前は表示しない（AuthGate がログイン状態を知らせる） */
export default function HeaderMenu() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    const on = () => setSignedIn(true);
    const off = () => setSignedIn(false);
    window.addEventListener("eo-signed-in", on);
    window.addEventListener("eo-auth-required", off);
    return () => {
      window.removeEventListener("eo-signed-in", on);
      window.removeEventListener("eo-auth-required", off);
    };
  }, []);
  if (!signedIn) return null;
  return (
    <>
      <nav className="flex flex-1 flex-wrap gap-x-4 text-sm font-medium">
        <Link href="/" className="hover:underline underline-offset-4">
          店舗一覧
        </Link>
        <Link href="/staff/" className="hover:underline underline-offset-4">
          スタッフ
        </Link>
        <Link href="/caremanagers/" className="hover:underline underline-offset-4">
          ケアマネ
        </Link>
      </nav>
      <LogoutButton />
    </>
  );
}
