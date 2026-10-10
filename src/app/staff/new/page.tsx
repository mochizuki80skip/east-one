import { listStores } from "@/lib/repo";
import { PageTitle } from "@/components/ui";
import StaffForm from "@/components/StaffForm";

export const dynamic = "force-dynamic";

export default function NewStaffPage() {
  const stores = listStores();
  return (
    <div>
      <PageTitle>スタッフを追加</PageTitle>
      <StaffForm stores={stores} defaultStoreId={stores[0]?.id} />
    </div>
  );
}
