/**
 * 複数のパソコン・端末で同じ表（シフト表など）を直したときの合わせ方（3 方向マージ）。
 *  base   … この画面を開いた（前回保存した）ときの内容
 *  mine   … この画面でいま入っている内容
 *  theirs … サーバーにいま保存されている内容（別の端末の保存を含む）
 * この画面で変えたマスだけを theirs に重ねる。同じマスを両方で違う内容に変えていたら conflicts に入れる。
 */
export type CellMap = Record<string, string>;
export type CellConflict = { key: string; base: string; mine: string; theirs: string };

export function mergeCells(
  base: CellMap,
  mine: CellMap,
  theirs: CellMap,
  prefer?: "mine" | "theirs",
): { merged: CellMap; conflicts: CellConflict[]; fromOthers: number } {
  const v = (m: CellMap, k: string) => m[k] ?? "";
  const merged: CellMap = { ...theirs };
  const conflicts: CellConflict[] = [];
  for (const k of new Set([...Object.keys(base), ...Object.keys(mine)])) {
    const b = v(base, k);
    const m = v(mine, k);
    const t = v(theirs, k);
    if (m === b || m === t) continue; // この画面では変えていない／同じ内容に変えた
    if (t !== b && !prefer) {
      conflicts.push({ key: k, base: b, mine: m, theirs: t });
      continue;
    }
    if (t !== b && prefer === "theirs") continue;
    if (m) merged[k] = m;
    else delete merged[k];
  }
  // 別の端末で変わっていたマスの数（お知らせ用）
  const fromOthers = [...new Set([...Object.keys(base), ...Object.keys(theirs)])].filter((k) => v(base, k) !== v(theirs, k)).length;
  for (const k of Object.keys(merged)) if (!merged[k]) delete merged[k];
  return { merged, conflicts, fromOthers };
}
