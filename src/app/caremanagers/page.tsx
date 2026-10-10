import { listCareManagers } from "@/lib/repo";
import { getDb } from "@/lib/db";
import { PageTitle, btnDanger, btnPrimary, input, td, th } from "@/components/ui";
import { deleteCareManagerAction, saveCareManagerAction } from "../actions/masters";

export const dynamic = "force-dynamic";

export default function CareManagersPage() {
  const cms = listCareManagers();
  const counts = new Map(
    (getDb().prepare(`SELECT care_manager_id id, COUNT(*) n FROM clients WHERE status <> '終了' AND care_manager_id IS NOT NULL GROUP BY care_manager_id`).all() as {
      id: number;
      n: number;
    }[]).map((r) => [r.id, r.n]),
  );
  return (
    <div>
      <PageTitle sub="利用者ごとの担当ケアマネは「利用者」の編集画面で設定します。月次報告はケアマネ単位でまとめて出力できます。">
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
                <tr key={fid} className={c ? "" : "bg-slate-50"}>
                  <td className={td}>
                    <form action={saveCareManagerAction} id={fid} className="contents">
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
                      <form action={deleteCareManagerAction} className="inline">
                        <input type="hidden" name="id" value={c.id} />
                        <button className={btnDanger}>削除</button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
