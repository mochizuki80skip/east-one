"use client";

import { useRouter } from "next/navigation";

export default function DateJump({ date }: { date: string }) {
  const router = useRouter();
  return (
    <input
      type="date"
      defaultValue={date}
      className="rounded border px-2 py-1 text-sm bg-white"
      onChange={(e) => e.target.value && router.push(`/schedule/${e.target.value}`)}
    />
  );
}
