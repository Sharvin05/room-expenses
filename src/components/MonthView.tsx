import Link from "next/link";
import { filsToAed } from "@/lib/format/currency";
import type { PerPayerRow, PerUserShareRow, PersonalSummary, RawExpense } from "@/lib/money/reports";
import type { SettlementRow } from "@/lib/money/bills";
import SettleUpPanel from "@/components/SettleUpPanel";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function MonthView({
  year,
  month,
  expenses,
  userNameById,
  groupNameById,
  personalSummary,
  prevMonth,
  nextMonth,
  perPayer,
  perShare,
  billId,
  settlementRows,
  currentUserId,
}: {
  year: number;
  month: number;
  expenses: RawExpense[];
  userNameById: Map<string, string>;
  groupNameById: Map<string, string>;
  personalSummary: PersonalSummary;
  prevMonth: { y: number; m: number };
  nextMonth: { y: number; m: number } | null;
  perPayer: PerPayerRow[];
  perShare: PerUserShareRow[];
  billId: string;
  settlementRows: SettlementRow[];
  currentUserId: string;
}) {
  const userNameRecord = Object.fromEntries(userNameById);
  const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`;
  const total = expenses.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{monthLabel}</h1>
          <p className="text-sm text-muted">
            {expenses.length} expense{expenses.length === 1 ? "" : "s"} · total{" "}
            <span className="font-semibold text-foreground">{filsToAed(total)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard?y=${prevMonth.y}&m=${prevMonth.m}`}
            className="rounded-md border border-border bg-surface-muted px-3 py-1.5 text-sm hover:bg-border"
          >
            ← Prev
          </Link>
          {nextMonth ? (
            <Link
              href={`/dashboard?y=${nextMonth.y}&m=${nextMonth.m}`}
              className="rounded-md border border-border bg-surface-muted px-3 py-1.5 text-sm hover:bg-border"
            >
              Next →
            </Link>
          ) : null}
          <Link
            href="/expenses/new"
            className="rounded-md bg-primary text-primary-foreground hover:opacity-90 px-4 py-2 text-sm font-medium"
          >
            + Add expense
          </Link>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <Card label="You spent" value={filsToAed(personalSummary.spent)} hint="paid out of pocket" />
        <Card label="Your share" value={filsToAed(personalSummary.share)} hint="of all expenses you're in" />
        <Card
          label="Net"
          value={filsToAed(personalSummary.net)}
          hint={personalSummary.net > 0 ? "owed to you" : personalSummary.net < 0 ? "you owe" : "settled"}
          accent={personalSummary.net > 0 ? "positive" : personalSummary.net < 0 ? "negative" : undefined}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface">
          <header className="border-b border-border px-5 py-3 text-sm font-medium">Paid by</header>
          {perPayer.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted">No expenses yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {perPayer.map((row) => (
                <li key={row.payerId} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="font-medium">{userNameById.get(row.payerId) ?? row.payerId}</p>
                    <p className="text-xs text-muted">
                      {row.count} expense{row.count === 1 ? "" : "s"}
                    </p>
                  </div>
                  <p className="font-semibold">{filsToAed(row.total)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-surface">
          <header className="border-b border-border px-5 py-3 text-sm font-medium">
            Share owed (split)
          </header>
          {perShare.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted">No expenses yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {perShare.map((row) => (
                <li key={row.userId} className="flex items-center justify-between px-5 py-3">
                  <p className="font-medium">{userNameById.get(row.userId) ?? row.userId}</p>
                  <p className="font-semibold">{filsToAed(row.share)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <SettleUpPanel
        billId={billId}
        rows={settlementRows}
        currentUserId={currentUserId}
        userNameById={userNameRecord}
      />

      <section className="rounded-2xl border border-border bg-surface">
        <header className="border-b border-border px-5 py-3 text-sm font-medium">All expenses</header>
        {expenses.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">No expenses this month.</p>
        ) : (
          <ul className="divide-y divide-border">
            {expenses.map((e) => (
              <li key={e._id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="font-medium">{e.shopName}</p>
                  <p className="text-xs text-muted">
                    {new Date(e.date).toLocaleDateString()} · paid by{" "}
                    {userNameById.get(e.payerId) ?? "?"} · {e.participantIds.length} ppl
                    {e.groupId ? ` · ${groupNameById.get(e.groupId) ?? "group"}` : ""}
                  </p>
                </div>
                <p className="font-semibold">{filsToAed(e.amount)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Card({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: "positive" | "negative";
}) {
  const tone =
    accent === "positive"
      ? "text-emerald-600"
      : accent === "negative"
        ? "text-red-600"
        : "text-foreground";
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${tone}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
