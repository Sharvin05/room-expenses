import { Types } from "mongoose";
import { connectDb } from "@/lib/db/connect";
import { Expense } from "@/lib/db/models/Expense";
import { Transfer, type TransferStatus } from "@/lib/db/models/Transfer";
import { computeMonthBillView } from "@/lib/money/bills";

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

export type CounterpartSummary = {
  userId: string;
  netOutstanding: number;
  grossIOwe: number;
  grossTheyOwe: number;
  paidByMe: number;
  paidByThem: number;
  pending: TransferLite[];
};

export type OverallBalance = {
  youOwe: { total: number; perCreditor: CounterpartSummary[] };
  owedToYou: { total: number; perDebtor: CounterpartSummary[] };
  totalPaidByMe: number;
};

const pairKey = (from: string, to: string) => `${from}|${to}`;

async function listActiveMonths(
  roomObjectId: Types.ObjectId,
): Promise<{ year: number; month: number }[]> {
  const [expenseMonths, transferMonths] = await Promise.all([
    Expense.aggregate<{ _id: { y: number; m: number } }>([
      { $match: { roomId: roomObjectId } },
      { $group: { _id: { y: "$year", m: "$month" } } },
    ]),
    Transfer.aggregate<{ _id: { y: number; m: number } }>([
      { $match: { roomId: roomObjectId, status: "confirmed" } },
      { $group: { _id: { y: "$year", m: "$month" } } },
    ]),
  ]);

  const seen = new Set<string>();
  const out: { year: number; month: number }[] = [];
  for (const r of [...expenseMonths, ...transferMonths]) {
    const key = `${r._id.y}-${r._id.m}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ year: r._id.y, month: r._id.m });
  }
  return out;
}

export async function computeUserOverallBalance(
  roomId: string,
  userId: string,
): Promise<OverallBalance> {
  await connectDb();
  const roomObjectId = new Types.ObjectId(roomId);
  const userObjectId = new Types.ObjectId(userId);

  const months = await listActiveMonths(roomObjectId);

  const [bills, confirmed, pending] = await Promise.all([
    Promise.all(months.map((m) => computeMonthBillView(roomId, m.year, m.month))),
    Transfer.find({ roomId: roomObjectId, status: "confirmed" })
      .select("fromUserId toUserId amount")
      .lean(),
    Transfer.find({
      roomId: roomObjectId,
      status: "pending",
      $or: [{ fromUserId: userObjectId }, { toUserId: userObjectId }],
    })
      .select("fromUserId toUserId amount status note declaredAt resolvedAt")
      .lean(),
  ]);

  const owed = new Map<string, number>();
  for (const bill of bills) {
    for (const s of bill.settlements) {
      const k = pairKey(s.fromUserId, s.toUserId);
      owed.set(k, (owed.get(k) ?? 0) + s.amount);
    }
  }

  const paid = new Map<string, number>();
  let totalPaidByMe = 0;
  for (const t of confirmed) {
    const from = t.fromUserId.toString();
    const to = t.toUserId.toString();
    paid.set(pairKey(from, to), (paid.get(pairKey(from, to)) ?? 0) + t.amount);
    if (from === userId) totalPaidByMe += t.amount;
  }

  const pendingByCounterpart = new Map<string, TransferLite[]>();
  for (const t of pending) {
    const fromId = t.fromUserId.toString();
    const toId = t.toUserId.toString();
    const other = fromId === userId ? toId : fromId;
    const lite: TransferLite = {
      id: t._id.toString(),
      fromUserId: fromId,
      toUserId: toId,
      amount: t.amount,
      status: t.status,
      note: t.note ?? "",
      declaredAt: t.declaredAt,
      resolvedAt: t.resolvedAt ?? null,
    };
    const list = pendingByCounterpart.get(other) ?? [];
    list.push(lite);
    pendingByCounterpart.set(other, list);
  }

  const counterparts = new Set<string>();
  for (const k of owed.keys()) {
    const [from, to] = k.split("|");
    if (from === userId) counterparts.add(to);
    else if (to === userId) counterparts.add(from);
  }
  for (const k of paid.keys()) {
    const [from, to] = k.split("|");
    if (from === userId) counterparts.add(to);
    else if (to === userId) counterparts.add(from);
  }
  for (const other of pendingByCounterpart.keys()) counterparts.add(other);

  const youOwe: CounterpartSummary[] = [];
  const owedToYou: CounterpartSummary[] = [];

  for (const other of counterparts) {
    const grossIOwe = owed.get(pairKey(userId, other)) ?? 0;
    const grossTheyOwe = owed.get(pairKey(other, userId)) ?? 0;
    const paidByMe = paid.get(pairKey(userId, other)) ?? 0;
    const paidByThem = paid.get(pairKey(other, userId)) ?? 0;
    const netIOwe = grossIOwe - grossTheyOwe;

    const summary: CounterpartSummary = {
      userId: other,
      netOutstanding: netIOwe,
      grossIOwe,
      grossTheyOwe,
      paidByMe,
      paidByThem,
      pending: pendingByCounterpart.get(other) ?? [],
    };

    if (netIOwe > 0) {
      youOwe.push(summary);
    } else if (netIOwe < 0) {
      owedToYou.push({ ...summary, netOutstanding: -netIOwe });
    } else if (summary.pending.length > 0 || paidByMe > 0 || paidByThem > 0) {
      youOwe.push(summary);
    }
  }

  youOwe.sort((a, b) => b.netOutstanding - a.netOutstanding);
  owedToYou.sort((a, b) => b.netOutstanding - a.netOutstanding);

  return {
    youOwe: {
      total: youOwe.reduce((s, r) => s + Math.max(0, r.netOutstanding), 0),
      perCreditor: youOwe,
    },
    owedToYou: {
      total: owedToYou.reduce((s, r) => s + r.netOutstanding, 0),
      perDebtor: owedToYou,
    },
    totalPaidByMe,
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
    .select("year month fromUserId toUserId amount note declaredAt resolvedAt");

  if (opts.limit !== undefined) query.limit(opts.limit);

  const transfers = await query.lean();

  return transfers.map((t) => ({
    id: t._id.toString(),
    fromUserId: t.fromUserId.toString(),
    toUserId: t.toUserId.toString(),
    amount: t.amount,
    note: t.note ?? "",
    declaredAt: t.declaredAt,
    resolvedAt: t.resolvedAt ?? null,
    year: t.year,
    month: t.month,
  }));
}
