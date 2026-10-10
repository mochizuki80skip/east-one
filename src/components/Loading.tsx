export function Loading({ error }: { error?: string | null }) {
  if (error) return <p className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">読み込みに失敗しました: {error}</p>;
  return <p className="py-8 text-center text-sm text-slate-500">読み込み中…</p>;
}
