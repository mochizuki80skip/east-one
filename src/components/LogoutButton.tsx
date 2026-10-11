"use client";

import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function LogoutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await api.logout().catch(() => {});
        window.dispatchEvent(new Event("eo-auth-required"));
        router.push("/");
      }}
      className="rounded border border-white/50 px-2 py-0.5 text-xs text-white hover:bg-white/15"
    >
      ログアウト
    </button>
  );
}
