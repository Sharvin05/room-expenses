import Link from "next/link";
import { filsToAed } from "@/lib/format/currency";
import type { OverallBalance, UserTransferRow } from "@/lib/money/overall";

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export default function OverallSummaryPanel({
  balance,
  recentTransfers,
  userNameById,
  currentUserId,
}: {
  balance: OverallBalance;
  recentTransfers: UserTransferRow[];
  userNameById: Map<string, string>;
  currentUserId: string;
}) {
  const nameOf = (id: string) => userNameById.get(id) ?? id;

  return (
    <section className="rounded-2xl border border-border bg-surface">
      <header className="flex items-end justify-between border-b border-border px-5 py-3">
        <div>
          <h2 className="text-sm font-medium">Overall balance</h2>
          <p className="text-xs text-muted">Across all months</p>
        </div>
      </header>

      <div className="grid gap-px bg-border sm:grid-cols-2">
        <BalanceColumn
          label="You owe"
          total={balance.youOwe.total}
          rows={balance.youOwe.perCreditor}
          tone="negative"
          emptyText="You're all settled up."
          nameOf={nameOf}
        />
        <BalanceColumn
          label="You're owed"
          total={balance.owedToYou.total}
          rows={balance.owedToYou.perDebtor}
          tone="positive"
          emptyText="Nobody owes you right now."
          nameOf={nameOf}
        />
      </div>

      <div className="border-t border-border">
        <header className="flex items-center justify-between px-5 py-3">
          <h3 className="text-sm font-medium">Recent transactions</h3>
          <Link
            href="/transactions"
            className="text-xs text-muted underline-offset-4 hover:text-foreground hover:underline"
          >
            View all transactions →
          </Link>
        </header>
        {recentTransfers.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted">No payments recorded yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {recentTransfers.map((t) => {
              const isOutgoing = t.fromUserId === currentUserId;
              const counterpartId = isOutgoing ? t.toUserId : t.fromUserId;
              const date = t.resolvedAt ?? t.declaredAt;
              return (
                <li key={t.id} className="flex items-center justify-between px-5 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {isOutgoing
                        ? `You paid ${nameOf(counterpartId)}`
                        : `${nameOf(counterpartId)} paid you`}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {MONTH_SHORT[t.month - 1] ?? "—"} {t.year || ""} ·{" "}
                      {new Date(date).toLocaleDateString()}
                      {t.note ? ` · ${t.note}` : ""}
                    </p>
                  </div>
                  <p
                    className={`font-semibold ${isOutgoing ? "text-red-600" : "text-emerald-600"}`}
                  >
                    {isOutgoing ? "−" : "+"}
                    {filsToAed(t.amount)}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function BalanceColumn({
  label,
  total,
  rows,
  tone,
  emptyText,
  nameOf,
}: {
  label: string;
  total: number;
  rows: { userId: string; amount: number }[];
  tone: "positive" | "negative";
  emptyText: string;
  nameOf: (id: string) => string;
}) {
  const totalTone =
    total === 0
      ? "text-foreground"
      : tone === "positive"
        ? "text-emerald-600"
        : "text-red-600";

  return (
    <div className="bg-surface p-5">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${totalTone}`}>{filsToAed(total)}</p>
      {rows.length === 0 ? (
        <p className="mt-3 text-xs text-muted">{emptyText}</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {rows.map((r) => (
            <li key={r.userId} className="flex items-center justify-between py-2 text-sm">
              <span className="font-medium">{nameOf(r.userId)}</span>
              <span className="font-semibold">{filsToAed(r.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
