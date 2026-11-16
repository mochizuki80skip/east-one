"use client";

import Link from "next/link";
import { api } from "@/lib/api";
import { deleteCareManager, deleteOffice, listCareManagers, listOffices, listStores, migrateCareManagers } from "@/lib/data";
import { submitCareManager, submitOffice } from "@/lib/forms";
import { CM_EXPORT_HEADER, careManagerTable } from "@/lib/caremanager-import";
import { buildXlsx, downloadBytes, XLSX_TYPE } from "@/lib/xlsx";
import { todayStr } from "@/lib/date";
import type { Client, Office } from "@/lib/types";
import { Card, PageTitle, btnDanger, btnPrimary, btnSecondary, input, label, td, th } from "@/components/ui";
import CareManagerImport from "@/components/CareManagerImport";
import { Loading } from "@/components/Loading";
import { useLoad } from "@/components/useLoad";

export default function CareManagersView() {
  const { data, error, reload } = useLoad(async () => {
    // 以前の「1 行にケアマネ 1 人」のデータを「居宅 → ケアマネ」に移す（済んでいれば何もしない）
    await migrateCareManagers();
    const [offices, cms, clientDocs, stores] = await Promise.all([listOffices(), listCareManagers(), api.list<Client>("clients"), listStores()]);
    const clients = clientDocs.map((d) => d.data);
    const counts = new Map<number, number>();
    for (const c of clients) if (c.status !== "終了" && c.care_manager_id) counts.set(c.care_manager_id, (counts.get(c.care_manager_id) ?? 0) + 1);
    return { offices, cms, counts, clients, stores, loadedAt: Date.now() };
  }, []);
  if (!data) return <Loading error={error} />;
  const { offices, cms, counts, clients, stores, loadedAt } = data;
  const after = (fn: (fd: FormData) => Promise<unknown>) => async (fd: FormData) => {
    await fn(fd);
    reload();
  };
  const exportExcel = () => {
    const storeName = new Map(stores.map((s) => [s.id, s.name]));
    const rows = careManagerTable(offices, cms, clients, (id) => storeName.get(id) ?? "", stores.length > 1);
    const bytes = buildXlsx("ケアマネ一覧", [[...CM_EXPORT_HEADER], ...rows], [30, 15, 15, 14, 15, 12, 50, 24]);
    downloadBytes(bytes, `ケアマネ一覧_${todayStr().replace(/-/g, "")}.xlsx`, XLSX_TYPE);
  };

  return (
    <div className="space-y-5">
      <PageTitle
        sub="まず居宅（居宅介護支援事業所）を登録し、その中に所属のケアマネを追加します。利用者ごとの担当ケアマネは「利用者」の編集画面で選びます。"
        right={
          <div className="flex flex-wrap gap-2">
            <button onClick={exportExcel} disabled={cms.length === 0 && offices.length === 0} className={btnSecondary}>
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

      <Card title="＋ 居宅（事業所）を追加">
        <OfficeForm key={`new-${loadedAt}`} action={after(submitOffice)} />
      </Card>

      {offices.length === 0 && <p className="text-sm text-slate-500">居宅がまだありません。上で居宅を追加してから、所属のケアマネを登録してください。</p>}

      {offices.map((o) => {
        const members = cms.filter((c) => c.office_id === o.id);
        return (
          <section key={`${o.id}-${loadedAt}`} data-office={o.name} className="rounded-lg border bg-white">
            <div className="border-b bg-brand-50/60 p-3">
              <OfficeForm
                office={o}
                action={after(submitOffice)}
                onDelete={async () => {
                  if (members.length) return window.alert(`「${o.name}」には所属のケアマネが ${members.length} 名います。先にケアマネを削除してください。`);
                  if (!window.confirm(`居宅「${o.name}」を削除します。よろしいですか？`)) return;
                  await deleteOffice(o.id);
                  reload();
                }}
              />
            </div>
            <div className="overflow-x-auto p-3">
              <table className="w-full border">
                <thead>
                  <tr>
                    <th className={th}>ケアマネ名</th>
                    <th className={th}>直通・携帯（あれば）</th>
                    <th className={th}>メモ</th>
                    <th className={th}>担当利用者</th>
                    <th className={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {[...members, null].map((c) => {
                    const fid = c ? `cm-${c.id}` : `cm-new-${o.id}`;
                    return (
                      <tr key={fid} className={c ? "" : "bg-slate-50"}>
                        <td className={td}>
                          <form action={after(submitCareManager)} id={fid} className="contents">
                            {c && <input type="hidden" name="id" value={c.id} />}
                            <input type="hidden" name="office_id" value={o.id} />
                          </form>
                          <input name="name" form={fid} defaultValue={c?.name} required placeholder={c ? "" : "ケアマネ名を入れて追加"} className={`${input} w-40`} />
                        </td>
                        <td className={td}>
                          <input name="phone" form={fid} defaultValue={c?.phone} className={`${input} w-36`} />
                        </td>
                        <td className={td}>
                          <input name="note" form={fid} defaultValue={c?.note} className={`${input} w-48`} />
                        </td>
                        <td className={`${td} text-center`}>{c ? (counts.get(c.id) ?? 0) : ""}</td>
                        <td className={`${td} whitespace-nowrap`}>
                          <button form={fid} className={btnPrimary}>
                            {c ? "保存" : "＋ ケアマネを追加"}
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
          </section>
        );
      })}

      <Card title="CSV・スプレッドシートから取り込む">
        <CareManagerImport onDone={reload} />
      </Card>
    </div>
  );
}

/** 居宅の登録・編集（新規のときは office なし） */
function OfficeForm({ office, action, onDelete }: { office?: Office; action: (fd: FormData) => Promise<void>; onDelete?: () => void }) {
  return (
    <form action={action} className="grid items-end gap-2 md:grid-cols-[2fr_1fr_1fr_2fr_auto]">
      {office && <input type="hidden" name="id" value={office.id} />}
      <div>
        <label className={label}>居宅（事業所）名</label>
        <input name="name" defaultValue={office?.name} required placeholder="例: ○○居宅介護支援事業所" className={`${input} w-full ${office ? "font-bold" : ""}`} />
      </div>
      <div>
        <label className={label}>電話</label>
        <input name="phone" defaultValue={office?.phone} className={`${input} w-full`} />
      </div>
      <div>
        <label className={label}>FAX</label>
        <input name="fax" defaultValue={office?.fax} className={`${input} w-full`} />
      </div>
      <div>
        <label className={label}>住所・メモ</label>
        <div className="flex gap-1">
          <input name="address" defaultValue={office?.address} placeholder="住所" className={`${input} w-1/2`} />
          <input name="note" defaultValue={office?.note} placeholder="メモ" className={`${input} w-1/2`} />
        </div>
      </div>
      <div className="flex gap-1 whitespace-nowrap">
        <button className={btnPrimary}>{office ? "居宅を保存" : "＋ 居宅を追加"}</button>
        {onDelete && (
          <button type="button" onClick={onDelete} className={btnDanger}>
            削除
          </button>
        )}
      </div>
    </form>
  );
}
