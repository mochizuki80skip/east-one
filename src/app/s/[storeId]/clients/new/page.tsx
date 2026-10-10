import { listCareManagers, listRoutes } from "@/lib/repo";
import { PageTitle } from "@/components/ui";
import ClientForm from "@/components/ClientForm";

export default async function NewClientPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const sid = Number(storeId);
  return (
    <div>
      <PageTitle>利用者を追加</PageTitle>
      <ClientForm storeId={sid} slots={[]} careManagers={listCareManagers()} routes={listRoutes(sid)} back={`/s/${sid}/clients`} />
    </div>
  );
}
