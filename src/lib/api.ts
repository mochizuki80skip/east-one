/**
 * PHP API（Xサーバー上の /api/index.php）との通信。
 * データは「種別(c) + ID + JSON」の文書として保存される。
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api/index.php";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export type Doc<T> = { id: string; data: T; updated_at: string };
export type BatchOp = { op: "put"; c: string; id?: string | number | null; data: object } | { op: "delete"; c: string; id: string | number };

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
    throw new ApiError(json.error ?? `エラー（${res.status}）`, res.status);
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
  batch: async (ops: BatchOp[]) => (ops.length ? (await call<{ results: { c: string; id: string }[] }>("batch", { body: { ops } })).results : []),
  generate: (prompt: string) => call<{ engine: "claude" | "none"; text?: string; warning?: string }>("generate", { body: { prompt } }),
};
