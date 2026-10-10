"use client";

import { api } from "@/lib/api";
import { deleteCareManager, listCareManagers } from "@/lib/data";
import { submitCareManager } from "@/lib/forms";
import type { Client } from "@/lib/types";
import { PageTitle, btnDanger, btnPrimary, input, td, th } from "@/components/ui";
import { Loading } from "@/components/Loading";
import { useLoad } from "@/components/useLoad";

export default function CareManagersView() {
  const { data, error, reload } = useLoad(async () => {
    const [cms, clients] = await Promise.all([listCareManagers(), api.list<Client>("clients")]);
    const counts = new Map<number, number>();
    for (const { data: c } of clients) if (c.status !== "終了" && c.care_manager_id) counts.set(c.care_manager_id, (counts.get(c.care_manager_id) ?? 0) + 1);
    return { cms, counts };
  }, []);
  if (!data) return <Loading error={error} />;
  const { cms, counts } = data;
  const after = (fn: (fd: FormData) => Promise<unknown>) => async (fd: FormData) => {
    await fn(fd);
    reload();
  };

  return (
    <div>
      <PageTitle sub="利用者ごとの担当ケアマネは「利用者」の編集画面で設定します。月次報告はケアマネ単位でまとめて出力できます。">ケアマネジャー</PageTitle>
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
                <tr key={`${fid}-${c ? "" : cms.length}`} className={c ? "" : "bg-slate-50"}>
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
    </div>
  );
}
