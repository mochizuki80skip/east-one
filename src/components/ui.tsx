import type { ReactNode } from "react";

export function PageTitle({ children, right, sub }: { children: ReactNode; right?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-brand-900">{children}</h1>
        {right}
      </div>
      {sub && <p className="mt-1 text-sm text-slate-600">{sub}</p>}
    </div>
  );
}

export function Card({ title, children, right }: { title?: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="rounded-lg border bg-white p-4 shadow-sm">
      {(title || right) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="border-l-4 border-brand-500 pl-2 font-bold">{title}</h2>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Notice({ children, tone = "amber" }: { children: ReactNode; tone?: "amber" | "red" | "blue" }) {
  const c = { amber: "border-amber-300 bg-amber-50", red: "border-red-300 bg-red-50", blue: "border-brand-200 bg-brand-50" }[tone];
  return <div className={`rounded border p-3 text-sm ${c}`}>{children}</div>;
}

export const btn = "inline-flex items-center gap-1 rounded px-3 py-1.5 text-sm font-medium disabled:opacity-50 whitespace-nowrap";
export const btnPrimary = `${btn} bg-brand-600 text-white hover:bg-brand-700`;
export const btnGreen = `${btn} bg-plum-700 text-white hover:bg-plum-800`;
export const btnSecondary = `${btn} bg-white border border-slate-300 hover:bg-slate-50`;
export const btnDanger = `${btn} text-red-700 hover:bg-red-50`;
export const input = "rounded border border-slate-300 px-2 py-1 text-sm bg-white";
export const label = "block text-xs font-semibold text-slate-600 mb-1";
export const th = "border px-2 py-1 text-left text-xs font-semibold bg-brand-50 text-brand-900 whitespace-nowrap";
export const td = "border px-2 py-1 text-sm";
