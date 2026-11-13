"use client";

import { useState, useTransition } from "react";
import { parseAddressBook } from "@/lib/address-book";
import { decodeText } from "@/lib/csv";
import { clientsToLocate, importAddresses, listClientsWithSlots, locateClients, type ClientWithSlots } from "@/lib/data";
import { hasPoint } from "@/lib/geo";
import { btnPrimary, btnSecondary, input } from "./ui";

/**
 * 住所録の取り込み（CSV ファイル・スプレッドシートからの貼り付け）と、住所から位置を調べる。
 * 位置は送迎の配車で「近い順・遠い順」に並べるときに使う。
 */
export default function AddressBookImport({ storeId, clients, onDone }: { storeId: number; clients: ClientWithSlots[]; onDone?: () => void }) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [progress, setProgress] = useState("");
  const [pending, start] = useTransition();
  const parsed = text.trim() ? parseAddressBook(text) : null;

  const withAddress = clients.filter((c) => c.address);
  const located = withAddress.filter((c) => hasPoint(c) && c.geo_address === c.address);
  const notFound = withAddress.filter((c) => c.geo_address === c.address && !hasPoint(c));
  const todo = clientsToLocate(clients);
  const noAddress = clients.filter((c) => c.uses_transport && !c.address);

  /** 位置がまだ分からない方の位置を調べる */
  const locate = async (targets: ClientWithSlots[]) => {
    if (targets.length === 0) return { located: 0, notFound: [] as string[] };
    setProgress(`住所から位置を調べています… 0 / ${targets.length}`);
    const r = await locateClients(targets, (d, t) => setProgress(`住所から位置を調べています… ${d} / ${t}`));
    setProgress("");
    return r;
  };

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap gap-3 rounded bg-slate-50 px-3 py-2">
        <span>住所あり {withAddress.length}名</span>
        <span className="text-emerald-700">📍 位置が分かる {located.length}名</span>
        {notFound.length > 0 && (
          <span className="text-amber-700" title={notFound.map((c) => `${c.name}: ${c.address}`).join("\n")}>
            位置が見つからない {notFound.length}名（{notFound.map((c) => c.name).join("・")}）
          </span>
        )}
        {noAddress.length > 0 && <span className="text-slate-500">送迎ありで住所が未登録 {noAddress.length}名</span>}
        {todo.length > 0 && (
          <button
            className={`${btnSecondary} text-xs`}
            disabled={pending}
            onClick={() =>
              start(async () => {
                try {
                  const r = await locate(todo);
                  setMsg({ text: `位置を調べました（分かった ${r.located}名${r.notFound.length ? ` / 見つからない ${r.notFound.length}名: ${r.notFound.join("・")}` : ""}）` });
                  onDone?.();
                } catch (e) {
                  setProgress("");
                  setMsg({ text: (e as Error).message, bad: true });
                }
              })
            }
          >
            📍 まだの {todo.length}名の位置を調べる
          </button>
        )}
      </div>
      <p className="text-slate-600">
        住所録をスプレッドシートからコピーして下に貼り付けるか、CSV ファイルを選んでください。1行目に「名前（利用者名）」「住所」の見出しがあれば列の順番は自由です（見出しが無いときは「名前・住所」の順）。「緯度」「経度」の列があればそのまま使います。
        名前が同じ利用者（空白・「様」は無視）の住所を登録し、住所から位置を調べます。位置は送迎の配車の「近い順・遠い順」に使います。
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-50">
          📁 CSV ファイルを選ぶ
          <input
            type="file"
            accept=".csv,.tsv,.txt,text/csv"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setText(decodeText(await f.arrayBuffer()));
              setFileName(f.name);
              setMsg(null);
              e.target.value = "";
            }}
          />
        </label>
        {fileName && <span className="text-slate-500">{fileName}</span>}
      </div>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setFileName("");
          setMsg(null);
        }}
        rows={4}
        className={`${input} w-full font-mono text-xs`}
        placeholder={"名前\t住所\n朝日 花子\t静岡県三島市〇〇町1-2-3"}
      />
      {parsed &&
        (parsed.hint ? (
          <p className="text-red-700">{parsed.hint}</p>
        ) : (
          <p className="text-slate-700">
            読み取り {parsed.list.length}名（{parsed.header ? "見出しの列名から読み取り" : "見出しなし: 名前・住所の順"}）　例: {parsed.list[0].name} / {parsed.list[0].address}
          </p>
        ))}
      <div className="flex flex-wrap items-center gap-3">
        <button
          className={btnPrimary}
          disabled={pending || !parsed || parsed.list.length === 0}
          onClick={() =>
            start(async () => {
              try {
                const r = await importAddresses(storeId, parsed!.list);
                const fresh = clientsToLocate(await listClientsWithSlots(storeId, { includeEnded: true }));
                const g = await locate(fresh);
                setMsg({
                  text:
                    `住所を登録しました（${r.matched}名）。位置が分かった ${g.located}名` +
                    (g.notFound.length ? ` / 見つからない ${g.notFound.length}名: ${g.notFound.join("・")}` : "") +
                    (r.unmatched.length ? `。利用者に同じ名前がいない ${r.unmatched.length}名: ${r.unmatched.join("・")}` : ""),
                  bad: r.unmatched.length > 0 || g.notFound.length > 0,
                });
                setText("");
                setFileName("");
                onDone?.();
              } catch (e) {
                setProgress("");
                setMsg({ text: `取り込みに失敗しました: ${(e as Error).message}`, bad: true });
                onDone?.();
              }
            })
          }
        >
          住所録を取り込む
        </button>
        {progress ? <span className="text-slate-600">{progress}</span> : msg && <span className={msg.bad ? "text-amber-800" : "text-slate-700"}>{msg.text}</span>}
      </div>
    </div>
  );
}
