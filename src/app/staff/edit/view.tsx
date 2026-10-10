"use client";

import { getStaff, listStores } from "@/lib/data";
import { Notice, PageTitle } from "@/components/ui";
import StaffForm from "@/components/StaffForm";
import { Loading } from "@/components/Loading";
import { useLoad } from "@/components/useLoad";
import { useQuery } from "@/components/useQuery";

export default function EditStaffView() {
  const { id } = useQuery();
  const { data, error } = useLoad(async () => ({ stores: await listStores(), staff: id ? await getStaff(id) : undefined }), [id]);
  if (!data) return <Loading error={error} />;
  if (id && !data.staff) return <Notice>スタッフが見つかりません。</Notice>;
  return (
    <div>
      <PageTitle>{data.staff ? data.staff.name : "スタッフを追加"}</PageTitle>
      <StaffForm key={id} staff={data.staff} stores={data.stores} defaultStoreId={data.stores[0]?.id} />
    </div>
  );
}
