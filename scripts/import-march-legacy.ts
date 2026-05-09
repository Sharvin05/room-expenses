import mongoose, { Types } from "mongoose";
import { connectDb } from "../src/lib/db/connect";
import { Expense } from "../src/lib/db/models/Expense";
import { Transfer } from "../src/lib/db/models/Transfer";
import { recomputeMonthlyBill } from "../src/lib/money/bills";

// ─── HARDCODED LEGACY DATA ───────────────────────────────────────────────
// One-shot import of pre-app state into March 2026.

const ROOM_ID = "69fa448d3cd6d3dc99a9f263";

const USER_NAMES: Record<string, string> = {
  // "PASTE_USER_OBJECT_ID": "Alice",
};

type Owing = { debtorId: string; creditorId: string; amountAed: number };
const OWINGS: Owing[] = [
  // { debtorId: "...", creditorId: "...", amountAed: 200 },
];

type Payment = {
  fromId: string;
  toId: string;
  amountAed: number;
  date: string; // ISO, e.g. "2026-03-15"
  note?: string;
};
const CONFIRMED_PAYMENTS: Payment[] = [
  // { fromId: "...", toId: "...", amountAed: 50, date: "2026-03-10", note: "rent share" },
];

const SENTINEL_DATE = new Date("2026-03-31T00:00:00.000Z");
const SHOP_NAME = "Pre-app balance";
const YEAR = 2026;
const MONTH = 3;

// ─────────────────────────────────────────────────────────────────────────

function nameOf(id: string): string {
  return USER_NAMES[id] ?? id;
}

function aedToFils(aed: number): number {
  return Math.round(aed * 100);
}

async function main() {
  if (!Types.ObjectId.isValid(ROOM_ID)) {
    throw new Error(`ROOM_ID is not a valid ObjectId: ${ROOM_ID}`);
  }
  for (const o of OWINGS) {
    if (!Types.ObjectId.isValid(o.debtorId) || !Types.ObjectId.isValid(o.creditorId)) {
      throw new Error(`Invalid user id in OWINGS: ${JSON.stringify(o)}`);
    }
    if (o.amountAed <= 0) {
      throw new Error(`OWINGS amount must be > 0: ${JSON.stringify(o)}`);
    }
    if (o.debtorId === o.creditorId) {
      throw new Error(`OWINGS debtor and creditor are the same: ${JSON.stringify(o)}`);
    }
  }
  for (const p of CONFIRMED_PAYMENTS) {
    if (!Types.ObjectId.isValid(p.fromId) || !Types.ObjectId.isValid(p.toId)) {
      throw new Error(`Invalid user id in CONFIRMED_PAYMENTS: ${JSON.stringify(p)}`);
    }
    if (p.amountAed <= 0) {
      throw new Error(`Payment amount must be > 0: ${JSON.stringify(p)}`);
    }
    if (Number.isNaN(new Date(p.date).getTime())) {
      throw new Error(`Invalid date in CONFIRMED_PAYMENTS: ${JSON.stringify(p)}`);
    }
  }

  await connectDb();

  const roomObjectId = new Types.ObjectId(ROOM_ID);

  // 1. Synthetic expenses for pending owings.
  let insertedExpenses = 0;
  if (OWINGS.length > 0) {
    const expenseDocs = OWINGS.map((o) => ({
      roomId: roomObjectId,
      payerId: new Types.ObjectId(o.creditorId),
      participantIds: [
        new Types.ObjectId(o.creditorId),
        new Types.ObjectId(o.debtorId),
      ],
      groupId: null,
      amount: aedToFils(o.amountAed) * 2, // doubled so 50/50 split nets to amountAed
      shopName: SHOP_NAME,
      date: SENTINEL_DATE,
      year: YEAR,
      month: MONTH,
    }));
    const inserted = await Expense.insertMany(expenseDocs);
    insertedExpenses = inserted.length;
    console.log(`Inserted ${insertedExpenses} synthetic expense(s) for ${OWINGS.length} owing(s).`);
  } else {
    console.log("No OWINGS to import.");
  }

  // 2. Recompute the March bill.
  const bill = await recomputeMonthlyBill(ROOM_ID, YEAR, MONTH);
  console.log(`Recomputed bill ${bill.id}: total=${bill.totalAmount} fils, settlements=${bill.settlements.length}`);

  // 3. Confirmed transfers for already-paid payments.
  let insertedTransfers = 0;
  if (CONFIRMED_PAYMENTS.length > 0) {
    const billObjectId = new Types.ObjectId(bill.id);
    const transferDocs = CONFIRMED_PAYMENTS.map((p) => {
      const when = new Date(p.date);
      return {
        roomId: roomObjectId,
        billId: billObjectId,
        fromUserId: new Types.ObjectId(p.fromId),
        toUserId: new Types.ObjectId(p.toId),
        amount: aedToFils(p.amountAed),
        status: "confirmed" as const,
        note: p.note ?? "",
        declaredBy: new Types.ObjectId(p.fromId),
        declaredAt: when,
        resolvedBy: new Types.ObjectId(p.toId),
        resolvedAt: when,
      };
    });
    const inserted = await Transfer.insertMany(transferDocs);
    insertedTransfers = inserted.length;
    console.log(`Inserted ${insertedTransfers} confirmed transfer(s).`);
  } else {
    console.log("No CONFIRMED_PAYMENTS to import.");
  }

  // 4. Summary.
  console.log("\n── Summary ──");
  console.log(`Expenses inserted:  ${insertedExpenses}`);
  console.log(`Transfers inserted: ${insertedTransfers}`);
  console.log(`Bill total:         ${(bill.totalAmount / 100).toFixed(2)} AED`);
  console.log("\nSettlements after recompute:");
  for (const s of bill.settlements) {
    console.log(
      `  ${nameOf(s.fromUserId)} → ${nameOf(s.toUserId)}: ${(s.amount / 100).toFixed(2)} AED`,
    );
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
