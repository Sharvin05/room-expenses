import { Types } from "mongoose";
import { connectDb } from "@/lib/db/connect";
import { MonthlyBill } from "@/lib/db/models/MonthlyBill";
import { Transfer } from "@/lib/db/models/Transfer";

export type PerCounterpart = {
  userId: string;
  amount: number;
};

export type OverallBalance = {
  youOwe: { total: number; perCreditor: PerCounterpart[] };
  owedToYou: { total: number; perDebtor: PerCounterpart[] };
};

const pairKey = (from: string, to: string) => `${from}|${to}`;

export async function computeUserOverallBalance(
  roomId: string,
  userId: string,
): Promise<OverallBalance> {
  await connectDb();
  const roomObjectId = new Types.ObjectId(roomId);

  const [bills, confirmed] = await Promise.all([
    MonthlyBill.find({ roomId: roomObjectId }).select("settlements").lean(),
    Transfer.find({ roomId: roomObjectId, status: "confirmed" })
      .select("fromUserId toUserId amount")
      .lean(),
  ]);

  const owed = new Map<string, number>();
  for (const bill of bills) {
    for (const s of bill.settlements) {
      const k = pairKey(s.fromUserId.toString(), s.toUserId.toString());
      owed.set(k, (owed.get(k) ?? 0) + s.amount);
    }
  }

  const paid = new Map<string, number>();
  for (const t of confirmed) {
    const k = pairKey(t.fromUserId.toString(), t.toUserId.toString());
    paid.set(k, (paid.get(k) ?? 0) + t.amount);
  }

  const counterparts = new Set<string>();
  for (const k of owed.keys()) {
    const [from, to] = k.split("|");
    if (from === userId) counterparts.add(to);
    else if (to === userId) counterparts.add(from);
  }

  const youOwe: PerCounterpart[] = [];
  const owedToYou: PerCounterpart[] = [];

  for (const other of counterparts) {
    const owedFromMe = owed.get(pairKey(userId, other)) ?? 0;
    const owedToMe = owed.get(pairKey(other, userId)) ?? 0;
    const paidByMe = paid.get(pairKey(userId, other)) ?? 0;
    const paidToMe = paid.get(pairKey(other, userId)) ?? 0;

    const netIOwe = owedFromMe - owedToMe - paidByMe + paidToMe;

    if (netIOwe > 0) {
      youOwe.push({ userId: other, amount: netIOwe });
    } else if (netIOwe < 0) {
      owedToYou.push({ userId: other, amount: -netIOwe });
    }
  }

  youOwe.sort((a, b) => b.amount - a.amount);
  owedToYou.sort((a, b) => b.amount - a.amount);

  return {
    youOwe: {
      total: youOwe.reduce((s, r) => s + r.amount, 0),
      perCreditor: youOwe,
    },
    owedToYou: {
      total: owedToYou.reduce((s, r) => s + r.amount, 0),
      perDebtor: owedToYou,
    },
  };
}

export type UserTransferRow = {
  id: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  note: string;
  declaredAt: Date;
  resolvedAt: Date | null;
  year: number;
  month: number;
};

export async function listUserTransfers(
  roomId: string,
  userId: string,
  opts: { limit?: number } = {},
): Promise<UserTransferRow[]> {
  await connectDb();
  const roomObjectId = new Types.ObjectId(roomId);
  const userObjectId = new Types.ObjectId(userId);

  const query = Transfer.find({
    roomId: roomObjectId,
    status: "confirmed",
    $or: [{ fromUserId: userObjectId }, { toUserId: userObjectId }],
  })
    .sort({ resolvedAt: -1, declaredAt: -1 })
    .select("billId fromUserId toUserId amount note declaredAt resolvedAt");

  if (opts.limit !== undefined) query.limit(opts.limit);

  const transfers = await query.lean();
  if (transfers.length === 0) return [];

  const billIds = Array.from(new Set(transfers.map((t) => t.billId.toString())));
  const bills = await MonthlyBill.find({
    _id: { $in: billIds.map((id) => new Types.ObjectId(id)) },
  })
    .select("year month")
    .lean();

  const billMap = new Map(bills.map((b) => [b._id.toString(), { year: b.year, month: b.month }]));

  return transfers.map((t) => {
    const bill = billMap.get(t.billId.toString());
    return {
      id: t._id.toString(),
      fromUserId: t.fromUserId.toString(),
      toUserId: t.toUserId.toString(),
      amount: t.amount,
      note: t.note ?? "",
      declaredAt: t.declaredAt,
      resolvedAt: t.resolvedAt ?? null,
      year: bill?.year ?? 0,
      month: bill?.month ?? 0,
    };
  });
}
