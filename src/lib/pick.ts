/** 候補の中からスコア最小のものを選ぶ（同点は配列の先頭を優先）。 */
export function pickBest<T>(candidates: T[], score: (c: T) => number): T | null {
  let best: T | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const c of candidates) {
    const s = score(c);
    if (s < bestScore) {
      bestScore = s;
      best = c;
    }
  }
  return best;
}

/** 前回と同じ担当を避けるための重み（負荷の差より常に優先） */
export const SAME_AS_LAST_PENALTY = 1000;
/** 当日の担当数の重み */
export const TODAY_LOAD_WEIGHT = 10;

export function inc<K>(m: Map<K, number>, k: K, by = 1) {
  m.set(k, (m.get(k) ?? 0) + by);
}

export function timeToMinutes(t: string): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(t.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : Number.POSITIVE_INFINITY;
}
