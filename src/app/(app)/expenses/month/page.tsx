import { Types } from "mongoose";
import { redirect } from "next/navigation";
import { connectDb } from "@/lib/db/connect";
import { User } from "@/lib/db/models/User";
import { Group } from "@/lib/db/models/Group";
import { requireUser } from "@/lib/auth/session";
import {
  currentYearMonth,
  listExpenses,
  monthlyByPayer,
  shareTotalsByUser,
} from "@/lib/money/reports";
import { filsToAed } from "@/lib/format/currency";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default async function MonthPage({
  searchParams,
}: {
  searchParams: Promise<{ y?: string; m?: string }>;
}) {
  const session = await requireUser();
  if (!session.roomId) redirect("/admin");

  await connectDb();
  const sp = await searchParams;
  const now = currentYearMonth();
  const year = Number(sp.y) || now.year;
  const month = Number(sp.m) || now.month;

  const roomId = new Types.ObjectId(session.roomId);
  const [expenses, perPayer, users, groups] = await Promise.all([
    listExpenses(session.roomId, { year, month }),
    monthlyByPayer(session.roomId, year, month),
    User.find({ roomId }).select("name").lean(),
    Group.find({ roomId }).select("name").lean(),
  ]);

  const userNameById = new Map(users.map((u) => [u._id.toString(), u.name]));
  const groupNameById = new Map(groups.map((g) => [g._id.toString(), g.name]));
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const perUserShare = shareTotalsByUser(expenses);

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold">
          {MONTH_NAMES[month - 1]} {year}
        </h1>
        <p className="text-sm text-muted">
          {expenses.length} expense{expenses.length === 1 ? "" : "s"} · total{" "}
          <span className="font-semibold text-foreground">{filsToAed(total)}</span>
        </p>
      </header>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface">
          <header className="border-b border-border px-5 py-3 text-sm font-medium">
            Paid by
          </header>
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
          {perUserShare.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted">No expenses yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {perUserShare.map((row) => (
                <li key={row.userId} className="flex items-center justify-between px-5 py-3">
                  <p className="font-medium">{userNameById.get(row.userId) ?? row.userId}</p>
                  <p className="font-semibold">{filsToAed(row.share)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface">
        <header className="border-b border-border px-5 py-3 text-sm font-medium">
          All expenses
        </header>
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
