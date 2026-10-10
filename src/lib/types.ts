import type { RunKind, Session } from "./constants";

export type Store = {
  id: number;
  name: string;
  display_name: string;
  phone: string;
  contact_name: string;
  capacity_am: number;
  capacity_pm: number;
  required_staff: number;
  min_nurse: number;
  min_trainer: number;
  closed_weekdays: string;
  am_slots: string;
  pm_slots: string;
  slot_capacity: number;
  sort_order: number;
};

export type Staff = {
  id: number;
  name: string;
  status: string;
  employment: string;
  role: string;
  skills: string;
  days_per_week: number;
  available_weekdays: string;
  note: string;
  sort_order: number;
  /** 所属店舗（カンマ区切りID） */
  store_ids: string;
};

export type CareManager = { id: number; name: string; office: string; phone: string; fax: string; note: string };

export type Vehicle = {
  id: number;
  store_id: number;
  name: string;
  capacity: number;
  sort_order: number;
  active: number;
  /** 運転可能スタッフ（カンマ区切りID、空なら運転できる全員） */
  driver_ids: string;
};

export type Route = {
  id: number;
  store_id: number;
  name: string;
  vehicle_id: number | null;
  morning_time: string;
  noon_time: string;
  evening_time: string;
  sort_order: number;
};

export type Client = {
  id: number;
  store_id: number;
  name: string;
  kana: string;
  care_level: string;
  gender: string;
  birth_date: string;
  age: number | null;
  care_manager_id: number | null;
  status: string;
  new_flag: string;
  start_date: string;
  route_id: number | null;
  route_order: number;
  uses_transport: number;
  needs_training: number;
  address: string;
  note: string;
};

export type ClientSlot = { client_id: number; weekday: number; session: Session };

export type DailyAttendance = {
  client_id: number;
  session: Session;
  status: "present" | "absent";
  reason: string;
  extra: number;
  note: string;
};

export type DailyRunRider = { client_id: number; direction: "pickup" | "dropoff"; seq: number };

export type DailyRun = {
  key: string;
  run: RunKind;
  vehicle_id: number | null;
  driver_id: number | null;
  escort_id: number | null;
  depart_time: string;
  riders: DailyRunRider[];
};

export type DailyTraining = { session: Session; client_id: number; slot_time: string; staff_id: number | null };

export type DailyDetail = {
  store_id: number;
  date: string;
  memo: string;
  saved: boolean;
  /** その日のシフト（店舗所属スタッフ）。保存時にシフト表へ反映する */
  shifts: { staff_id: number; code: string }[];
  attendance: DailyAttendance[];
  runs: DailyRun[];
  training: DailyTraining[];
};

export type MonthlyReport = {
  id: number;
  client_id: number;
  ym: string;
  keywords: string;
  body: string;
  updated_at: string;
};
