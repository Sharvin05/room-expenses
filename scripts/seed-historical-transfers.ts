import mongoose, { Types } from "mongoose";
import { connectDb } from "../src/lib/db/connect";
import { MonthlyBill } from "../src/lib/db/models/MonthlyBill";
import { Transfer } from "../src/lib/db/models/Transfer";

const ROOM_ID = "69fa448d3cd6d3dc99a9f263";
const YEAR = 2026;
const MONTH = 3;
const SOURCE_TAG = "tsc-script";

const U = {
  Sharvin: "69fa459b3cd6d3dc99a9f2b8",
  Malphilo: "69fa45483cd6d3dc99a9f2a3",
  Joshy: "69fa452d3cd6d3dc99a9f29c",
  Praveen: "69fa45143cd6d3dc99a9f295",
  Buslin: "69fa45623cd6d3dc99a9f2aa",
  Santosh: "69fa45823cd6d3dc99a9f2b1",
} as const;

const NAME_BY_ID = Object.fromEntries(
  Object.entries(U).map(([name, id]) => [id, name]),
) as Record<string, string>;

// Amounts are stored as fils (2-decimal precision). Original AED values are
// preserved as comments for traceability (AED * 100, rounded to 2 dp).
const PAYMENTS: { from: string; to: string; amount: number; note: string }[] = [
  {
    from: U.Sharvin,
    to: U.Malphilo,
    amount: 17343.50, // 173.435 AED
    note: "Historical settlement (pre-app)",
  },
  {
    from: U.Buslin,
    to: U.Malphilo,
    amount: 103378.83, // 1033.7883333 AED
    note: "Historical settlement (pre-app); overpaid by 35000 fils (350 AED)",
  },
];

const NEW_SETTLEMENTS: { from: string; to: string; amount: number }[] = [
  { from: U.Sharvin, to: U.Malphilo, amount: 17343.50 },  // 173.435 AED
  { from: U.Buslin,  to: U.Malphilo, amount: 68378.83 },  // 683.7883333 AED
  { from: U.Santosh, to: U.Malphilo, amount: 42154.83 },  // 421.5483337 AED
  { from: U.Santosh, to: U.Buslin,   amount: 22174.33 },  // 221.7433330 AED
  { from: U.Praveen, to: U.Buslin,   amount: 12825.67 },  // 128.2566670 AED
  { from: U.Praveen, to: U.Joshy,    amount:  7635.17 },  //  76.35166667 AED
];

async function main() {
  await connectDb();

  const roomOid = new Types.ObjectId(ROOM_ID);
  const bill = await MonthlyBill.findOne({ roomId: roomOid, year: YEAR, month: MONTH });
  if (!bill) {
    throw new Error(
      `MonthlyBill not found for room ${ROOM_ID} ${YEAR}-${String(MONTH).padStart(2, "0")}. ` +
        "Run recomputeMonthlyBill via the app first, then re-run this script.",
    );
  }
  console.log(`Found bill ${bill._id.toString()} (${YEAR}-${String(MONTH).padStart(2, "0")})`);

  const existingCount = await Transfer.collection.countDocuments({
    billId: bill._id,
    source: SOURCE_TAG,
  });
  if (existingCount > 0) {
    console.log(
      `Already seeded: found ${existingCount} transfer(s) with source="${SOURCE_TAG}" on this bill. Exiting.`,
    );
    await mongoose.disconnect();
    return;
  }

  const now = new Date();

  const transferDocs = PAYMENTS.map((p) => {
    const from = new Types.ObjectId(p.from);
    const to = new Types.ObjectId(p.to);
    return {
      roomId: roomOid,
      billId: bill._id,
      fromUserId: from,
      toUserId: to,
      amount: p.amount,
      status: "confirmed",
      note: p.note,
      declaredBy: from,
      declaredAt: now,
      resolvedBy: to,
      resolvedAt: now,
      source: SOURCE_TAG,
      createdAt: now,
      updatedAt: now,
    };
  });

  const insertResult = await Transfer.collection.insertMany(transferDocs);
  console.log(`Inserted ${insertResult.insertedCount} transfer(s):`);
  for (let i = 0; i < transferDocs.length; i++) {
    const id = insertResult.insertedIds[i];
    const t = transferDocs[i];
    console.log(
      `  ${id.toString()}  ${NAME_BY_ID[t.fromUserId.toString()]} -> ${NAME_BY_ID[t.toUserId.toString()]}  ${t.amount}`,
    );
  }

  const settlementsToWrite = NEW_SETTLEMENTS.map((s) => ({
    fromUserId: new Types.ObjectId(s.from),
    toUserId: new Types.ObjectId(s.to),
    amount: s.amount,
  }));

  const updateResult = await MonthlyBill.collection.updateOne(
    { _id: bill._id },
    {
      $set: {
        settlements: settlementsToWrite,
        source: SOURCE_TAG,
        customSplitAt: now,
        recomputedAt: now,
        updatedAt: now,
      },
    },
  );
  console.log(
    `Bill update: matched=${updateResult.matchedCount}, modified=${updateResult.modifiedCount}`,
  );

  const after = await MonthlyBill.collection.findOne({ _id: bill._id });
  console.log("New settlements:");
  for (const s of (after?.settlements ?? []) as Array<{
    fromUserId: Types.ObjectId;
    toUserId: Types.ObjectId;
    amount: number;
  }>) {
    console.log(
      `  ${NAME_BY_ID[s.fromUserId.toString()]} -> ${NAME_BY_ID[s.toUserId.toString()]}  ${s.amount}`,
    );
  }

  console.log(
    "WARNING: calling recomputeMonthlyBill for this bill will overwrite the custom split.",
  );

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
