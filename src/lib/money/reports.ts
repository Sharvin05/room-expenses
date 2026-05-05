import { Types } from "mongoose";
import { connectDb } from "@/lib/db/connect";
import { Expense } from "@/lib/db/models/Expense";
import { aggregateForUser, splitShares } from "@/lib/money/split";

export function currentYearMonth(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export type MonthBucket = {
  year: number;
  month: number;
  total: number;
  count: number;
};

export async function listMonthBuckets(roomId: string): Promise<MonthBucket[]> {
  await connectDb();
  const rows = await Expense.aggregate<{
    _id: { y: number; m: number };
    total: number;
    count: number;
  }>([
    { $match: { roomId: new Types.ObjectId(roomId) } },
    {
      $group: {
        _id: { y: "$year", m: "$month" },
        total: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
    { $sort: { "_id.y": -1, "_id.m": -1 } },
  ]);
  return rows.map((r) => ({ year: r._id.y, month: r._id.m, total: r.total, count: r.count }));
}

export type PerPayerRow = {
  payerId: string;
  total: number;
  count: number;
};

export async function monthlyByPayer(
  roomId: string,
  year: number,
  month: number,
): Promise<PerPayerRow[]> {
  await connectDb();
  const rows = await Expense.aggregate<{
    _id: Types.ObjectId;
    total: number;
    count: number;
  }>([
    { $match: { roomId: new Types.ObjectId(roomId), year, month } },
    { $group: { _id: "$payerId", total: { $sum: "$amount" }, count: { $sum: 1 } } },
    { $sort: { total: -1 } },
  ]);
  return rows.map((r) => ({ payerId: r._id.toString(), total: r.total, count: r.count }));
}

export type RawExpense = {
  _id: string;
  amount: number;
  shopName: string;
  payerId: string;
  participantIds: string[];
  groupId: string | null;
  date: Date;
};

export async function listExpenses(
  roomId: string,
  filter: { year?: number; month?: number } = {},
): Promise<RawExpense[]> {
  await connectDb();
  const match: Record<string, unknown> = { roomId: new Types.ObjectId(roomId) };
  if (filter.year !== undefined) match.year = filter.year;
  if (filter.month !== undefined) match.month = filter.month;
  const docs = await Expense.find(match).sort({ date: -1, createdAt: -1 }).lean();
  return docs.map((d) => ({
    _id: d._id.toString(),
    amount: d.amount,
    shopName: d.shopName,
    payerId: d.payerId.toString(),
    participantIds: d.participantIds.map((id) => id.toString()),
    groupId: d.groupId ? d.groupId.toString() : null,
    date: d.date,
  }));
}

export type PersonalSummary = {
  spent: number;
  share: number;
  net: number;
  count: number;
};

export async function personalSummary(
  userId: string,
  roomId: string,
  year: number,
  month: number,
): Promise<PersonalSummary> {
  const expenses = await listExpenses(roomId, { year, month });
  const agg = aggregateForUser(userId, expenses);
  return { ...agg, count: expenses.length };
}

export type PerUserShareRow = {
  userId: string;
  share: number;
};

export function shareTotalsByUser(expenses: readonly RawExpense[]): PerUserShareRow[] {
  const totals = new Map<string, number>();
  for (const e of expenses) {
    const shares = splitShares(e.amount, e.participantIds);
    for (const [uid, value] of shares) {
      totals.set(uid, (totals.get(uid) ?? 0) + value);
    }
  }
  return Array.from(totals, ([userId, share]) => ({ userId, share })).sort(
    (a, b) => b.share - a.share,
  );
}
