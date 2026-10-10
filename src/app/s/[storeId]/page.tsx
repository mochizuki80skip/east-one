import { redirect } from "next/navigation";
import { todayStr } from "@/lib/date";

export default async function StoreIndex({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  redirect(`/s/${storeId}/daily/${todayStr()}`);
}
