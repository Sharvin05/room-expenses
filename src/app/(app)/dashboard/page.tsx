import { Types } from "mongoose";
import { redirect } from "next/navigation";
import { connectDb } from "@/lib/db/connect";
import { User } from "@/lib/db/models/User";
import { Group } from "@/lib/db/models/Group";
import { requireUser } from "@/lib/auth/session";
import { currentYearMonth, listExpenses } from "@/lib/money/reports";
import { computeMonthBillView } from "@/lib/money/bills";
import MonthView from "@/components/MonthView";
import UserSwitcher from "@/components/UserSwitcher";
import GroupTotalsPanel, { type GroupTotalRow } from "@/components/GroupTotalsPanel";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ y?: string; m?: string; as?: string }>;
}) {
  const session = await requireUser();
  if (!session.roomId) redirect("/admin");

  await connectDb();
  const sp = await searchParams;
  const now = currentYearMonth();
  const year = Number(sp.y) || now.year;
  const month = Number(sp.m) || now.month;

  const roomId = new Types.ObjectId(session.roomId);
  const isAdmin = session.role === "owner" || session.role === "roomAdmin";

  const [bill, expenses, users, groups] = await Promise.all([
    computeMonthBillView(session.roomId, year, month),
    listExpenses(session.roomId, { year, month }),
    User.find({ roomId }).select("name").lean(),
    Group.find({ roomId }).select("name").lean(),
  ]);

  const userIdSet = new Set(users.map((u) => u._id.toString()));
  const viewedUserId =
    isAdmin && sp.as && userIdSet.has(sp.as) ? sp.as : session.sub;

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

  const viewedSpent = bill.perUserSpent.find((r) => r.userId === viewedUserId)?.amount ?? 0;
  const viewedShare = bill.perUserShare.find((r) => r.userId === viewedUserId)?.amount ?? 0;
  const personalSummary = {
    spent: viewedSpent,
    share: viewedShare,
    net: viewedSpent - viewedShare,
    count: bill.expenseCount,
  };

  const perGroup = new Map<string, { total: number; count: number }>();
  for (const e of expenses) {
    const key = e.groupId ?? "__ungrouped__";
    const cur = perGroup.get(key) ?? { total: 0, count: 0 };
    cur.total += e.amount;
    cur.count += 1;
    perGroup.set(key, cur);
  }
  const groupTotals: GroupTotalRow[] = Array.from(perGroup, ([key, v]) => ({
    groupId: key === "__ungrouped__" ? null : key,
    name: key === "__ungrouped__" ? "Ungrouped" : groupNameById.get(key) ?? "Unknown group",
    total: v.total,
    count: v.count,
  })).sort((a, b) => b.total - a.total);

  const prevMonth = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const isFutureOrCurrent = year > now.year || (year === now.year && month >= now.month);
  const nextMonth = isFutureOrCurrent
    ? null
    : month === 12
      ? { y: year + 1, m: 1 }
      : { y: year, m: month + 1 };

  const isImpersonating = isAdmin && viewedUserId !== session.sub;
  const viewedUserName = isImpersonating
    ? userNameById.get(viewedUserId)
    : undefined;

  return (
    <div className="flex flex-col gap-8">
      {isAdmin ? (
        <UserSwitcher
          users={users.map((u) => ({ id: u._id.toString(), name: u.name }))}
          selfId={session.sub}
          viewedUserId={viewedUserId}
          year={year}
          month={month}
        />
      ) : null}

      <GroupTotalsPanel year={year} month={month} groupTotals={groupTotals} />

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
        settlements={bill.settlements}
        viewedAs={isImpersonating ? viewedUserId : undefined}
        viewedUserName={viewedUserName}
      />
    </div>
  );
}
