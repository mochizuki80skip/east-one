"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSeenUpdateId, LATEST_UPDATE_ID } from "@/lib/updates";
import LogoutButton from "./LogoutButton";

/** ヘッダーのメニュー。ログイン前は表示しない（AuthGate がログイン状態を知らせる） */
export default function HeaderMenu() {
  const [signedIn, setSignedIn] = useState(false);
  /** まだ見ていない更新のお知らせがある */
  const [hasNew, setHasNew] = useState(false);
  useEffect(() => {
    const checkNew = () => setHasNew(getSeenUpdateId() !== LATEST_UPDATE_ID);
    const on = () => {
      setSignedIn(true);
      checkNew();
    };
    const off = () => setSignedIn(false);
    window.addEventListener("eo-signed-in", on);
    window.addEventListener("eo-auth-required", off);
    window.addEventListener("eo-updates-seen", checkNew);
    return () => {
      window.removeEventListener("eo-signed-in", on);
      window.removeEventListener("eo-auth-required", off);
      window.removeEventListener("eo-updates-seen", checkNew);
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
        <Link href="/updates/" className="hover:underline underline-offset-4">
          更新のお知らせ
          {hasNew && <span className="ml-1 rounded bg-white px-1 text-[10px] font-bold text-red-600">NEW</span>}
        </Link>
      </nav>
      <LogoutButton />
    </>
  );
}
