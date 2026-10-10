import { notFound } from "next/navigation";
import { getStaff, listStores } from "@/lib/repo";
import { PageTitle } from "@/components/ui";
import StaffForm from "@/components/StaffForm";

export const dynamic = "force-dynamic";

export default async function EditStaffPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const staff = getStaff(Number(id));
  if (!staff) notFound();
  return (
    <div>
      <PageTitle>{staff.name}</PageTitle>
      <StaffForm staff={staff} stores={listStores()} />
    </div>
  );
}
