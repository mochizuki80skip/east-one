"use client";

import Link from "next/link";
import { getStore, listClientsWithSlots } from "@/lib/data";
import { careLevelGroup, OPEN_WEEKDAY_ORDER, SESSIONS, WEEKDAYS, type Session } from "@/lib/constants";
import { displayAge } from "@/lib/date";
import { links } from "@/lib/links";
import { Card, Notice, PageTitle, btnSecondary } from "@/components/ui";
import ClientImport from "@/components/ClientImport";
import { Loading } from "@/components/Loading";
import { useLoad } from "@/components/useLoad";
import { useQuery } from "@/components/useQuery";

export default function WeeklyView() {
  const { store: sid } = useQuery();
  const { data, error, reload } = useLoad(async () => ({ store: await getStore(sid), clients: await listClientsWithSlots(sid) }), [sid]);
  if (!data) return <Loading error={error} />;
  const { store } = data;
  if (!store) return <Notice>店舗が見つかりません。</Notice>;
  const clients = data.clients.filter((c) => c.status === "利用中");
  const listFor = (w: number, s: Session) =>
    clients.filter((c) => c.slots.some((x) => x.weekday === w && x.session === s)).sort((a, b) => (a.kana || a.name).localeCompare(b.kana || b.name, "ja"));
  const cap = (s: Session) => (s === "am" ? store.capacity_am : store.capacity_pm);
  const total = clients.reduce((n, c) => n + c.slots.filter((s) => (OPEN_WEEKDAY_ORDER as readonly number[]).includes(s.weekday)).length, 0);
  const totalCap = (store.capacity_am + store.capacity_pm) * OPEN_WEEKDAY_ORDER.length;
  const back = links.weekly(sid);

  return (
    <div className="space-y-6">
      <PageTitle
        sub="利用中の方の曜日別の利用枠です。名前を押すと利用者の編集画面へ移ります。ここから日々のスケジュールの出席予定が作られます。"
        right={
          <Link href={links.clientEdit(sid, undefined, back)} className={btnSecondary}>
            ＋ 利用者を追加
          </Link>
        }
      >
        曜日別利用者枠表
      </PageTitle>
      {SESSIONS.map((sess) => (
        <Card key={sess.key} title={`${sess.label}（定員 ${cap(sess.key)} 名）`}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {OPEN_WEEKDAY_ORDER.map((w) => {
              const list = listFor(w, sess.key);
              const free = cap(sess.key) - list.length;
              const groups = new Map<string, number>();
              for (const c of list) {
                const g = careLevelGroup(c.care_level) || "未設定";
                groups.set(g, (groups.get(g) ?? 0) + 1);
              }
              return (
                <div key={w} className="rounded border">
                  <div className="flex items-center justify-between border-b bg-slate-100 px-2 py-1 text-sm font-semibold">
                    <span>{WEEKDAYS[w]}曜</span>
                    <span className={free < 0 ? "text-red-700" : free === 0 ? "text-slate-500" : "text-emerald-700"}>
                      {list.length}/{cap(sess.key)}　{free > 0 ? `空き${free}` : free === 0 ? "満員" : `超過${-free}`}
                    </span>
                  </div>
                  <ol className="divide-y text-xs">
                    {list.map((c, i) => (
                      <li key={c.id} className="flex items-center gap-1 px-2 py-0.5">
                        <span className="w-4 text-slate-400">{i + 1}</span>
                        <Link href={links.clientEdit(sid, c.id, back)} className="flex-1 truncate hover:underline">
                          {c.name}
                        </Link>
                        {c.new_flag && <span className="rounded bg-brand-100 px-1 text-brand-800">{c.new_flag.slice(0, 1)}</span>}
                        <span className="text-slate-500">{c.care_level.replace("要支援", "支").replace("要介護", "介").replace("事業対象者", "事対")}</span>
                        <span className="text-slate-500">{c.gender}</span>
                        <span className="w-5 text-right text-slate-500">{displayAge(c.birth_date, c.age) ?? ""}</span>
                      </li>
                    ))}
                  </ol>
                  <div className="border-t px-2 py-1 text-[11px] text-slate-500">
                    {[...groups].map(([g, n]) => `${g}${n}`).join(" ")}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ))}
      <p className="text-sm text-slate-600">
        週の登録枠 {total} / {totalCap}（稼働率 {totalCap ? Math.round((total / totalCap) * 100) : 0}%）
      </p>
      <Card title="曜日別出席リスト（スプレッドシート）から取り込む">
        <ClientImport storeId={sid} onDone={reload} />
      </Card>
    </div>
  );
}
