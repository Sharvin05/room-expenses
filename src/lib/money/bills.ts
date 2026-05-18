import { connectDb } from "@/lib/db/connect";
import { Transfer } from "@/lib/db/models/Transfer";
import { listExpenses, shareTotalsByUser } from "@/lib/money/reports";

export type SettlementTransfer = {
  fromUserId: string;
  toUserId: string;
  amount: number;
};

export type BillView = {
  year: number;
  month: number;
  totalAmount: number;
  expenseCount: number;
  perUserSpent: { userId: string; amount: number }[];
  perUserShare: { userId: string; amount: number }[];
  settlements: SettlementTransfer[];
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

export async function computeMonthBillView(
  roomId: string,
  year: number,
  month: number,
): Promise<BillView> {
  await connectDb();

  const [expenses, confirmedTransfers] = await Promise.all([
    listExpenses(roomId, { year, month }),
    Transfer.find({ roomId, year, month, status: "confirmed" })
      .select("fromUserId toUserId amount")
      .lean(),
  ]);

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
  for (const t of confirmedTransfers) {
    const from = t.fromUserId.toString();
    const to = t.toUserId.toString();
    netByUser.set(from, (netByUser.get(from) ?? 0) + t.amount);
    netByUser.set(to, (netByUser.get(to) ?? 0) - t.amount);
  }

  const settlements = computeSettlements(netByUser);
  const totalAmount = expenses.reduce((s, e) => s + e.amount, 0);

  return {
    year,
    month,
    totalAmount,
    expenseCount: expenses.length,
    perUserSpent: Array.from(perUserSpentMap, ([userId, amount]) => ({ userId, amount })),
    perUserShare: perShareRows.map((r) => ({ userId: r.userId, amount: r.share })),
    settlements,
  };
}
