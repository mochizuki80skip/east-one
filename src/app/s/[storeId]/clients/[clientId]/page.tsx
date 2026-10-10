import { notFound } from "next/navigation";
import { getClient, getClientSlots, listCareManagers, listRoutes } from "@/lib/repo";
import { PageTitle } from "@/components/ui";
import ClientForm from "@/components/ClientForm";

export default async function EditClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string; clientId: string }>;
  searchParams: Promise<{ back?: string }>;
}) {
  const { storeId, clientId } = await params;
  const { back } = await searchParams;
  const sid = Number(storeId);
  const client = getClient(Number(clientId));
  if (!client || client.store_id !== sid) notFound();
  const safeBack = back && back.startsWith(`/s/${sid}/`) ? back : `/s/${sid}/clients`;
  return (
    <div>
      <PageTitle>{client.name} 様</PageTitle>
      <ClientForm
        storeId={sid}
        client={client}
        slots={getClientSlots(client.id)}
        careManagers={listCareManagers()}
        routes={listRoutes(sid)}
        back={safeBack}
      />
    </div>
  );
}
