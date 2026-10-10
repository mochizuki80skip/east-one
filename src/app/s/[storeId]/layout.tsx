import { notFound } from "next/navigation";
import { getStore } from "@/lib/repo";
import StoreNav from "@/components/StoreNav";
import { currentYm, todayStr } from "@/lib/date";

export const dynamic = "force-dynamic";

export default async function StoreLayout({ children, params }: { children: React.ReactNode; params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const store = getStore(Number(storeId));
  if (!store) notFound();
  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-b pb-2">
        <span className="text-lg font-bold">{store.name}</span>
        <StoreNav storeId={store.id} today={todayStr()} ym={currentYm()} />
      </div>
      {children}
    </div>
  );
}
