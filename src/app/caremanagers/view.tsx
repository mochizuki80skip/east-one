"use client";

import Link from "next/link";
import { api } from "@/lib/api";
import { deleteCareManager, listCareManagers, listStores } from "@/lib/data";
import { submitCareManager } from "@/lib/forms";
import { CM_EXPORT_HEADER, careManagerTable } from "@/lib/caremanager-import";
import { buildXlsx, downloadBytes, XLSX_TYPE } from "@/lib/xlsx";
import { todayStr } from "@/lib/date";
import type { Client } from "@/lib/types";
import { Card, PageTitle, btnDanger, btnPrimary, btnSecondary, input, td, th } from "@/components/ui";
import CareManagerImport from "@/components/CareManagerImport";
import { Loading } from "@/components/Loading";
import { useLoad } from "@/components/useLoad";

export default function CareManagersView() {
  const { data, error, reload } = useLoad(async () => {
    const [cms, clientDocs, stores] = await Promise.all([listCareManagers(), api.list<Client>("clients"), listStores()]);
    const clients = clientDocs.map((d) => d.data);
    const counts = new Map<number, number>();
    for (const c of clients) if (c.status !== "終了" && c.care_manager_id) counts.set(c.care_manager_id, (counts.get(c.care_manager_id) ?? 0) + 1);
    return { cms, counts, clients, stores, loadedAt: Date.now() };
  }, []);
  if (!data) return <Loading error={error} />;
  const { cms, counts, clients, stores, loadedAt } = data;
  const exportExcel = () => {
    const storeName = new Map(stores.map((s) => [s.id, s.name]));
    const rows = careManagerTable(cms, clients, (id) => storeName.get(id) ?? "", stores.length > 1);
    const bytes = buildXlsx("ケアマネ一覧", [[...CM_EXPORT_HEADER], ...rows], [32, 16, 15, 15, 12, 60, 24]);
    downloadBytes(bytes, `ケアマネ一覧_${todayStr().replace(/-/g, "")}.xlsx`, XLSX_TYPE);
  };
  const after = (fn: (fd: FormData) => Promise<unknown>) => async (fd: FormData) => {
    await fn(fd);
    reload();
  };

  return (
    <div>
      <PageTitle
        sub="利用者ごとの担当ケアマネは「利用者」の編集画面で設定します。月次報告はケアマネ単位でまとめて出力できます。"
        right={
          <div className="flex flex-wrap gap-2">
            <button onClick={exportExcel} disabled={cms.length === 0} className={btnSecondary}>
              📊 Excelで出力
            </button>
            <Link href="/caremanagers/print/" className={btnSecondary}>
              📄 PDF出力
            </Link>
          </div>
        }
      >
        ケアマネジャー
      </PageTitle>
      <div className="overflow-x-auto">
        <table className="w-full border bg-white">
          <thead>
            <tr>
              <th className={th}>事業所</th>
              <th className={th}>ケアマネ名</th>
              <th className={th}>電話</th>
              <th className={th}>FAX</th>
              <th className={th}>メモ</th>
              <th className={th}>担当利用者</th>
              <th className={th}></th>
            </tr>
          </thead>
          <tbody>
            {[...cms, null].map((c) => {
              const fid = c ? `cm-${c.id}` : "cm-new";
              return (
                <tr key={`${fid}-${loadedAt}`} className={c ? "" : "bg-slate-50"}>
                  <td className={td}>
                    <form action={after(submitCareManager)} id={fid} className="contents">
                      {c && <input type="hidden" name="id" value={c.id} />}
                    </form>
                    <input name="office" form={fid} defaultValue={c?.office} placeholder="例: ○○居宅介護支援事業所" className={`${input} w-56`} />
                  </td>
                  <td className={td}>
                    <input name="name" form={fid} defaultValue={c?.name} required placeholder="ケアマネ名" className={`${input} w-32`} />
                  </td>
                  <td className={td}>
                    <input name="phone" form={fid} defaultValue={c?.phone} className={`${input} w-32`} />
                  </td>
                  <td className={td}>
                    <input name="fax" form={fid} defaultValue={c?.fax} className={`${input} w-32`} />
                  </td>
                  <td className={td}>
                    <input name="note" form={fid} defaultValue={c?.note} className={`${input} w-40`} />
                  </td>
                  <td className={`${td} text-center`}>{c ? (counts.get(c.id) ?? 0) : ""}</td>
                  <td className={`${td} whitespace-nowrap`}>
                    <button form={fid} className={btnPrimary}>
                      {c ? "保存" : "追加"}
                    </button>
                    {c && (
                      <button
                        className={btnDanger}
                        onClick={async () => {
                          if (!window.confirm(`${c.name} を削除します。担当していた利用者は「未設定」になります。よろしいですか？`)) return;
                          await deleteCareManager(c.id);
                          reload();
                        }}
                      >
                        削除
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-6">
        <Card title="CSV・スプレッドシートから取り込む">
          <CareManagerImport onDone={reload} />
        </Card>
      </div>
    </div>
  );
}
