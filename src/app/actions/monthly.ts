"use server";

import { revalidatePath } from "next/cache";
import { getClient, listClientDailyNotes, saveMonthlyReport } from "@/lib/repo";
import { generateMonthlyReportText, type ReportResult } from "@/lib/report-text";
import { isValidYm } from "@/lib/date";

export async function generateReportAction(clientId: number, ym: string, keywords: string): Promise<ReportResult> {
  if (!isValidYm(ym)) throw new Error("invalid month");
  const client = getClient(clientId);
  if (!client) throw new Error("client not found");
  const notes = listClientDailyNotes(clientId, ym);
  return generateMonthlyReportText({ clientName: client.name, careLevel: client.care_level, ym, keywords, notes });
}

export async function saveReportAction(clientId: number, ym: string, keywords: string, body: string) {
  if (!isValidYm(ym)) throw new Error("invalid month");
  const client = getClient(clientId);
  if (!client) throw new Error("client not found");
  saveMonthlyReport(clientId, ym, keywords, body);
  revalidatePath(`/s/${client.store_id}/monthly/${ym}`, "layout");
  return { savedAt: new Date().toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo" }) };
}
