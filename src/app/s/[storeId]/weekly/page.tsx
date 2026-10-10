import Link from "next/link";
import { notFound } from "next/navigation";
import { getStore, listClients, listSlots } from "@/lib/repo";
import { careLevelGroup, OPEN_WEEKDAY_ORDER, SESSIONS, WEEKDAYS, type Session } from "@/lib/constants";
import { displayAge } from "@/lib/date";
import { Card, PageTitle, btnSecondary } from "@/components/ui";
import ClientImport from "@/components/ClientImport";

export default async function WeeklyPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const store = getStore(Number(storeId));
  if (!store) notFound();
  const clients = new Map(listClients(store.id).filter((c) => c.status === "利用中").map((c) => [c.id, c]));
  const slots = listSlots(store.id).filter((s) => clients.has(s.client_id));
  const listFor = (w: number, s: Session) =>
    slots
      .filter((x) => x.weekday === w && x.session === s)
      .map((x) => clients.get(x.client_id)!)
      .sort((a, b) => (a.kana || a.name).localeCompare(b.kana || b.name, "ja"));
  const cap = (s: Session) => (s === "am" ? store.capacity_am : store.capacity_pm);
  const total = slots.filter((x) => OPEN_WEEKDAY_ORDER.includes(x.weekday as (typeof OPEN_WEEKDAY_ORDER)[number])).length;
  const totalCap = (store.capacity_am + store.capacity_pm) * OPEN_WEEKDAY_ORDER.length;

  return (
    <div className="space-y-6">
      <PageTitle
        sub="利用中の方の曜日別の利用枠です。名前を押すと利用者の編集画面へ移ります。ここから日々のスケジュールの出席予定が作られます。"
        right={
          <Link href={`/s/${store.id}/clients/new`} className={btnSecondary}>
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
              for (const c of list) groups.set(careLevelGroup(c.care_level) || "未設定", (groups.get(careLevelGroup(c.care_level) || "未設定") ?? 0) + 1);
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
                        <Link href={`/s/${store.id}/clients/${c.id}?back=/s/${store.id}/weekly`} className="flex-1 truncate hover:underline">
                          {c.name}
                        </Link>
                        {c.new_flag && <span className="rounded bg-pink-100 px-1 text-pink-700">{c.new_flag.slice(0, 1)}</span>}
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
        <ClientImport storeId={store.id} />
      </Card>
    </div>
  );
}
