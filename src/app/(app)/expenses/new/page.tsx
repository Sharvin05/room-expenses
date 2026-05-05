import { Types } from "mongoose";
import { redirect } from "next/navigation";
import { connectDb } from "@/lib/db/connect";
import { Group } from "@/lib/db/models/Group";
import { User } from "@/lib/db/models/User";
import { requireUser } from "@/lib/auth/session";
import NewExpenseClient from "./NewExpenseClient";

export default async function NewExpensePage() {
  const session = await requireUser();
  if (!session.roomId) redirect("/admin");

  await connectDb();
  const roomId = new Types.ObjectId(session.roomId);

  const [groups, users] = await Promise.all([
    Group.find({ roomId }).sort({ name: 1 }).lean(),
    User.find({ roomId, role: { $ne: "owner" } })
      .sort({ name: 1 })
      .lean(),
  ]);

  return (
    <NewExpenseClient
      currentUserId={session.sub}
      groups={groups.map((g) => ({
        id: g._id.toString(),
        name: g.name,
        memberIds: g.memberIds.map((id) => id.toString()),
      }))}
      users={users.map((u) => ({ id: u._id.toString(), name: u.name }))}
    />
  );
}
