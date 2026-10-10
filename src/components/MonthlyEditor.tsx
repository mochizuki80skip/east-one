"use client";

import { useState, useTransition } from "react";
import type { DailyNote } from "@/lib/repo";
import { generateReportAction, saveReportAction } from "@/app/actions/monthly";
import { btnGreen, btnPrimary, btnSecondary, input, td, th } from "./ui";

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
      if (body && !window.confirm("今の本文を置き換えます。よろしいですか？")) return;
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

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="space-y-4">
        <div className="rounded border bg-white p-4">
          <h2 className="mb-2 font-bold">
            日々の記録 <span className="text-sm font-normal text-slate-500">利用 {present.length} 回 / お休み {absent.length} 回</span>
          </h2>
          {notes.length === 0 ? (
            <p className="text-sm text-slate-500">この月の記録がまだありません。日々のスケジュールで出欠と「今日の様子」を入れて保存すると、ここに集まります。</p>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full border">
                <thead>
                  <tr>
                    <th className={th}>日付</th>
                    <th className={th}>出欠</th>
                    <th className={th}>担当</th>
                    <th className={th}>様子</th>
                  </tr>
                </thead>
                <tbody>
                  {notes.map((n) => (
                    <tr key={`${n.date}${n.session}`} className={n.status === "absent" ? "text-slate-400" : ""}>
                      <td className={`${td} whitespace-nowrap`}>
                        {n.date.slice(5).replace("-", "/")} {n.session === "am" ? "前" : "後"}
                      </td>
                      <td className={td}>{n.status === "present" ? "出席" : `休（${n.reason}）`}</td>
                      <td className={td}>{n.trainer ?? ""}</td>
                      <td className={td}>{n.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded border bg-white p-4">
          <h2 className="mb-2 font-bold">キーワード・箇条書き</h2>
          <p className="mb-2 text-xs text-slate-500">
            単語や短い箇条書きでOKです。例:「身体機能に大きな変化なし」「ペダル漕ぎ24分」「帰宅時も疲れなく歩けた」「半日なら横にならなくても大丈夫と本人」
          </p>
          <textarea
            value={keywords}
            onChange={(e) => {
              setKeywords(e.target.value);
              setDirty(true);
            }}
            rows={7}
            className={`${input} w-full`}
            placeholder={"身体機能に大きな変化なし\nペダル漕ぎ24分\n帰宅時も疲れなく歩けた"}
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={generate} disabled={pending} className={btnPrimary}>
              ✨ 文章を作成する
            </button>
            {!hasApiKey && <span className="text-xs text-amber-700">AI のキーが未設定のため、簡易テンプレートで作成します</span>}
          </div>
        </div>
      </section>

      <section className="rounded border bg-white p-4">
        <h2 className="mb-2 font-bold">報告文（ケアマネへの月次報告に載る文章）</h2>
        <textarea
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            setDirty(true);
          }}
          rows={12}
          className={`${input} w-full leading-relaxed`}
          placeholder="「文章を作成する」を押すか、直接入力してください。"
        />
        <div className="mt-1 text-right text-xs text-slate-500">{body.length} 文字（目安 100〜200 字）</div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button onClick={save} disabled={pending || !dirty} className={btnGreen}>
            💾 保存
          </button>
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(body);
              setMsg("本文をコピーしました。");
            }}
            disabled={!body}
            className={btnSecondary}
          >
            📋 コピー
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
