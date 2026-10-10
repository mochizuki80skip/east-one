"use client";

import { getStore } from "@/lib/data";
import StoreNav from "./StoreNav";
import { useLoad } from "./useLoad";
import { useQuery } from "./useQuery";

export default function StoreHeader() {
  const { store } = useQuery();
  const { data } = useLoad(() => getStore(store), [store]);
  return (
    <div className="no-print mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-b pb-2">
      <span className="text-lg font-bold">{data?.name ?? "…"}</span>
      {store > 0 && <StoreNav storeId={store} />}
    </div>
  );
}
