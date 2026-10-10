import Link from "next/link";
import { notFound } from "next/navigation";
import { getClient, getMonthlyReport, listCareManagers, listClientDailyNotes, listClients } from "@/lib/repo";
import { formatYmJa, isValidYm } from "@/lib/date";
import { PageTitle, btnSecondary } from "@/components/ui";
import MonthlyEditor from "@/components/MonthlyEditor";

export default async function MonthlyClientPage({ params }: { params: Promise<{ storeId: string; ym: string; clientId: string }> }) {
  const { storeId, ym, clientId } = await params;
  const sid = Number(storeId);
  if (!isValidYm(ym)) notFound();
  const client = getClient(Number(clientId));
  if (!client || client.store_id !== sid) notFound();
  const report = getMonthlyReport(client.id, ym);
  const cm = listCareManagers().find((c) => c.id === client.care_manager_id);
  // 同じケアマネの次の利用者へ移動できるように
  const siblings = listClients(sid).filter((c) => c.care_manager_id === client.care_manager_id);
  const idx = siblings.findIndex((c) => c.id === client.id);
  const next = siblings[idx + 1];
  const base = `/s/${sid}/monthly/${ym}`;

  return (
    <div>
      <PageTitle
        right={
          <div className="flex gap-2">
            <Link href={base} className={btnSecondary}>
              ← 一覧へ
            </Link>
            {next && (
              <Link href={`${base}/${next.id}`} className={btnSecondary}>
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
        clientId={client.id}
        ym={ym}
        notes={listClientDailyNotes(client.id, ym)}
        initialKeywords={report?.keywords ?? ""}
        initialBody={report?.body ?? ""}
        hasApiKey={!!process.env.ANTHROPIC_API_KEY}
      />
    </div>
  );
}
