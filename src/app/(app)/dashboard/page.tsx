import Link from "next/link";
import { Types } from "mongoose";
import { redirect } from "next/navigation";
import { connectDb } from "@/lib/db/connect";
import { User } from "@/lib/db/models/User";
import { requireUser } from "@/lib/auth/session";
import { currentYearMonth, listExpenses, personalSummary } from "@/lib/money/reports";
import { filsToAed } from "@/lib/format/currency";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default async function DashboardPage() {
  const session = await requireUser();
  if (!session.roomId) redirect("/admin");

  await connectDb();
  const { year, month } = currentYearMonth();
  const [summary, recent, roomUsers] = await Promise.all([
    personalSummary(session.sub, session.roomId, year, month),
    listExpenses(session.roomId, { year, month }),
    User.find({ roomId: new Types.ObjectId(session.roomId) }).select("name").lean(),
  ]);

  const userNameById = new Map(roomUsers.map((u) => [u._id.toString(), u.name]));
  const recentSlice = recent.slice(0, 8);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted">
            {MONTH_NAMES[month - 1]} {year}
          </p>
        </div>
        <Link
          href="/expenses/new"
          className="rounded-md bg-primary text-primary-foreground hover:opacity-90 px-4 py-2 text-sm font-medium"
        >
          + Add expense
        </Link>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <Card label="You spent" value={filsToAed(summary.spent)} hint="paid out of pocket" />
        <Card label="Your share" value={filsToAed(summary.share)} hint="of all expenses you're in" />
        <Card
          label="Net"
          value={filsToAed(summary.net)}
          hint={summary.net > 0 ? "owed to you" : summary.net < 0 ? "you owe" : "settled"}
          accent={summary.net > 0 ? "positive" : summary.net < 0 ? "negative" : undefined}
        />
      </section>

      <section className="rounded-2xl border border-border bg-surface">
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-sm font-medium">Recent this month</h2>
          <Link href="/expenses/month" className="text-xs text-muted hover:text-foreground">
            View all
          </Link>
        </header>
        {recentSlice.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">No expenses this month yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {recentSlice.map((e) => (
              <li key={e._id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="font-medium">{e.shopName}</p>
                  <p className="text-xs text-muted">
                    {new Date(e.date).toLocaleDateString()} · paid by{" "}
                    {userNameById.get(e.payerId) ?? "?"} · {e.participantIds.length} ppl
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
