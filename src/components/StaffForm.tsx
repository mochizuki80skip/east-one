"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Staff, Store } from "@/lib/types";
import {
  CONTRACTS,
  DEFAULT_DAYS,
  DEFAULT_PATTERNS,
  EMPLOYMENT_TYPES,
  makeTimeRange,
  parseTimeRange,
  ROLES,
  SKILLS,
  STAFF_STATUSES,
  splitList,
  WEEKDAYS,
  type Contract,
} from "@/lib/constants";
import { deleteStaff } from "@/lib/data";
import { submitStaff } from "@/lib/forms";
import { links } from "@/lib/links";
import { Card, btnDanger, btnPrimary, btnSecondary, input, label } from "./ui";

type Pattern = { start: string; end: string };
const toPatterns = (codes: string[]): Pattern[] =>
  codes.map((c) => {
    const [start, end] = c.split("-");
    return { start: start.padStart(5, "0"), end: end.padStart(5, "0") };
  });
const fmt = (min: number) => `${Math.floor(min / 60)}時間${min % 60 ? `${min % 60}分` : ""}`;

export default function StaffForm({ staff, stores, defaultStoreId }: { staff?: Staff; stores: Store[]; defaultStoreId?: number }) {
  const router = useRouter();
  const skills = splitList(staff?.skills);
  const storeIds = staff ? splitList(staff.store_ids).map(Number) : defaultStoreId ? [defaultStoreId] : [];
  const days = splitList(staff?.available_weekdays ?? "1,2,3,4,5,6").map(Number);
  const initialContract = (CONTRACTS as readonly string[]).includes(staff?.contract ?? "") ? (staff!.contract as Contract) : "";
  const [contract, setContract] = useState<Contract | "">(initialContract);
  const [daysPerWeek, setDaysPerWeek] = useState(staff?.days_per_week ?? 5);
  const [patterns, setPatterns] = useState<Pattern[]>(() => toPatterns(splitList(staff?.patterns)));
  const codes = patterns.map((p) => makeTimeRange(p.start, p.end));
  const changeContract = (c: Contract | "") => {
    setContract(c);
    if (!c) return;
    // 新しく登録するときや、時間がまだ無いときは、雇用区分の初期値を入れる
    if (!staff || patterns.length === 0) {
      setPatterns(toPatterns(DEFAULT_PATTERNS[c]));
      setDaysPerWeek(DEFAULT_DAYS[c]);
    }
  };
  return (
    <Card>
      <form
        action={async (fd) => {
          await submitStaff(fd);
          router.push(links.staff());
        }}
        className="grid gap-4 md:grid-cols-3"
      >
        {staff && <input type="hidden" name="id" value={staff.id} />}
        <div>
          <label className={label}>名前</label>
          <input name="name" defaultValue={staff?.name} required className={`${input} w-full`} />
        </div>
        <div>
          <label className={label}>ステータス（雇用区分）</label>
          <select name="contract" value={contract} onChange={(e) => changeContract(e.target.value as Contract | "")} className={`${input} w-full`}>
            <option value="">未設定</option>
            {CONTRACTS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>並び順（シフト表の行順）</label>
          <input name="sort_order" type="number" defaultValue={staff?.sort_order ?? 0} className={`${input} w-24`} />
        </div>
        <div>
          <label className={label}>資格・役職</label>
          <select name="role" defaultValue={staff?.role ?? ""} className={`${input} w-full`}>
            <option value="">未設定</option>
            {ROLES.map((r) => (
              <option key={r}>{r}</option>
            ))}
            {staff?.role && !(ROLES as readonly string[]).includes(staff.role) && <option>{staff.role}</option>}
          </select>
        </div>
        <div>
          <label className={label}>勤務形態</label>
          <select name="employment" defaultValue={staff?.employment ?? "A"} className={`${input} w-full`}>
            {EMPLOYMENT_TYPES.map((e) => (
              <option key={e.code} value={e.code}>
                {e.code}：{e.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>週の勤務日数（シフト自動作成の目安）</label>
          <input
            name="days_per_week"
            type="number"
            min={0}
            max={7}
            value={daysPerWeek}
            onChange={(e) => setDaysPerWeek(Number(e.target.value))}
            className={`${input} w-24`}
          />
        </div>
        <div className="md:col-span-3 rounded border border-brand-200 bg-brand-50/50 p-3">
          <label className={label}>勤務時間のパターン（何時から何時まで）</label>
          <input type="hidden" name="patterns" value={codes.filter(Boolean).join(",")} />
          <div className="space-y-1">
            {patterns.map((p, i) => {
              const t = parseTimeRange(codes[i]);
              return (
                <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="w-20 text-xs text-slate-500">{i === 0 ? "いつもの時間" : `パターン${i + 1}`}</span>
                  <input
                    type="time"
                    step={300}
                    value={p.start}
                    onChange={(e) => setPatterns((ps) => ps.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))}
                    className={input}
                  />
                  <span>〜</span>
                  <input
                    type="time"
                    step={300}
                    value={p.end}
                    onChange={(e) => setPatterns((ps) => ps.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))}
                    className={input}
                  />
                  {t ? (
                    <span className="text-xs text-slate-500">{fmt(t.end - t.start)}</span>
                  ) : (
                    <span className="text-xs text-red-700">終了は開始より後にしてください</span>
                  )}
                  <button type="button" onClick={() => setPatterns((ps) => ps.filter((_, j) => j !== i))} className="text-xs text-red-600">
                    削除
                  </button>
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => setPatterns((ps) => [...ps, { start: "09:00", end: "13:30" }])} className={`${btnSecondary} text-xs`}>
              ＋ 時間を追加
            </button>
            {contract && (
              <button type="button" onClick={() => setPatterns(toPatterns(DEFAULT_PATTERNS[contract]))} className={`${btnSecondary} text-xs`}>
                {contract}の初期値に戻す（{DEFAULT_PATTERNS[contract].join("、")}）
              </button>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            1つ目の「いつもの時間」で、シフトの自動作成をします。登録した時間は、シフト表と日々のスケジュールで選べます。午前・午後のどちらに勤務しているかは、時間から自動で判断します。
          </p>
        </div>
        <div className="md:col-span-3">
          <label className={label}>できること（複数選択）</label>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {SKILLS.map((s) => (
              <label key={s}>
                <input type="checkbox" name="skills" value={s} defaultChecked={skills.includes(s)} /> {s}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-500">「運転」は送迎の運転担当、「整体」「個別機能訓練」は時間割の担当の候補になります。</p>
        </div>
        <div className="md:col-span-2">
          <label className={label}>勤務できる店舗</label>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {stores.map((s) => (
              <label key={s.id}>
                <input type="checkbox" name="store_ids" value={s.id} defaultChecked={storeIds.includes(s.id)} /> {s.name}
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className={label}>勤務できる曜日</label>
          <div className="flex flex-wrap gap-x-2 text-sm">
            {WEEKDAYS.map((w, i) => (
              <label key={i}>
                <input type="checkbox" name="available_weekdays" value={i} defaultChecked={days.includes(i)} />
                {w}
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className={label}>在籍状況</label>
          <select name="status" defaultValue={staff?.status ?? "在籍"} className={`${input} w-full`}>
            {STAFF_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">休職・退職にすると、シフトや日々のスケジュールに出なくなります。</p>
        </div>
        <div className="md:col-span-2">
          <label className={label}>メモ</label>
          <input name="note" defaultValue={staff?.note} className={`${input} w-full`} />
        </div>
        <div className="md:col-span-3 flex items-center gap-3">
          <button className={btnPrimary}>保存</button>
        </div>
      </form>
      {staff && (
        <div className="mt-4 border-t pt-3">
          <button
            className={btnDanger}
            onClick={async () => {
              if (!window.confirm(`${staff.name} を削除します。退職の場合は削除せず、ステータスを「退職」にしてください。削除しますか？`)) return;
              await deleteStaff(staff.id);
              router.push(links.staff());
            }}
          >
            削除
          </button>
        </div>
      )}
    </Card>
  );
}
