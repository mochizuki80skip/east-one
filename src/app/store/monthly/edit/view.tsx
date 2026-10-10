"use client";

import Link from "next/link";
import { api } from "@/lib/api";
import { getClient, getMonthlyReport, listCareManagers, listClientDailyNotes, listClients, listStaff } from "@/lib/data";
import { formatYmJa } from "@/lib/date";
import { links } from "@/lib/links";
import { Notice, PageTitle, btnSecondary } from "@/components/ui";
import MonthlyEditor from "@/components/MonthlyEditor";
import { Loading } from "@/components/Loading";
import { useLoad } from "@/components/useLoad";
import { useQuery } from "@/components/useQuery";

export default function MonthlyEditView() {
  const { store: sid, ym, client: clientId } = useQuery();
  const { data, error } = useLoad(async () => {
    const client = await getClient(clientId);
    if (!client || client.store_id !== sid) return { client: undefined } as const;
    const [report, cms, siblings, staff, me] = await Promise.all([
      getMonthlyReport(client.id, ym),
      listCareManagers(),
      listClients(sid),
      listStaff({ storeId: sid }),
      api.me(),
    ]);
    const notes = await listClientDailyNotes(client, ym, staff);
    return { client, report, cm: cms.find((c) => c.id === client.care_manager_id), siblings: siblings.filter((c) => c.care_manager_id === client.care_manager_id), notes, ai: me.ai };
  }, [sid, ym, clientId]);
  if (!data) return <Loading error={error} />;
  if (!data.client) return <Notice>利用者が見つかりません。</Notice>;
  const { client, report, cm, siblings, notes, ai } = data;
  const next = siblings[siblings.findIndex((c) => c.id === client.id) + 1];

  return (
    <div>
      <PageTitle
        right={
          <div className="flex gap-2">
            <Link href={links.monthly(sid, ym)} className={btnSecondary}>
              ← 一覧へ
            </Link>
            {next && (
              <Link href={links.monthlyEdit(sid, ym, next.id)} className={btnSecondary}>
                次: {next.name} →
              </Link>
            )}
          </div>
        }
        sub={`${client.care_level || "介護度未設定"} / 担当ケアマネ: ${cm ? `${cm.office} ${cm.name}` : "未設定"}${client.note ? ` / ${client.note}` : ""}`}
      >
        {client.name} 様　{formatYmJa(ym)}
      </PageTitle>
      <MonthlyEditor
        key={`${client.id}-${ym}`}
        clientId={client.id}
        clientName={client.name}
        careLevel={client.care_level}
        ym={ym}
        notes={notes}
        initialKeywords={report?.keywords ?? ""}
        initialBody={report?.body ?? ""}
        hasApiKey={ai}
      />
    </div>
  );
}
