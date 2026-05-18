import { filsToAed } from "@/lib/format/currency";
import type { SettlementTransfer } from "@/lib/money/bills";

export default function SettleUpPanel({
  settlements,
  userNameById,
}: {
  settlements: SettlementTransfer[];
  userNameById: Record<string, string>;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface">
      <header className="border-b border-border px-5 py-3">
        <h2 className="text-sm font-medium">This month's split</h2>
        <p className="text-xs text-muted">
          Derived from this month's expenses. Record payments from the overall balance above.
        </p>
      </header>
      {settlements.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted">No settlements needed for this month.</p>
      ) : (
        <ul className="divide-y divide-border">
          {settlements.map((s) => {
            const fromName = userNameById[s.fromUserId] ?? s.fromUserId;
            const toName = userNameById[s.toUserId] ?? s.toUserId;
            return (
              <li
                key={`${s.fromUserId}-${s.toUserId}`}
                className="flex items-center justify-between px-5 py-3"
              >
                <p className="text-sm">
                  <span className="font-medium">{fromName}</span>{" "}
                  <span className="text-muted">pays</span>{" "}
                  <span className="font-medium">{toName}</span>
                </p>
                <p className="font-semibold">{filsToAed(s.amount)}</p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
