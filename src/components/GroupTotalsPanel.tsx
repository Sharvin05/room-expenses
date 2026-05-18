import { filsToAed } from "@/lib/format/currency";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export type GroupTotalRow = {
  groupId: string | null;
  name: string;
  total: number;
  count: number;
};

export default function GroupTotalsPanel({
  year,
  month,
  groupTotals,
}: {
  year: number;
  month: number;
  groupTotals: GroupTotalRow[];
}) {
  const total = groupTotals.reduce((s, g) => s + g.total, 0);

  return (
    <section className="rounded-2xl border border-border bg-surface">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-5 py-3">
        <div>
          <h2 className="text-sm font-medium">
            Group totals · {MONTH_NAMES[month - 1] ?? ""} {year}
          </h2>
          <p className="text-xs text-muted">Spend by group across the room this month</p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-muted">Total</p>
          <p className="text-lg font-semibold">{filsToAed(total)}</p>
        </div>
      </header>
      {groupTotals.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted">No expenses this month.</p>
      ) : (
        <ul className="divide-y divide-border">
          {groupTotals.map((g) => (
            <li
              key={g.groupId ?? "__ungrouped__"}
              className="flex items-center justify-between px-5 py-3"
            >
              <div>
                <p className="font-medium">{g.name}</p>
                <p className="text-xs text-muted">
                  {g.count} expense{g.count === 1 ? "" : "s"}
                </p>
              </div>
              <p className="font-semibold">{filsToAed(g.total)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
