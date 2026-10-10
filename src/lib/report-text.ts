import { api } from "./api";
import type { DailyNote } from "./data";

export type ReportInput = {
  clientName: string;
  careLevel: string;
  ym: string; // YYYY-MM
  keywords: string; // 職員が入力した箇条書き・単語
  notes: DailyNote[];
};

export type ReportResult = {
  text: string;
  engine: "claude" | "template";
  warning?: string;
};

/** AI に渡す材料（文章の書き方のルールはサーバー側 report.php にある） */
export function buildUserPrompt(input: ReportInput): string {
  const [y, m] = input.ym.split("-").map(Number);
  const present = input.notes.filter((n) => n.status === "present");
  const absent = input.notes.filter((n) => n.status === "absent");
  const lines: string[] = [];
  lines.push(`【対象】${input.clientName} 様（${input.careLevel || "介護度未設定"}）`);
  lines.push(`【対象月】${y}年${m}月`);
  lines.push(`【利用回数】出席 ${present.length} 回 / お休み ${absent.length} 回`);
  const trainingDays = present.filter((n) => n.trainer).length;
  if (trainingDays > 0) lines.push(`【個別機能訓練・整体】${trainingDays} 回`);
  lines.push("");
  lines.push("【職員メモ（箇条書き・単語）】");
  lines.push(input.keywords.trim() || "（なし）");
  lines.push("");
  lines.push("【日々の記録】");
  const noted = input.notes.filter((n) => n.note.trim());
  if (noted.length === 0) lines.push("（記録なし）");
  for (const n of noted) {
    const d = new Date(`${n.date}T00:00:00`);
    lines.push(`- ${d.getMonth() + 1}/${d.getDate()}: ${n.note.trim()}`);
  }
  lines.push("");
  lines.push("上記をもとに月次報告の本文を作成してください。");
  return lines.join("\n");
}

/** サーバー（Claude）で作成し、使えない場合は簡易テンプレートで作る */
export async function generateMonthlyReportText(input: ReportInput): Promise<ReportResult> {
  try {
    const r = await api.generate(buildUserPrompt(input));
    if (r.engine === "claude" && r.text) return { text: r.text, engine: "claude" };
    return { text: templateReport(input), engine: "template", warning: r.warning };
  } catch (e) {
    return { text: templateReport(input), engine: "template", warning: `AI での作成に失敗したため簡易テンプレートで作成しました（${(e as Error).message}）。` };
  }
}

/** API を使わない簡易テンプレート生成（オフライン時の保険） */
export function templateReport(input: ReportInput): string {
  const m = Number(input.ym.split("-")[1]);
  const present = input.notes.filter((n) => n.status === "present").length;
  const absent = input.notes.filter((n) => n.status === "absent").length;
  const seitai = input.notes.filter((n) => n.status === "present" && n.trainer).length;
  const keywords = input.keywords
    .split(/\r?\n|、|,|・/)
    .map((s) => s.trim())
    .filter(Boolean);
  const noted = input.notes.filter((n) => n.note.trim());

  const paras: string[] = [];
  if (present > 0) paras.push(`${m}月は${present}回ご利用いただきました${absent > 0 ? `（お休み ${absent} 回）` : ""}。`);
  else if (absent > 0) paras.push(`${m}月はお休みが続きました（${absent} 回）。`);

  if (seitai > 0 || keywords.length > 0) {
    let p2 = "";
    if (seitai > 0) p2 += `個別機能訓練・整体を${seitai}回実施しました。`;
    if (keywords.length > 0) p2 += `${keywords.join("。").replace(/。+$/, "")}。`;
    paras.push(p2);
  }
  if (noted.length > 0) {
    const items = noted.slice(0, 5).map((n) => {
      const d = new Date(`${n.date}T00:00:00`);
      return `${d.getMonth() + 1}月${d.getDate()}日は${n.note.trim().replace(/。$/, "")}`;
    });
    paras.push(`${items.join("、")}、といったご様子でした。`);
  }
  return paras.join("");
}
