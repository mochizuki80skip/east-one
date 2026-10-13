"use client";

import Image from "next/image";
import { useEffect, useState, type ReactNode } from "react";
import { api, type ServerCheck } from "@/lib/api";
import { btnPrimary, input } from "./ui";

/** ログインしていなければログイン画面を出す */
export default function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"checking" | "in" | "out">("checking");
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [check, setCheck] = useState<ServerCheck | string | null>(null);

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

  useEffect(() => {
    if (state === "in") window.dispatchEvent(new Event("eo-signed-in"));
  }, [state]);

  if (state === "checking") return <p className="py-10 text-center text-sm text-slate-500">確認中…</p>;
  if (state === "in") return <>{children}</>;
  return (
    <div className="mx-auto mt-10 max-w-sm overflow-hidden rounded-2xl border border-brand-200 bg-white shadow-sm">
      <div className="bg-brand-500">
        <Image src="/brand/logo.jpg" alt="機能訓練施設 East-one" width={360} height={360} className="mx-auto h-56 w-56" priority />
      </div>
      <div className="p-6">
        <h1 className="mb-4 text-center text-lg font-bold text-brand-800">業務サポート ログイン</h1>
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
          {error && <p className="break-all text-sm text-red-700">{error}</p>}
          <button
            type="button"
            onClick={async () => {
              setCheck("確認中…");
              try {
                setCheck(await api.check());
              } catch (e) {
                setCheck((e as Error).message);
              }
            }}
            className="w-full text-center text-xs text-brand-700 underline"
          >
            ログインできないときは、サーバーの状態を確認
          </button>
          {check && <ServerCheckView check={check} />}
        </form>
      </div>
    </div>
  );
}

function ServerCheckView({ check }: { check: ServerCheck | string }) {
  if (typeof check === "string") return <p className="break-all rounded bg-slate-50 p-2 text-xs text-red-700">{check}</p>;
  const rows: [string, boolean, string][] = [
    ["PHP のバージョン", check.php_ok, check.php_ok ? check.php : `${check.php}（8.2 以上にしてください）`],
    ["api/config.php", check.config && !check.config_error, check.config_error ?? (check.config ? "あります" : "ありません（作成してください）")],
    ["ログインのパスワード", check.password_set, check.password_set ? "設定済み" : "config.php で設定してください"],
    ["データベース", check.database === "接続できます", check.database],
    ["ログイン情報の保存", check.session, check.session ? "使えます" : "使えません（サーバーの設定を確認）"],
    ["AI 用ライブラリ（vendor）", check.ai_library, check.ai_library ? "あります" : "ありません（無くても動きます）"],
    ["AI のキー", check.ai_key, check.ai_key ? "設定済み" : "未設定（無くても動きます）"],
  ];
  return (
    <table className="w-full text-xs">
      <tbody>
        {rows.map(([label, ok, text]) => (
          <tr key={label} className="border-b last:border-0">
            <td className="py-1 pr-2 text-slate-600">{label}</td>
            <td className={`py-1 ${ok ? "text-emerald-700" : "text-red-700"}`}>
              {ok ? "✔" : "✖"} {text}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
