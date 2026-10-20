/** 画面の URL（静的書き出しのため、店舗や日付はクエリで渡す） */
const q = (path: string, params: Record<string, string | number | undefined>) => {
  const p = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== "") as [string, string][]);
  return `${path}${p.size ? `?${p}` : ""}`;
};

export const links = {
  home: () => "/",
  staff: (store?: number, all?: boolean) => q("/staff/", { store, all: all ? 1 : undefined }),
  staffEdit: (id?: number) => q("/staff/edit/", { id }),
  /** できることの一括登録（id はいま登録した人。行を目立たせる） */
  staffSkills: (store?: number, id?: number) => q("/staff/skills/", { store, id }),
  careManagers: () => "/caremanagers/",
  daily: (store: number, date: string) => q("/store/daily/", { store, date }),
  dailyPrint: (store: number, date: string) => q("/store/daily/print/", { store, date }),
  shifts: (store: number, ym: string) => q("/store/shifts/", { store, ym }),
  weekly: (store: number) => q("/store/weekly/", { store }),
  clients: (store: number, all?: boolean) => q("/store/clients/", { store, all: all ? 1 : undefined }),
  clientEdit: (store: number, id?: number, back?: string) => q("/store/clients/edit/", { store, id, back }),
  monthly: (store: number, ym: string) => q("/store/monthly/", { store, ym }),
  monthlyEdit: (store: number, ym: string, client: number) => q("/store/monthly/edit/", { store, ym, client }),
  monthlyPrint: (store: number, ym: string, cm?: number) => q("/store/monthly/print/", { store, ym, cm }),
  settings: (store: number) => q("/store/settings/", { store }),
};
