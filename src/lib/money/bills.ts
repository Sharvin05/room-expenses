import { Types } from "mongoose";
import { connectDb } from "@/lib/db/connect";
import { MonthlyBill, type MonthlyBillDoc } from "@/lib/db/models/MonthlyBill";
import { Transfer, type TransferStatus } from "@/lib/db/models/Transfer";
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

export type TransferLite = {
  id: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  status: TransferStatus;
  note: string;
  declaredAt: Date;
  resolvedAt: Date | null;
};

export type SettlementRow = {
  fromUserId: string;
  toUserId: string;
  owedAmount: number;
  paidAmount: number;
  pendingAmount: number;
  outstandingAmount: number;
  settled: boolean;
  overpaid: boolean;
  pendingTransfers: TransferLite[];
  confirmedTransfers: TransferLite[];
};

export async function resolveBillSettlements(billId: string): Promise<SettlementRow[]> {
  if (!Types.ObjectId.isValid(billId)) return [];
  await connectDb();
  const bill = await MonthlyBill.findById(billId);
  if (!bill) return [];

  const transfers = await Transfer.find({
    billId: bill._id,
    status: { $in: ["pending", "confirmed"] },
  }).lean();

  return bill.settlements.map((s) => {
    const fromId = s.fromUserId.toString();
    const toId = s.toUserId.toString();

    let paid = 0;
    let pending = 0;
    const pendingList: TransferLite[] = [];
    const confirmedList: TransferLite[] = [];

    for (const t of transfers) {
      const tFrom = t.fromUserId.toString();
      const tTo = t.toUserId.toString();
      const sameDir = tFrom === fromId && tTo === toId;
      const oppDir = tFrom === toId && tTo === fromId;
      if (!sameDir && !oppDir) continue;

      const tlite: TransferLite = {
        id: t._id.toString(),
        fromUserId: tFrom,
        toUserId: tTo,
        amount: t.amount,
        status: t.status,
        note: t.note ?? "",
        declaredAt: t.declaredAt,
        resolvedAt: t.resolvedAt ?? null,
      };

      const signed = sameDir ? t.amount : -t.amount;
      if (t.status === "confirmed") {
        paid += signed;
        confirmedList.push(tlite);
      } else if (t.status === "pending") {
        pending += signed;
        pendingList.push(tlite);
      }
    }

    return {
      fromUserId: fromId,
      toUserId: toId,
      owedAmount: s.amount,
      paidAmount: paid,
      pendingAmount: pending,
      outstandingAmount: Math.max(0, s.amount - paid),
      settled: paid >= s.amount,
      overpaid: paid > s.amount,
      pendingTransfers: pendingList,
      confirmedTransfers: confirmedList,
    };
  });
}
