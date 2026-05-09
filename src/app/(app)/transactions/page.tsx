import { Types } from "mongoose";
import { redirect } from "next/navigation";
import { connectDb } from "@/lib/db/connect";
import { User } from "@/lib/db/models/User";
import { requireUser } from "@/lib/auth/session";
import { listUserTransfers, type UserTransferRow } from "@/lib/money/overall";
import { filsToAed } from "@/lib/format/currency";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default async function TransactionsPage() {
  const session = await requireUser();
  if (!session.roomId) redirect("/admin");

  await connectDb();
  const roomId = new Types.ObjectId(session.roomId);

  const [transfers, users] = await Promise.all([
    listUserTransfers(session.roomId, session.sub),
    User.find({ roomId }).select("name").lean(),
  ]);

  const userNameById = new Map(users.map((u) => [u._id.toString(), u.name]));
  const nameOf = (id: string) => userNameById.get(id) ?? id;

  const groups = groupByMonth(transfers);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Transactions</h1>
        <p className="text-sm text-muted">All confirmed payments you&apos;ve sent or received.</p>
      </header>

      {groups.length === 0 ? (
        <section className="rounded-2xl border border-border bg-surface px-5 py-6">
          <p className="text-sm text-muted">No payments recorded yet.</p>
        </section>
      ) : (
        groups.map((g) => (
          <section key={`${g.year}-${g.month}`} className="rounded-2xl border border-border bg-surface">
            <header className="flex items-center justify-between border-b border-border px-5 py-3">
              <h2 className="text-sm font-medium">
                {MONTH_NAMES[g.month - 1] ?? "Unknown"} {g.year || ""}
              </h2>
              <p className="text-xs text-muted">
                {g.rows.length} payment{g.rows.length === 1 ? "" : "s"}
              </p>
            </header>
            <ul className="divide-y divide-border">
              {g.rows.map((t) => {
                const isOutgoing = t.fromUserId === session.sub;
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
                        {new Date(date).toLocaleDateString()}
                        {t.note ? ` · ${t.note}` : ""}
                      </p>
                    </div>
                    <p className={`font-semibold ${isOutgoing ? "text-red-600" : "text-emerald-600"}`}>
                      {isOutgoing ? "−" : "+"}
                      {filsToAed(t.amount)}
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

type MonthGroup = { year: number; month: number; rows: UserTransferRow[] };

function groupByMonth(transfers: UserTransferRow[]): MonthGroup[] {
  const map = new Map<string, MonthGroup>();
  for (const t of transfers) {
    const key = `${t.year}-${t.month}`;
    let g = map.get(key);
    if (!g) {
      g = { year: t.year, month: t.month, rows: [] };
      map.set(key, g);
    }
    g.rows.push(t);
  }
  return Array.from(map.values()).sort(
    (a, b) => b.year - a.year || b.month - a.month,
  );
}
