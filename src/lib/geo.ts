/** 位置と距離（送迎の「近い順・遠い順」）。距離は直線距離の目安 */
export type Point = { lat: number; lng: number };

export const hasPoint = (p: { lat?: number | null; lng?: number | null } | undefined): p is Point =>
  !!p && typeof p.lat === "number" && typeof p.lng === "number" && Number.isFinite(p.lat) && Number.isFinite(p.lng);

/** 2 点間の直線距離（km） */
export function distanceKm(a: Point, b: Point): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * 店舗から近い順（"near"）・遠い順（"far"）に並べる。
 * 位置が分からない方は、元の順番のまま最後に回す。
 */
export function sortByDistance<T>(items: T[], pointOf: (x: T) => Point | null | undefined, origin: Point, order: "near" | "far"): T[] {
  const known = items.filter((x) => hasPoint(pointOf(x) ?? undefined));
  const unknown = items.filter((x) => !hasPoint(pointOf(x) ?? undefined));
  const d = (x: T) => distanceKm(origin, pointOf(x)!);
  known.sort((a, b) => (order === "near" ? d(a) - d(b) : d(b) - d(a)));
  return [...known, ...unknown];
}
