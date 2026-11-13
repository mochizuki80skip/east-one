"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { DailyNote } from "@/lib/data";
import { getMonthlyReport, saveMonthlyReport } from "@/lib/data";
import { ApiError } from "@/lib/api";
import type { MonthlyReport } from "@/lib/types";
import { generateMonthlyReportText } from "@/lib/report-text";
import { btnGreen, btnPrimary, btnSecondary, input, td, th } from "./ui";

type Props = {
  clientId: number;
  clientName: string;
  careLevel: string;
  ym: string;
  notes: DailyNote[];
  initialKeywords: string;
  initialBody: string;
  /** 画面を開いたときの版と最終保存日時 */
  initialRev: number;
  initialUpdatedAt: string;
  hasApiKey: boolean;
};

const hm = (s: string) => (s ? s.slice(5, 16).replace("-", "/") : "");

export default function MonthlyEditor({ clientId, clientName, careLevel, ym, notes, initialKeywords, initialBody, initialRev, initialUpdatedAt, hasApiKey }: Props) {
  const [keywords, setKeywords] = useState(initialKeywords);
  const [body, setBody] = useState(initialBody);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const [dirty, setDirty] = useState(false);
  /** この画面が持っている版（保存のたびに 1 増える） */
  const [rev, setRev] = useState(initialRev);
  const [savedAt, setSavedAt] = useState(initialUpdatedAt);
  /** 別のパソコン・端末で先に保存された内容（保存しようとして分かったとき） */
  const [conflict, setConflict] = useState<MonthlyReport | null>(null);
  /** 画面に戻ってきたときに分かった、別の端末での更新（まだ保存していないとき） */
  const [newer, setNewer] = useState<MonthlyReport | null>(null);
  const state = useRef({ rev, dirty });
  useEffect(() => {
    state.current = { rev, dirty };
  }, [rev, dirty]);

  const loadLatest = (r: MonthlyReport | null | undefined) => {
    setKeywords(r?.keywords ?? "");
    setBody(r?.body ?? "");
    setRev(r?.rev ?? 0);
    setSavedAt(r?.updated_at ?? "");
    setDirty(false);
    setConflict(null);
    setNewer(null);
  };

  // 別のタブ・アプリから戻ってきたとき、ほかの端末で保存されていないか確かめる
  useEffect(() => {
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      const latest = await getMonthlyReport(clientId, ym).catch(() => undefined);
      if (!latest || latest.rev === state.current.rev) return;
      if (!state.current.dirty) {
        loadLatest(latest);
        setMsg(`別のパソコン・端末で保存された内容（${hm(latest.updated_at)}）を読み込みました。`);
      } else setNewer(latest);
    };
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [clientId, ym]);

  // 保存していない変更があるときは、ページを離れる前に確認する
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const present = notes.filter((n) => n.status === "present");
  const absent = notes.filter((n) => n.status === "absent");

  const generate = () =>
    start(async () => {
      if (body && !window.confirm("今の本文を置き換えます。よろしいですか？")) return;
      setMsg(hasApiKey ? "AI が文章を作成しています…" : "簡易テンプレートで作成しています…");
      const r = await generateMonthlyReportText({ clientName, careLevel, ym, keywords, notes });
      if (!r.text.trim()) {
        setMsg("文章を作る材料がありません。左の「キーワード」を入れるか、日々のスケジュールで出欠と様子を入れて保存してください。");
        return;
      }
      setBody(r.text);
      setDirty(true);
      setMsg(r.warning ?? (r.engine === "claude" ? "AI で文章を作成しました。内容を確認・修正して保存してください。" : "作成しました。"));
    });

  /** 保存する。baseRev は「この版の上に保存する」という版（上書きを選んだときは相手の版） */
  const save = (baseRev = rev) =>
    start(async () => {
      try {
        const next = await saveMonthlyReport(clientId, ym, keywords, body, baseRev);
        setRev(next);
        setSavedAt(new Date().toISOString().slice(0, 19).replace("T", " "));
        setDirty(false);
        setConflict(null);
        setNewer(null);
        setMsg(`保存しました（${new Date().toLocaleTimeString("ja-JP")}）`);
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          // 別のパソコン・端末で先に保存されていた → 上書きせずに、どうするか選んでもらう
          setConflict((await getMonthlyReport(clientId, ym)) ?? null);
          setMsg("");
          return;
        }
        setMsg(`保存に失敗しました: ${(e as Error).message}`);
      }
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
          <button onClick={() => save()} disabled={pending || !dirty || !!conflict} className={btnGreen}>
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
          {savedAt && <span className="ml-auto text-xs text-slate-400">最終保存 {hm(savedAt)}</span>}
        </div>
        {newer && !conflict && (
          <div data-newer className="mt-3 flex flex-wrap items-center gap-2 rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
            <span>別のパソコン・端末で、この方の報告が保存されました（{hm(newer.updated_at)}）。このまま保存すると、どちらにするか確認が出ます。</span>
            <button onClick={() => loadLatest(newer)} className={`${btnSecondary} text-xs`}>
              向こうの内容を読み込む（こちらの変更は消えます）
            </button>
          </div>
        )}
        {conflict && (
          <div data-conflict className="mt-3 space-y-2 rounded border-2 border-red-300 bg-red-50 p-3 text-sm">
            <p className="font-bold text-red-800">
              別のパソコン・端末で、この方の報告が先に保存されていました（{hm(conflict.updated_at)}）。こちらの内容はまだ保存していません。
            </p>
            <p className="text-red-900">どちらの内容を残すか選んでください。必要なら、こちらの本文を「📋 コピー」してから選ぶと、あとで貼り付けて使えます。</p>
            <div className="rounded border bg-white p-2">
              <div className="mb-1 text-xs font-semibold text-slate-500">向こうで保存された本文</div>
              <div className="whitespace-pre-wrap text-slate-800">{conflict.body || "（空欄）"}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => loadLatest(conflict)} className={btnSecondary}>
                向こうの内容にする（こちらの変更は消えます）
              </button>
              <button onClick={() => save(conflict.rev)} disabled={pending} className={btnPrimary}>
                こちらの内容で上書き保存する
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
