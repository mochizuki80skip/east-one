/**
 * PHP API（Xサーバー上の /api/index.php）との通信。
 * データは「種別(c) + ID + JSON」の文書として保存される。
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api/index.php";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    /** 409（別の端末で先に保存）のときの、いまの版 */
    public conflict?: { c: string; id: string; rev: number; updated_at: string | null },
  ) {
    super(message);
  }
}

export type Doc<T> = { id: string; data: T; updated_at: string };
/** rev を付けた保存は、サーバー上の版が rev と同じときだけ保存する（違えば 409） */
export type BatchOp = { op: "put"; c: string; id?: string | number | null; data: object; rev?: number | null } | { op: "delete"; c: string; id: string | number };

async function call<T>(action: string, opts: { query?: Record<string, string>; body?: unknown } = {}): Promise<T> {
  const q = new URLSearchParams({ action, ...(opts.query ?? {}) });
  let res: Response;
  try {
    res = await fetch(`${API_URL}?${q}`, {
      method: opts.body !== undefined ? "POST" : "GET",
      credentials: "same-origin",
      headers: opts.body !== undefined ? { "Content-Type": "application/json", "X-East-One": "1" } : { "X-East-One": "1" },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError("サーバーに接続できません。ネットワークを確認してください。", 0);
  }
  const text = await res.text();
  let json: { error?: string } & Record<string, unknown> = {};
  try {
    json = JSON.parse(text);
  } catch {
    // PHP ではなくエラー画面などが返ってきたとき。原因の手がかりとして中身の先頭を添える
    const snippet = text
      .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
    const why =
      res.status === 404
        ? "api フォルダか index.php が見つかりません"
        : res.status === 403
          ? "サーバーにアクセスを止められました（WAF やアクセス制限の可能性）"
          : res.status >= 500
            ? "サーバー内部のエラーです"
            : "PHP が動いていない可能性があります";
    throw new ApiError(`サーバーの応答が正しくありません（${res.status}：${why}）${snippet ? `　内容: ${snippet}` : ""}`, res.status);
  }
  if (!res.ok) {
    if (res.status === 401 && action !== "login" && typeof window !== "undefined") window.dispatchEvent(new Event("eo-auth-required"));
    throw new ApiError(json.error ?? `エラー（${res.status}）`, res.status, (json as { conflict?: ApiError["conflict"] }).conflict);
  }
  return json as T;
}

export type ServerCheck = {
  php: string;
  php_ok: boolean;
  config: boolean;
  config_error?: string;
  password_set: boolean;
  database: string;
  ai_library: boolean;
  ai_key: boolean;
  session: boolean;
};

export const api = {
  check: () => call<ServerCheck>("check"),
  me: () => call<{ user: string; ai: boolean }>("me"),
  login: (password: string) => call<{ ok: true }>("login", { body: { password } }),
  logout: () => call<{ ok: true }>("logout", { body: {} }),
  list: async <T>(c: string, f: { from?: string; to?: string; prefix?: string; suffix?: string } = {}) =>
    (await call<{ docs: Doc<T>[] }>("list", { query: { c, ...(f as Record<string, string>) } })).docs,
  get: async <T>(c: string, id: string | number) => (await call<{ doc: Doc<T> | null }>("get", { query: { c, id: String(id) } })).doc,
  batch: async (ops: BatchOp[]) => (ops.length ? (await call<{ results: { c: string; id: string; rev?: number }[] }>("batch", { body: { ops } })).results : []),
  /** 住所 → 緯度・経度（見つからなければ null） */
  geocode: async (q: string) => (await call<{ result: { lat: number; lng: number; title: string } | null }>("geocode", { body: { q } })).result,
  generate: (prompt: string) => call<{ engine: "claude" | "none"; text?: string; warning?: string }>("generate", { body: { prompt } }),
};
