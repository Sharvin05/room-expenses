import mongoose from "mongoose";
import { connectDb } from "../src/lib/db/connect";
import { Group, effectiveMembers } from "../src/lib/db/models/Group";

/**
 * Converts group membership to interval form. Both legacy shapes become a
 * single open period, which is what they already meant:
 *
 *   memberIds: [u1, u2]                  → periods [{ joinedAt: group.createdAt }]
 *   members: [{ userId, joinedAt }]      → periods [{ joinedAt }]
 *
 * No membership changes as a result — this only restates it so that future
 * removals can close a period instead of deleting the member. Safe to re-run.
 */
async function main() {
  await connectDb();

  const groups = await Group.find({});
  let converted = 0;

  for (const group of groups) {
    const alreadyMigrated =
      !group.memberIds &&
      group.members.length > 0 &&
      group.members.every((m) => m.periods && m.periods.length > 0);
    if (alreadyMigrated) continue;

    const members = effectiveMembers(group);
    group.set(
      "members",
      members.map((m) => ({ userId: m.userId, periods: m.periods })),
    );
    group.set("memberIds", undefined);
    await group.save();
    converted += 1;
    console.log(`Migrated "${group.name}" (${members.length} members)`);
  }

  console.log(`Done. ${converted} of ${groups.length} group(s) migrated.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
