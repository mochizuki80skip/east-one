"use client";

import { useSearchParams } from "next/navigation";
import { currentYm, isValidDate, isValidYm, todayStr } from "@/lib/date";

export function useQuery() {
  const sp = useSearchParams();
  const num = (k: string) => {
    const n = Number(sp.get(k));
    return Number.isInteger(n) && n > 0 ? n : 0;
  };
  const date = sp.get("date") ?? "";
  const ym = sp.get("ym") ?? "";
  return {
    store: num("store"),
    id: num("id"),
    client: num("client"),
    cm: num("cm"),
    date: isValidDate(date) ? date : todayStr(),
    ym: isValidYm(ym) ? ym : currentYm(),
    all: sp.get("all") === "1",
    back: sp.get("back") ?? "",
  };
}
