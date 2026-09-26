import { redirect } from "next/navigation";
import { todayStr } from "@/lib/date";

export const dynamic = "force-dynamic";

export default function ScheduleIndex() {
  redirect(`/schedule/${todayStr()}`);
}
