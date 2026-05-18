import mongoose, { Types } from "mongoose";
import { connectDb } from "../src/lib/db/connect";
import { Expense } from "../src/lib/db/models/Expense";
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

// Pre-app payments now stored as plain confirmed Transfers. The on-the-fly
// settlement engine folds these into the per-month net automatically; no
// fake expenses or stored-bill overrides needed.
const HISTORICAL_TRANSFERS: { from: string; to: string; amount: number; aed: string }[] = [
  { from: U.Sharvin, to: U.Malphilo, amount: 17343.5, aed: "173.435" },
  { from: U.Buslin, to: U.Malphilo, amount: 103378.83, aed: "1033.7883" },
];

async function main() {
  await connectDb();

  const roomOid = new Types.ObjectId(ROOM_ID);
  const now = new Date();

  // Step 1: undo the previous fake-expense approach.
  const fakeExpenses = await Expense.collection.deleteMany({
    roomId: roomOid,
    year: YEAR,
    month: MONTH,
    source: SOURCE_TAG,
  });
  console.log(`Step 1: deleted ${fakeExpenses.deletedCount} fake Expense(s) tagged source="${SOURCE_TAG}"`);

  // Step 2: backfill year/month onto every Transfer that still references billId.
  const monthlyBills = mongoose.connection.collection("monthlybills");
  const transfersNeedingBackfill = await Transfer.collection
    .find({ roomId: roomOid, $or: [{ year: { $exists: false } }, { month: { $exists: false } }] })
    .toArray();
  let backfilled = 0;
  for (const t of transfersNeedingBackfill) {
    const billId = (t as { billId?: Types.ObjectId }).billId;
    if (!billId) {
      console.warn(`  skip transfer ${t._id.toString()} (no billId, no year/month — orphan)`);
      continue;
    }
    const bill = await monthlyBills.findOne({ _id: billId });
    if (!bill) {
      console.warn(`  skip transfer ${t._id.toString()} (billId ${billId.toString()} not found)`);
      continue;
    }
    await Transfer.collection.updateOne(
      { _id: t._id },
      { $set: { year: bill.year, month: bill.month } },
    );
    backfilled++;
  }
  console.log(`Step 2: backfilled year/month on ${backfilled} Transfer(s)`);

  // Step 3: drop the now-vestigial billId field from every Transfer in the room.
  const unsetResult = await Transfer.collection.updateMany(
    { roomId: roomOid, billId: { $exists: true } },
    { $unset: { billId: "" } },
  );
  console.log(`Step 3: $unset billId on ${unsetResult.modifiedCount} Transfer(s)`);

  // Step 4: idempotently insert the two pre-app Transfers tagged source="tsc-script".
  const existingTagged = await Transfer.collection.countDocuments({
    roomId: roomOid,
    year: YEAR,
    month: MONTH,
    source: SOURCE_TAG,
  });
  if (existingTagged > 0) {
    console.log(`Step 4: skip — ${existingTagged} Transfer(s) tagged source="${SOURCE_TAG}" already exist`);
  } else {
    const docs = HISTORICAL_TRANSFERS.map((t) => {
      const fromOid = new Types.ObjectId(t.from);
      const toOid = new Types.ObjectId(t.to);
      return {
        roomId: roomOid,
        year: YEAR,
        month: MONTH,
        fromUserId: fromOid,
        toUserId: toOid,
        amount: t.amount,
        status: "confirmed",
        note: `Pre-app settlement (${t.aed} AED)`,
        declaredBy: fromOid,
        declaredAt: now,
        resolvedBy: toOid,
        resolvedAt: now,
        source: SOURCE_TAG,
        createdAt: now,
        updatedAt: now,
      };
    });
    const inserted = await Transfer.collection.insertMany(docs);
    console.log(`Step 4: inserted ${inserted.insertedCount} Transfer(s):`);
    for (let i = 0; i < docs.length; i++) {
      const id = inserted.insertedIds[i];
      const d = docs[i];
      console.log(
        `  ${id.toString()}  ${NAME_BY_ID[d.fromUserId.toString()]} -> ${NAME_BY_ID[d.toUserId.toString()]}  ${d.amount} fils (${HISTORICAL_TRANSFERS[i].aed} AED)`,
      );
    }
  }

  // Step 5: drop the monthlybills collection — no code reads it anymore.
  const collections = await mongoose.connection.db!.listCollections({ name: "monthlybills" }).toArray();
  if (collections.length > 0) {
    await mongoose.connection.db!.dropCollection("monthlybills");
    console.log("Step 5: dropped monthlybills collection");
  } else {
    console.log("Step 5: monthlybills collection already absent");
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
