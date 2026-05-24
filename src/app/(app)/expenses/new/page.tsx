import { Types } from "mongoose";
import { redirect } from "next/navigation";
import { connectDb } from "@/lib/db/connect";
import { Group, effectiveMembers } from "@/lib/db/models/Group";
import { User } from "@/lib/db/models/User";
import { requireUser } from "@/lib/auth/session";
import { currentYearMonth, listExpenses } from "@/lib/money/reports";
import NewExpenseClient from "./NewExpenseClient";
import { console } from "inspector";

export default async function NewExpensePage({
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
  const [groups, users, expenses] = await Promise.all([
    Group.find({ roomId }).sort({ name: 1 }).lean(),
    User.find({ roomId, role: { $ne: "owner" } })
      .sort({ name: 1 })
      .lean(),
    listExpenses(session.roomId, { year, month }),
  ]);

  const groupsOut = groups.map((g) => ({
    id: g._id.toString(),
    name: g.name,
    memberIds: effectiveMembers(g).map((m) => m.userId.toString()),
  }));
  console.log("groupsOut", groupsOut);
  const usersOut = users.map((u) => ({ id: u._id.toString(), name: u.name }));
  const expensesOut = expenses.map((e) => ({
    id: e._id,
    amount: e.amount,
    shopName: e.shopName,
    payerId: e.payerId,
    participantIds: e.participantIds,
    groupId: e.groupId,
    date: e.date.toISOString(),
  }));

  const prevMonth = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const nextIsFuture = year > now.year || (year === now.year && month >= now.month);
  const nextMonth = nextIsFuture
    ? null
    : month === 12
      ? { y: year + 1, m: 1 }
      : { y: year, m: month + 1 };

  return (
    <NewExpenseClient
      currentUserId={session.sub}
      role={session.role}
      groups={groupsOut}
      users={usersOut}
      monthExpenses={expensesOut}
      selectedYear={year}
      selectedMonth={month}
      prevMonth={prevMonth}
      nextMonth={nextMonth}
    />
  );
}
