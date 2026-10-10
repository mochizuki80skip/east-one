import Anthropic from "@anthropic-ai/sdk";
import type { DailyNote } from "./repo";

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

const MODEL = "claude-opus-5";

const SYSTEM_PROMPT = `あなたは機能訓練型デイサービスの生活相談員・機能訓練指導員です。
ご家族やケアマネジャーに提出する「月次報告（今月のご様子）」の文章を作成します。

書き方のルール:
- 敬体（です・ます調）で、温かみがあり、かつ事実に基づいた簡潔な文章にする。
- 与えられた情報（日々の記録・キーワード）に書かれていない出来事や数値を創作しない。情報が少ない場合は、その範囲で無理なくまとめる。
- ケアマネジャー向けの月次報告書に、利用者ごとに数行ずつ並べて掲載する。身体機能の変化、機能訓練・整体での様子、ご本人の発言や生活面の様子を中心に書く。
- 全体で 100〜200 字程度。見出しや箇条書きは使わず、1 段落で書く。冒頭に利用者名は書かない（書式側で「〇〇様」と付く）。
- 医学的な診断や断定的な評価は避け、観察された様子として書く。
- 出力は本文のみ。前置きや説明文は付けない。`;

export function buildUserPrompt(input: ReportInput): string {
  const [y, m] = input.ym.split("-").map(Number);
  const present = input.notes.filter((n) => n.status === "present");
  const absent = input.notes.filter((n) => n.status === "absent");
  const lines: string[] = [];
  lines.push(`【対象】${input.clientName} 様（${input.careLevel || "介護度未設定"}）`);
  lines.push(`【対象月】${y}年${m}月`);
  lines.push(`【利用日数】出席 ${present.length} 日 / 欠席 ${absent.length} 日`);
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

/**
 * Claude で月次報告文を生成する。API キーが無い場合や失敗時はテンプレート生成にフォールバックする。
 */
export async function generateMonthlyReportText(input: ReportInput): Promise<ReportResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      text: templateReport(input),
      engine: "template",
      warning: "ANTHROPIC_API_KEY が未設定のため、簡易テンプレートで生成しました。",
    };
  }
  const client = new Anthropic();
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4096,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: buildUserPrompt(input) }],
    });
    if (response.stop_reason === "refusal") {
      return {
        text: templateReport(input),
        engine: "template",
        warning: "AI が生成を拒否したため、簡易テンプレートで生成しました。",
      };
    }
    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (!text) throw new Error("empty response");
    return { text, engine: "claude" };
  } catch (error) {
    let reason = "不明なエラー";
    if (error instanceof Anthropic.AuthenticationError) reason = "API キーが無効です";
    else if (error instanceof Anthropic.RateLimitError) reason = "API の利用制限に達しました。時間をおいて再試行してください";
    else if (error instanceof Anthropic.APIError) reason = `API エラー (${error.status}): ${error.message}`;
    else if (error instanceof Error) reason = error.message;
    return {
      text: templateReport(input),
      engine: "template",
      warning: `AI 生成に失敗したため簡易テンプレートで生成しました（${reason}）。`,
    };
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
