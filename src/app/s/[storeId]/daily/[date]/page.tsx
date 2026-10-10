import Link from "next/link";
import { notFound } from "next/navigation";
import { getDaily, getStore, listClients, listRoutes, listStaff, listVehicles } from "@/lib/repo";
import { addDays, formatDateJa, isValidDate } from "@/lib/date";
import { splitList } from "@/lib/constants";
import { Notice, PageTitle, btnSecondary } from "@/components/ui";
import DailyEditor from "@/components/DailyEditor";
import DateJump from "@/components/DateJump";

export default async function DailyPage({ params }: { params: Promise<{ storeId: string; date: string }> }) {
  const { storeId, date } = await params;
  if (!isValidDate(date)) notFound();
  const store = getStore(Number(storeId));
  if (!store) notFound();
  const staff = listStaff({ storeId: store.id, activeOnly: true });
  const clients = listClients(store.id, { includeEnded: true });
  const routes = new Map(listRoutes(store.id).map((r) => [r.id, r.name]));
  const vehicles = listVehicles(store.id, true);
  const closed = splitList(store.closed_weekdays).map(Number).includes(new Date(`${date}T00:00:00`).getDay());

  return (
    <div>
      <PageTitle
        right={
          <div className="no-print flex items-center gap-2">
            <Link href={`/s/${store.id}/daily/${addDays(date, -1)}`} className={btnSecondary}>
              ← 前日
            </Link>
            <DateJump base={`/s/${store.id}/daily`} date={date} />
            <Link href={`/s/${store.id}/daily/${addDays(date, 1)}`} className={btnSecondary}>
              翌日 →
            </Link>
          </div>
        }
      >
        {formatDateJa(date)} のスケジュール
      </PageTitle>
      {closed && <Notice>この日は定休日です。</Notice>}
      <DailyEditor
        initial={getDaily(store.id, date)}
        slots={{ am: splitList(store.am_slots), pm: splitList(store.pm_slots) }}
        staff={staff.map((s) => ({ id: s.id, name: s.name, role: s.role, skills: splitList(s.skills) }))}
        clients={clients.map((c) => ({
          id: c.id,
          name: c.name,
          care_level: c.care_level,
          status: c.status,
          uses_transport: !!c.uses_transport,
          needs_training: !!c.needs_training,
          route: c.route_id ? (routes.get(c.route_id) ?? "") : "",
        }))}
        vehicles={vehicles.map((v) => ({ id: v.id, name: v.name, capacity: v.capacity, driverIds: splitList(v.driver_ids).map(Number) }))}
      />
    </div>
  );
}
