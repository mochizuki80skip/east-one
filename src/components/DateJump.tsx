"use client";

import { useRouter } from "next/navigation";

export default function DateJump({ base, date }: { base: string; date: string }) {
  const router = useRouter();
  return (
    <input
      type="date"
      defaultValue={date}
      className="rounded border bg-white px-2 py-1 text-sm"
      onChange={(e) => e.target.value && router.push(`${base}/${e.target.value}`)}
    />
  );
}
