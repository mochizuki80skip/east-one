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
      className="text-xs text-slate-300 hover:text-white hover:underline"
    >
      ログアウト
    </button>
  );
}
