"use client";

import { getClient, listCareManagers, listRoutes } from "@/lib/data";
import { links } from "@/lib/links";
import { Notice, PageTitle } from "@/components/ui";
import ClientForm from "@/components/ClientForm";
import { Loading } from "@/components/Loading";
import { useLoad } from "@/components/useLoad";
import { useQuery } from "@/components/useQuery";

export default function EditClientView() {
  const { store: sid, id, back } = useQuery();
  const { data, error } = useLoad(async () => {
    const [client, careManagers, routes] = await Promise.all([id ? getClient(id) : Promise.resolve(undefined), listCareManagers(), listRoutes(sid)]);
    return { client, careManagers, routes };
  }, [sid, id]);
  if (!data) return <Loading error={error} />;
  const { client } = data;
  if (id && (!client || client.store_id !== sid)) return <Notice>利用者が見つかりません。</Notice>;
  const safeBack = back.startsWith("/store/") ? back : links.clients(sid);
  return (
    <div>
      <PageTitle>{client ? `${client.name} 様` : "利用者を追加"}</PageTitle>
      <ClientForm
        key={id}
        storeId={sid}
        client={client}
        slots={client ? client.slots.map((s) => ({ client_id: client.id, ...s })) : []}
        careManagers={data.careManagers}
        routes={data.routes}
        back={safeBack}
      />
    </div>
  );
}
