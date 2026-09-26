import Link from "next/link";
import { notFound } from "next/navigation";
import { getClient, getMonthlyReport, listClientDailyNotes } from "@/lib/repo";
import { formatYmJa, isValidYm } from "@/lib/date";
import { PageTitle, btnSecondary } from "@/components/ui";
import MonthlyEditor from "@/components/MonthlyEditor";

export const dynamic = "force-dynamic";

export default async function MonthlyClientPage({ params }: PageProps<"/monthly/[clientId]/[ym]">) {
  const { clientId, ym } = await params;
  const id = Number(clientId);
  if (!Number.isInteger(id) || !isValidYm(ym)) notFound();
  const client = getClient(id);
  if (!client) notFound();
  const notes = listClientDailyNotes(id, ym);
  const report = getMonthlyReport(id, ym);

  return (
    <div>
      <PageTitle
        right={
          <Link href={`/monthly?ym=${ym}`} className={`${btnSecondary} no-print`}>
            ← 一覧へ
          </Link>
        }
      >
        {client.name} 様 {formatYmJa(ym)} 月次報告
      </PageTitle>
      <p className="text-sm text-slate-600 mb-4">
        {client.care_level || "介護度未設定"}
        {client.area && ` / ${client.area}`}
        {client.note && ` / ${client.note}`}
      </p>
      <MonthlyEditor
        clientId={id}
        ym={ym}
        notes={notes}
        initialKeywords={report?.keywords ?? ""}
        initialBody={report?.body ?? ""}
        hasApiKey={!!process.env.ANTHROPIC_API_KEY}
      />
    </div>
  );
}
