import type { ReactNode } from "react";

export function PageTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
      <h1 className="text-2xl font-bold">{children}</h1>
      {right}
    </div>
  );
}

export const btn = "rounded px-3 py-1.5 text-sm font-medium disabled:opacity-50";
export const btnPrimary = `${btn} bg-blue-600 text-white hover:bg-blue-700`;
export const btnSecondary = `${btn} bg-white border border-slate-300 hover:bg-slate-50`;
export const btnDanger = `${btn} text-red-700 hover:bg-red-50`;
export const input = "rounded border border-slate-300 px-2 py-1 text-sm bg-white";
export const th = "border px-2 py-1 text-left text-xs font-semibold bg-slate-100";
export const td = "border px-2 py-1 text-sm";
