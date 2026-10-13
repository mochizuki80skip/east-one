"use client";

import Link from "next/link";
import { buildHistories, getDaily, getStore, listClients, listRoutes, listStaff, listVehicles } from "@/lib/data";
import { addDays, formatDateJa } from "@/lib/date";
import { splitList } from "@/lib/constants";
import { links } from "@/lib/links";
import { Notice, PageTitle, btnSecondary } from "@/components/ui";
import DailyEditor from "@/components/DailyEditor";
import DateJump from "@/components/DateJump";
import { Loading } from "@/components/Loading";
import { useLoad } from "@/components/useLoad";
import { useQuery } from "@/components/useQuery";

export default function DailyView() {
  const { store: sid, date } = useQuery();
  const { data, error } = useLoad(async () => {
    const [store, staff, clients, routes, vehicles, detail, history] = await Promise.all([
      getStore(sid),
      listStaff({ storeId: sid, activeOnly: true }),
      listClients(sid, { includeEnded: true }),
      listRoutes(sid),
      listVehicles(sid),
      getDaily(sid, date),
      buildHistories(sid, date),
    ]);
    return { store, staff, clients, routes, vehicles, detail, history };
  }, [sid, date]);

  const nav = (
    <div className="no-print flex items-center gap-2">
      <Link href={links.daily(sid, addDays(date, -1))} className={btnSecondary}>
        ← 前日
      </Link>
      <DateJump storeId={sid} date={date} />
      <Link href={links.daily(sid, addDays(date, 1))} className={btnSecondary}>
        翌日 →
      </Link>
    </div>
  );
  if (!data) return <Loading error={error} />;
  const { store, staff, clients, routes, vehicles, detail, history } = data;
  if (!store) return <Notice>店舗が見つかりません。</Notice>;
  const routeName = new Map(routes.map((r) => [r.id, r.name]));
  const closed = splitList(store.closed_weekdays).map(Number).includes(new Date(`${date}T00:00:00`).getDay());

  return (
    <div>
      <PageTitle right={nav}>{formatDateJa(date)} のスケジュール</PageTitle>
      {closed && <Notice>この日は定休日です。</Notice>}
      <DailyEditor
        key={`${sid}-${date}`}
        initial={detail}
        planContext={{ store, staff, clients, vehicles, routes, history }}
        slots={{ am: splitList(store.am_slots), pm: splitList(store.pm_slots) }}
        staff={staff.map((s) => ({ id: s.id, name: s.name, role: s.role, skills: splitList(s.skills), patterns: splitList(s.patterns) }))}
        clients={clients.map((c) => ({
          id: c.id,
          name: c.name,
          care_level: c.care_level,
          status: c.status,
          uses_transport: !!c.uses_transport,
          needs_training: !!c.needs_training,
          route: c.route_id ? (routeName.get(c.route_id) ?? "") : "",
        }))}
        vehicles={vehicles
          .filter((v) => v.active)
          .map((v) => ({ id: v.id, name: v.name, capacity: v.capacity, driverIds: splitList(v.driver_ids).map(Number) }))}
      />
    </div>
  );
}
