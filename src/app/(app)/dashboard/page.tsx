import { Types } from "mongoose";
import { redirect } from "next/navigation";
import { connectDb } from "@/lib/db/connect";
import { User } from "@/lib/db/models/User";
import { Group } from "@/lib/db/models/Group";
import { requireUser } from "@/lib/auth/session";
import { currentYearMonth, listExpenses } from "@/lib/money/reports";
import { getOrComputeBillView, resolveBillSettlements } from "@/lib/money/bills";
import MonthView from "@/components/MonthView";

export default async function DashboardPage({
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
  const bill = await getOrComputeBillView(session.roomId, year, month);
  const [expenses, users, groups, settlementRows] = await Promise.all([
    listExpenses(session.roomId, { year, month }),
    User.find({ roomId }).select("name").lean(),
    Group.find({ roomId }).select("name").lean(),
    resolveBillSettlements(bill.id),
  ]);

  const userNameById = new Map(users.map((u) => [u._id.toString(), u.name]));
  const groupNameById = new Map(groups.map((g) => [g._id.toString(), g.name]));

  const payerCountByUser = new Map<string, number>();
  for (const e of expenses) {
    payerCountByUser.set(e.payerId, (payerCountByUser.get(e.payerId) ?? 0) + 1);
  }
  const perPayer = bill.perUserSpent
    .map((r) => ({
      payerId: r.userId,
      total: r.amount,
      count: payerCountByUser.get(r.userId) ?? 0,
    }))
    .sort((a, b) => b.total - a.total);

  const perShare = bill.perUserShare
    .map((r) => ({ userId: r.userId, share: r.amount }))
    .sort((a, b) => b.share - a.share);

  const mySpent = bill.perUserSpent.find((r) => r.userId === session.sub)?.amount ?? 0;
  const myShare = bill.perUserShare.find((r) => r.userId === session.sub)?.amount ?? 0;
  const personalSummary = {
    spent: mySpent,
    share: myShare,
    net: mySpent - myShare,
    count: bill.expenseCount,
  };

  const prevMonth = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const isFutureOrCurrent = year > now.year || (year === now.year && month >= now.month);
  const nextMonth = isFutureOrCurrent
    ? null
    : month === 12
      ? { y: year + 1, m: 1 }
      : { y: year, m: month + 1 };

  return (
    <MonthView
      year={year}
      month={month}
      expenses={expenses}
      userNameById={userNameById}
      groupNameById={groupNameById}
      personalSummary={personalSummary}
      prevMonth={prevMonth}
      nextMonth={nextMonth}
      perPayer={perPayer}
      perShare={perShare}
      billId={bill.id}
      settlementRows={settlementRows}
      currentUserId={session.sub}
    />
  );
}
