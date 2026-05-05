import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { listMonthBuckets } from "@/lib/money/reports";
import { filsToAed } from "@/lib/format/currency";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default async function HistoryPage() {
  const session = await requireUser();
  if (!session.roomId) redirect("/admin");

  const buckets = await listMonthBuckets(session.roomId);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">History</h1>
        <p className="text-sm text-muted">Past months by total spend.</p>
      </header>

      <section className="rounded-2xl border border-border bg-surface">
        {buckets.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">No expenses recorded yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {buckets.map((b) => (
              <li key={`${b.year}-${b.month}`}>
                <Link
                  href={`/expenses/month?y=${b.year}&m=${b.month}`}
                  className="flex items-center justify-between px-5 py-4 hover:bg-surface-muted"
                >
                  <div>
                    <p className="font-medium">
                      {MONTH_NAMES[b.month - 1]} {b.year}
                    </p>
                    <p className="text-xs text-muted">
                      {b.count} expense{b.count === 1 ? "" : "s"}
                    </p>
                  </div>
                  <p className="font-semibold">{filsToAed(b.total)}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
