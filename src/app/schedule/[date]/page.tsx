import Link from "next/link";
import { notFound } from "next/navigation";
import { getScheduleDetail, listClients, listCourses, listStaff } from "@/lib/repo";
import { addDays, formatDateJa, isValidDate } from "@/lib/date";
import { PageTitle, btnSecondary } from "@/components/ui";
import ScheduleEditor from "@/components/ScheduleEditor";
import DateJump from "@/components/DateJump";

export const dynamic = "force-dynamic";

export default async function SchedulePage({ params }: PageProps<"/schedule/[date]">) {
  const { date } = await params;
  if (!isValidDate(date)) notFound();
  const detail = getScheduleDetail(date);
  const staff = listStaff(true);
  const clients = listClients(true);
  const courses = listCourses(true);

  return (
    <div>
      <PageTitle
        right={
          <div className="no-print flex items-center gap-2">
            <Link href={`/schedule/${addDays(date, -1)}`} className={btnSecondary}>
              ← 前日
            </Link>
            <DateJump date={date} />
            <Link href={`/schedule/${addDays(date, 1)}`} className={btnSecondary}>
              翌日 →
            </Link>
          </div>
        }
      >
        {formatDateJa(date)} のスケジュール
      </PageTitle>
      {staff.length === 0 || clients.length === 0 ? (
        <p className="rounded border border-amber-300 bg-amber-50 p-4 text-sm">
          スタッフと利用者を先に登録してください（<Link href="/" className="underline">ホーム</Link>からサンプルデータも投入できます）。
        </p>
      ) : (
        <ScheduleEditor initial={detail} staff={staff} clients={clients} courses={courses} />
      )}
    </div>
  );
}
