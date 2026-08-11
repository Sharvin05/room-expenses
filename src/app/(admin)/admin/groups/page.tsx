import { Types } from "mongoose";
import { connectDb } from "@/lib/db/connect";
import { Room } from "@/lib/db/models/Room";
import { Group, currentMemberIds } from "@/lib/db/models/Group";
import { User } from "@/lib/db/models/User";
import { requireAdmin } from "@/lib/auth/session";
import GroupsClient from "./GroupsClient";

export default async function GroupsPage() {
  const session = await requireAdmin();
  await connectDb();

  const isOwner = session.role === "owner";
  const roomFilter = isOwner ? {} : { roomId: new Types.ObjectId(session.roomId!) };

  const [rooms, groups, users] = await Promise.all([
    isOwner ? Room.find().sort({ name: 1 }).lean() : Room.find({ _id: new Types.ObjectId(session.roomId!) }).lean(),
    Group.find(roomFilter).sort({ createdAt: -1 }).lean(),
    User.find({ ...roomFilter, role: { $ne: "owner" } })
      .sort({ name: 1 })
      .lean(),
  ]);

  return (
    <GroupsClient
      isOwner={isOwner}
      rooms={rooms.map((r) => ({ id: r._id.toString(), name: r.name }))}
      groups={groups.map((g) => ({
        id: g._id.toString(),
        name: g.name,
        roomId: g.roomId.toString(),
        memberIds: currentMemberIds(g),
      }))}
      users={users.map((u) => ({
        id: u._id.toString(),
        name: u.name,
        email: u.email,
        roomId: u.roomId ? u.roomId.toString() : null,
      }))}
    />
  );
}
