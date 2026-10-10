"use client";

import { useRouter } from "next/navigation";
import { links } from "@/lib/links";

export default function DateJump({ storeId, date }: { storeId: number; date: string }) {
  const router = useRouter();
  return (
    <input
      key={date}
      type="date"
      defaultValue={date}
      className="rounded border bg-white px-2 py-1 text-sm"
      onChange={(e) => e.target.value && router.push(links.daily(storeId, e.target.value))}
    />
  );
}
