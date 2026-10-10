"use client";

import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { btnPrimary, input } from "./ui";

/** ログインしていなければログイン画面を出す */
export default function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"checking" | "in" | "out">("checking");
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .me()
      .then(() => setState("in"))
      .catch((e) => {
        setState("out");
        if (e.status !== 401) setError(e.message);
      });
    const onAuth = () => setState("out");
    window.addEventListener("eo-auth-required", onAuth);
    return () => window.removeEventListener("eo-auth-required", onAuth);
  }, []);

  if (state === "checking") return <p className="py-10 text-center text-sm text-slate-500">確認中…</p>;
  if (state === "in") return <>{children}</>;
  return (
    <div className="mx-auto mt-16 max-w-sm rounded-lg border bg-white p-6 shadow-sm">
      <h1 className="mb-4 text-lg font-bold">East-one 業務サポート</h1>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await api.login(password);
            setPassword("");
            setState("in");
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
        className="space-y-3"
      >
        <label className="block text-sm">
          パスワード
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus className={`${input} mt-1 w-full`} />
        </label>
        <button disabled={busy || !password} className={`${btnPrimary} w-full justify-center`}>
          ログイン
        </button>
        {error && <p className="text-sm text-red-700">{error}</p>}
      </form>
    </div>
  );
}
