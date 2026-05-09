import { Types } from "mongoose";
import { connectDb } from "@/lib/db/connect";
import { MonthlyBill, type MonthlyBillDoc } from "@/lib/db/models/MonthlyBill";
import { listExpenses, shareTotalsByUser } from "@/lib/money/reports";

export type SettlementTransfer = {
  fromUserId: string;
  toUserId: string;
  amount: number;
};

export type BillView = {
  id: string;
  roomId: string;
  year: number;
  month: number;
  totalAmount: number;
  expenseCount: number;
  perUserSpent: { userId: string; amount: number }[];
  perUserShare: { userId: string; amount: number }[];
  settlements: SettlementTransfer[];
  recomputedAt: Date;
};

export function computeSettlements(
  netByUserFils: ReadonlyMap<string, number>,
): SettlementTransfer[] {
  const creditors: { id: string; amount: number }[] = [];
  const debtors: { id: string; amount: number }[] = [];

  for (const [id, net] of netByUserFils) {
    if (net > 0) creditors.push({ id, amount: net });
    else if (net < 0) debtors.push({ id, amount: -net });
  }

  creditors.sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id));
  debtors.sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id));

  const transfers: SettlementTransfer[] = [];
  let i = 0;
  let j = 0;
  while (i < creditors.length && j < debtors.length) {
    const c = creditors[i];
    const d = debtors[j];
    const amount = Math.min(c.amount, d.amount);
    if (amount > 0) {
      transfers.push({ fromUserId: d.id, toUserId: c.id, amount });
    }
    c.amount -= amount;
    d.amount -= amount;
    if (c.amount === 0) i++;
    if (d.amount === 0) j++;
  }

  return transfers;
}

function toView(doc: MonthlyBillDoc): BillView {
  return {
    id: doc._id.toString(),
    roomId: doc.roomId.toString(),
    year: doc.year,
    month: doc.month,
    totalAmount: doc.totalAmount,
    expenseCount: doc.expenseCount,
    perUserSpent: doc.perUserSpent.map((r) => ({
      userId: r.userId.toString(),
      amount: r.amount,
    })),
    perUserShare: doc.perUserShare.map((r) => ({
      userId: r.userId.toString(),
      amount: r.amount,
    })),
    settlements: doc.settlements.map((s) => ({
      fromUserId: s.fromUserId.toString(),
      toUserId: s.toUserId.toString(),
      amount: s.amount,
    })),
    recomputedAt: doc.recomputedAt,
  };
}

export async function recomputeMonthlyBill(
  roomId: string,
  year: number,
  month: number,
): Promise<BillView> {
  await connectDb();
  const expenses = await listExpenses(roomId, { year, month });

  const perUserSpentMap = new Map<string, number>();
  for (const e of expenses) {
    perUserSpentMap.set(e.payerId, (perUserSpentMap.get(e.payerId) ?? 0) + e.amount);
  }

  const perShareRows = shareTotalsByUser(expenses);

  const netByUser = new Map<string, number>();
  for (const [uid, amount] of perUserSpentMap) {
    netByUser.set(uid, (netByUser.get(uid) ?? 0) + amount);
  }
  for (const r of perShareRows) {
    netByUser.set(r.userId, (netByUser.get(r.userId) ?? 0) - r.share);
  }

  const settlements = computeSettlements(netByUser);
  const totalAmount = expenses.reduce((s, e) => s + e.amount, 0);

  const doc = await MonthlyBill.findOneAndUpdate(
    { roomId: new Types.ObjectId(roomId), year, month },
    {
      $set: {
        totalAmount,
        expenseCount: expenses.length,
        perUserSpent: Array.from(perUserSpentMap, ([userId, amount]) => ({
          userId: new Types.ObjectId(userId),
          amount,
        })),
        perUserShare: perShareRows.map((r) => ({
          userId: new Types.ObjectId(r.userId),
          amount: r.share,
        })),
        settlements: settlements.map((s) => ({
          fromUserId: new Types.ObjectId(s.fromUserId),
          toUserId: new Types.ObjectId(s.toUserId),
          amount: s.amount,
        })),
        recomputedAt: new Date(),
      },
    },
    { upsert: true, new: true },
  );

  return toView(doc!);
}

export async function getOrComputeBillView(
  roomId: string,
  year: number,
  month: number,
): Promise<BillView> {
  await connectDb();
  const existing = await MonthlyBill.findOne({
    roomId: new Types.ObjectId(roomId),
    year,
    month,
  });
  if (existing) return toView(existing);
  return recomputeMonthlyBill(roomId, year, month);
}

