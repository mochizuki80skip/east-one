"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { listStaff, listStores, saveStaffSkills } from "@/lib/data";
import { SKILLS, splitList, suggestedSkills } from "@/lib/constants";
import { links } from "@/lib/links";
import type { Staff } from "@/lib/types";
import { Notice, PageTitle, btnGreen, btnPrimary, btnSecondary, td, th } from "@/components/ui";
import { Loading } from "@/components/Loading";
import { useLoad } from "@/components/useLoad";
import { useQuery } from "@/components/useQuery";

export default function StaffSkillsView() {
  const { store: storeId, id: newId } = useQuery();
  const [saved, setSaved] = useState("");
  const { data, error, reload } = useLoad(async () => {
    const [stores, staff] = await Promise.all([listStores(), listStaff({ storeId: storeId || undefined, activeOnly: true })]);
    return { stores, staff, loadedAt: Date.now() };
  }, [storeId]);
  if (!data) return <Loading error={error} />;
  const { stores, staff } = data;

  return (
    <div className="space-y-4">
      <PageTitle
        right={
          <Link href={links.staff(storeId || undefined)} className={btnSecondary}>
            ← スタッフ一覧
          </Link>
        }
        sub="スタッフごとに、できることにチェックを入れて「保存」を押してください。列の「全員」で、表示中の全員にまとめてチェックできます。整体・送迎・体操などの自動振り分けは、ここでチェックした人から選びます。"
      >
        できることの一括登録
      </PageTitle>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link href={links.staffSkills()} className={!storeId ? btnPrimary : btnSecondary}>
          全店舗
        </Link>
        {stores.map((s) => (
          <Link key={s.id} href={links.staffSkills(s.id)} className={storeId === s.id ? btnPrimary : btnSecondary}>
            {s.name}
          </Link>
        ))}
      </div>
      {saved && <Notice tone="blue">{saved}</Notice>}
      {staff.length === 0 ? (
        <Notice>在籍中のスタッフがいません。先にスタッフを追加してください。</Notice>
      ) : (
        <SkillMatrix
          key={data.loadedAt}
          staff={staff}
          newId={newId}
          onSaved={(m) => {
            setSaved(m);
            reload();
          }}
        />
      )}
    </div>
  );
}

type Checked = Record<number, string[]>;
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
/** チェックは常に SKILLS の並び順で持つ */
const ordered = (xs: Iterable<string>) => {
  const set = new Set(xs);
  return SKILLS.filter((k) => set.has(k)) as string[];
};

function SkillMatrix({ staff, newId, onSaved }: { staff: Staff[]; newId: number; onSaved: (msg: string) => void }) {
  const initial = useMemo<Checked>(() => Object.fromEntries(staff.map((s) => [s.id, ordered(splitList(s.skills))])), [staff]);
  const [checked, setChecked] = useState<Checked>(initial);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();

  const changedIds = staff.filter((s) => !sameSet(checked[s.id], initial[s.id])).map((s) => s.id);
  const dirty = changedIds.length > 0;

  // 保存していない変更があるときは、ページを離れる前に確認する
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // いま登録した人の行を見えるところへ
  useEffect(() => {
    if (newId) document.getElementById(`staff-${newId}`)?.scrollIntoView({ block: "center" });
  }, [newId]);

  const has = (id: number, k: string) => checked[id].includes(k);
  const setRow = (id: number, next: Iterable<string>) => {
    setChecked((p) => ({ ...p, [id]: ordered(next) }));
    setMsg("");
  };
  const toggle = (id: number, k: string) => setRow(id, has(id, k) ? checked[id].filter((x) => x !== k) : [...checked[id], k]);
  const setColumn = (k: string, on: boolean) => {
    setChecked((p) => Object.fromEntries(staff.map((s) => [s.id, ordered(on ? [...p[s.id], k] : p[s.id].filter((x) => x !== k))])));
    setMsg("");
  };
  const addSuggested = () => {
    setChecked((p) => Object.fromEntries(staff.map((s) => [s.id, ordered([...p[s.id], ...suggestedSkills(s.role)])])));
    setMsg("資格・役職から考えられるものにチェックを足しました（機能訓練指導員 → 整体・個別機能訓練、看護師 → 血圧測定、ドライバー → 運転）。確認して保存してください。");
  };

  const save = () =>
    start(async () => {
      try {
        await saveStaffSkills(changedIds.map((id) => ({ id, skills: checked[id] })));
        onSaved(`${changedIds.length}名のできることを保存しました（${new Date().toLocaleTimeString("ja-JP")}）。`);
      } catch (e) {
        setMsg(`保存に失敗しました: ${(e as Error).message}`);
      }
    });

  return (
    <div className="space-y-3">
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded border bg-white p-2 shadow-sm">
        <button onClick={save} disabled={pending || !dirty} className={btnGreen}>
          💾 保存{dirty ? `（${changedIds.length}名の変更）` : ""}
        </button>
        <button onClick={addSuggested} disabled={pending} className={btnSecondary} title="今のチェックは残したまま、足すだけです">
          ✨ 資格・役職からおすすめを入れる
        </button>
        <button onClick={() => setChecked(initial)} disabled={pending || !dirty} className={btnSecondary}>
          元に戻す
        </button>
        <span className="text-sm text-slate-600">
          {pending ? "保存中…" : msg}
          {dirty && !pending && !msg && <span className="text-amber-700">未保存の変更があります</span>}
        </span>
      </div>

      <div className="overflow-x-auto rounded border bg-white">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={th}>名前</th>
              <th className={th}>資格・役職</th>
              {SKILLS.map((k) => (
                <th key={k} className={`${th} text-center`}>
                  <div>{k}</div>
                  <div className="mt-1 flex justify-center gap-1 font-normal">
                    <button onClick={() => setColumn(k, true)} className="rounded border border-brand-300 bg-white px-1 text-[11px] text-brand-700 hover:bg-brand-50">
                      全員
                    </button>
                    <button onClick={() => setColumn(k, false)} className="rounded border border-slate-300 bg-white px-1 text-[11px] text-slate-600 hover:bg-slate-50">
                      外す
                    </button>
                  </div>
                </th>
              ))}
              <th className={`${th} text-center`}>この人</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => {
              const changed = changedIds.includes(s.id);
              return (
                <tr key={s.id} id={`staff-${s.id}`} className={changed ? "bg-amber-50" : s.id === newId ? "bg-brand-50" : ""}>
                  <td className={`${td} whitespace-nowrap`}>
                    <Link href={links.staffEdit(s.id)} className="font-medium text-brand-700 hover:underline">
                      {s.name}
                    </Link>
                    {s.id === newId && <span className="ml-1 rounded bg-brand-600 px-1 text-[11px] text-white">いま登録</span>}
                    {changed && <span className="ml-1 text-[11px] text-amber-700">変更あり</span>}
                  </td>
                  <td className={`${td} text-xs`}>{s.role}</td>
                  {SKILLS.map((k) => (
                    <td key={k} className={`${td} p-0 text-center`}>
                      <label className="flex h-9 cursor-pointer items-center justify-center hover:bg-brand-50">
                        <input type="checkbox" checked={has(s.id, k)} onChange={() => toggle(s.id, k)} className="h-5 w-5 accent-brand-600" aria-label={`${s.name} ${k}`} />
                      </label>
                    </td>
                  ))}
                  <td className={`${td} whitespace-nowrap text-center`}>
                    <button onClick={() => setRow(s.id, SKILLS)} className="mr-1 text-xs text-brand-700 underline">
                      全部
                    </button>
                    <button onClick={() => setRow(s.id, [])} className="text-xs text-slate-500 underline">
                      なし
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2} className={`${td} bg-slate-50 text-xs font-semibold`}>
                できる人数
              </td>
              {SKILLS.map((k) => {
                const n = staff.filter((s) => has(s.id, k)).length;
                return (
                  <td key={k} className={`${td} bg-slate-50 text-center text-xs ${n === 0 ? "font-bold text-red-600" : ""}`}>
                    {n}名
                  </td>
                );
              })}
              <td className={`${td} bg-slate-50`} />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        運転 → 送迎の運転者、整体・個別機能訓練 → 時間割の担当、体操・メディカルケアFIT → 体操等の担当、の自動振り分けに使います。0名の列は赤で表示します。
      </p>
    </div>
  );
}
