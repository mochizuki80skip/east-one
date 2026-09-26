"use client";

import { useState, useTransition } from "react";
import type { DailyNote } from "@/lib/repo";
import { generateReportAction, saveReportAction } from "@/app/actions/monthly";
import { btnPrimary, btnSecondary, input, td, th } from "./ui";

type Props = {
  clientId: number;
  ym: string;
  notes: DailyNote[];
  initialKeywords: string;
  initialBody: string;
  hasApiKey: boolean;
};

export default function MonthlyEditor({ clientId, ym, notes, initialKeywords, initialBody, hasApiKey }: Props) {
  const [keywords, setKeywords] = useState(initialKeywords);
  const [body, setBody] = useState(initialBody);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const [dirty, setDirty] = useState(false);

  const present = notes.filter((n) => n.status === "present");
  const absent = notes.filter((n) => n.status === "absent");

  const generate = () =>
    start(async () => {
      setMsg(hasApiKey ? "AI が文章を作成しています…" : "簡易テンプレートで作成しています…");
      const r = await generateReportAction(clientId, ym, keywords);
      setBody(r.text);
      setDirty(true);
      setMsg(r.warning ?? (r.engine === "claude" ? "AI で文章を作成しました。内容を確認・修正して保存してください。" : "作成しました。"));
    });

  const save = () =>
    start(async () => {
      const r = await saveReportAction(clientId, ym, keywords, body);
      setDirty(false);
      setMsg(`保存しました（${r.savedAt}）`);
    });

  const copy = async () => {
    await navigator.clipboard.writeText(body);
    setMsg("本文をコピーしました。");
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="space-y-4">
        <div className="rounded border bg-white p-4">
          <h2 className="font-bold mb-2">
            日々の記録 <span className="text-sm font-normal text-slate-500">出席 {present.length} 日 / お休み {absent.length} 日</span>
          </h2>
          {notes.length === 0 ? (
            <p className="text-sm text-slate-500">この月のスケジュールがまだ保存されていません。日々のスケジュール画面で「今日の様子メモ」を入力すると、ここに集まります。</p>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full border">
                <thead>
                  <tr>
                    <th className={th}>日付</th>
                    <th className={th}>出欠</th>
                    <th className={th}>整体</th>
                    <th className={th}>メモ</th>
                  </tr>
                </thead>
                <tbody>
                  {notes.map((n) => (
                    <tr key={n.date} className={n.status === "absent" ? "text-slate-400" : ""}>
                      <td className={`${td} whitespace-nowrap`}>{n.date.slice(5).replace("-", "/")}</td>
                      <td className={td}>{n.status === "present" ? "出席" : "休"}</td>
                      <td className={td}>{n.seitai_staff_name ?? ""}</td>
                      <td className={td}>{n.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded border bg-white p-4">
          <h2 className="font-bold mb-2">キーワード・箇条書き</h2>
          <p className="text-xs text-slate-500 mb-2">単語や短い箇条書きで OK。例: 「歩行が安定」「レクに積極的」「膝の痛みが減った」「来月は立ち上がり訓練を増やす」</p>
          <textarea
            value={keywords}
            onChange={(e) => {
              setKeywords(e.target.value);
              setDirty(true);
            }}
            rows={8}
            className={`${input} w-full`}
            placeholder={"歩行安定\n笑顔が増えた\n体操に意欲的"}
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={generate} disabled={pending} className={btnPrimary}>
              ✨ 文章を生成する
            </button>
            {!hasApiKey && <span className="text-xs text-amber-700">ANTHROPIC_API_KEY 未設定のため簡易テンプレート生成になります</span>}
          </div>
        </div>
      </section>

      <section className="rounded border bg-white p-4">
        <h2 className="font-bold mb-2">月次報告 本文</h2>
        <textarea
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            setDirty(true);
          }}
          rows={18}
          className={`${input} w-full leading-relaxed`}
          placeholder="「文章を生成する」を押すか、直接入力してください。"
        />
        <div className="mt-1 text-right text-xs text-slate-500">{body.length} 文字</div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button onClick={save} disabled={pending || !dirty} className={`${btnPrimary} bg-emerald-600 hover:bg-emerald-700`}>
            💾 保存
          </button>
          <button onClick={copy} disabled={!body} className={btnSecondary}>
            📋 本文をコピー
          </button>
          <button onClick={() => window.print()} className={btnSecondary}>
            🖨 印刷
          </button>
          <span className="text-sm text-slate-600">
            {pending ? "処理中…" : msg}
            {dirty && !pending && <span className="ml-2 text-amber-700">未保存</span>}
          </span>
        </div>
      </section>
    </div>
  );
}
