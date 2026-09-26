export type Staff = {
  id: number;
  name: string;
  can_drive: number;
  can_seitai: number;
  active: number;
  sort_order: number;
};

export type CourseKind = "pickup" | "dropoff";

export type Course = {
  id: number;
  name: string;
  kind: CourseKind;
  slot: number;
  sort_order: number;
  active: number;
};

export type Client = {
  id: number;
  name: string;
  care_level: string;
  area: string;
  needs_seitai: number;
  pickup_course_id: number | null;
  dropoff_course_id: number | null;
  default_weekdays: string; // "1,3,5" (0=日 ... 6=土)
  active: number;
  note: string;
};

export type Schedule = {
  id: number;
  date: string; // YYYY-MM-DD
  memo: string;
  updated_at: string;
};

export type ScheduleCourse = {
  course_id: number;
  staff_id: number | null;
};

export type ScheduleClient = {
  client_id: number;
  status: "present" | "absent";
  pickup_course_id: number | null;
  dropoff_course_id: number | null;
  seitai: number;
  seitai_staff_id: number | null;
  note: string;
};

export type ScheduleDetail = {
  date: string;
  memo: string;
  saved: boolean;
  staffIds: number[];
  courses: ScheduleCourse[];
  clients: ScheduleClient[];
};

export type MonthlyReport = {
  id: number;
  client_id: number;
  ym: string; // YYYY-MM
  keywords: string;
  body: string;
  updated_at: string;
};

export const CARE_LEVELS = [
  "要支援1",
  "要支援2",
  "要介護1",
  "要介護2",
  "要介護3",
  "要介護4",
  "要介護5",
  "事業対象者",
] as const;

export const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"] as const;
