"use server";

import { revalidatePath } from "next/cache";
import { deleteClient, deleteCourse, deleteStaff, upsertClient, upsertCourse, upsertStaff } from "@/lib/repo";
import { seedIfEmpty } from "@/lib/seed";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const int = (fd: FormData, k: string, dflt = 0) => {
  const v = Number(fd.get(k));
  return Number.isFinite(v) ? v : dflt;
};
const flag = (fd: FormData, k: string) => (fd.get(k) ? 1 : 0);
const optId = (fd: FormData, k: string) => {
  const v = str(fd, k);
  return v ? Number(v) : null;
};

export async function saveStaffAction(fd: FormData) {
  const name = str(fd, "name");
  if (!name) return;
  upsertStaff({
    id: optId(fd, "id") ?? undefined,
    name,
    can_drive: flag(fd, "can_drive"),
    can_seitai: flag(fd, "can_seitai"),
    active: flag(fd, "active"),
    sort_order: int(fd, "sort_order"),
  });
  revalidatePath("/staff");
}

export async function deleteStaffAction(fd: FormData) {
  const id = optId(fd, "id");
  if (id) deleteStaff(id);
  revalidatePath("/staff");
}

export async function saveCourseAction(fd: FormData) {
  const name = str(fd, "name");
  if (!name) return;
  const kind = str(fd, "kind") === "dropoff" ? "dropoff" : "pickup";
  upsertCourse({
    id: optId(fd, "id") ?? undefined,
    name,
    kind,
    slot: Math.max(1, int(fd, "slot", 1)),
    sort_order: int(fd, "sort_order"),
    active: flag(fd, "active"),
  });
  revalidatePath("/courses");
}

export async function deleteCourseAction(fd: FormData) {
  const id = optId(fd, "id");
  if (id) deleteCourse(id);
  revalidatePath("/courses");
}

export async function saveClientAction(fd: FormData) {
  const name = str(fd, "name");
  if (!name) return;
  const weekdays = fd
    .getAll("weekdays")
    .map((v) => Number(v))
    .filter((n) => n >= 0 && n <= 6)
    .sort()
    .join(",");
  upsertClient({
    id: optId(fd, "id") ?? undefined,
    name,
    care_level: str(fd, "care_level"),
    area: str(fd, "area"),
    needs_seitai: flag(fd, "needs_seitai"),
    pickup_course_id: optId(fd, "pickup_course_id"),
    dropoff_course_id: optId(fd, "dropoff_course_id"),
    default_weekdays: weekdays,
    active: flag(fd, "active"),
    note: str(fd, "note"),
  });
  revalidatePath("/clients");
}

export async function deleteClientAction(fd: FormData) {
  const id = optId(fd, "id");
  if (id) deleteClient(id);
  revalidatePath("/clients");
}

export async function seedAction() {
  seedIfEmpty();
  revalidatePath("/");
}
