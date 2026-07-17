"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { monthToDate, monthStringFromDate } from "@/lib/dates";

function shiftMonth(month: string, delta: number): string {
  const d = monthToDate(month);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return monthStringFromDate(d);
}

export function MonthNav({ month, basePath }: { month: string; basePath: string }) {
  const router = useRouter();
  const prev = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);

  return (
    <div className="flex items-center gap-2">
      <Link href={`${basePath}?month=${prev}`} className="text-sm border rounded px-2 py-1">
        ‹ anterior
      </Link>
      <input
        type="month"
        defaultValue={month}
        onChange={(e) => {
          const value = e.target.value;
          if (value) router.push(`${basePath}?month=${value}`);
        }}
        className="border rounded px-2 py-1 text-sm"
      />
      <Link href={`${basePath}?month=${next}`} className="text-sm border rounded px-2 py-1">
        próximo ›
      </Link>
    </div>
  );
}
