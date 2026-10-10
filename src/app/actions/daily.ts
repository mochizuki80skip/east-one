"use server";

import { revalidatePath } from "next/cache";
import { autoPlanDaily } from "@/lib/daily-plan";
import { saveDaily } from "@/lib/repo";
import { isValidDate } from "@/lib/date";
import type { DailyDetail } from "@/lib/types";

export async function autoPlanAction(detail: DailyDetail) {
  if (!isValidDate(detail.date)) throw new Error("invalid date");
  return autoPlanDaily(detail);
}

export async function saveDailyAction(detail: DailyDetail) {
  if (!isValidDate(detail.date)) throw new Error("invalid date");
  saveDaily(detail);
  revalidatePath(`/s/${detail.store_id}`, "layout");
  return { savedAt: new Date().toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo" }) };
}
