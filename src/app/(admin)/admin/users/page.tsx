import { Types } from "mongoose";
import { connectDb } from "@/lib/db/connect";
import { Room } from "@/lib/db/models/Room";
import { Group } from "@/lib/db/models/Group";
import { User } from "@/lib/db/models/User";
import { requireAdmin } from "@/lib/auth/session";
import UsersClient from "./UsersClient";

export default async function UsersPage() {
  const session = await requireAdmin();
  await connectDb();

  const isOwner = session.role === "owner";
  const roomFilter = isOwner ? {} : { roomId: new Types.ObjectId(session.roomId!) };

  const [rooms, groups, users] = await Promise.all([
    isOwner ? Room.find().sort({ name: 1 }).lean() : Room.find({ _id: new Types.ObjectId(session.roomId!) }).lean(),
    Group.find(roomFilter).sort({ name: 1 }).lean(),
    User.find({ ...roomFilter, role: { $ne: "owner" } })
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  return (
    <UsersClient
      isOwner={isOwner}
      rooms={rooms.map((r) => ({ id: r._id.toString(), name: r.name }))}
      groups={groups.map((g) => ({
        id: g._id.toString(),
        name: g.name,
        roomId: g.roomId.toString(),
      }))}
      users={users.map((u) => ({
        id: u._id.toString(),
        email: u.email,
        name: u.name,
        role: u.role,
        roomId: u.roomId ? u.roomId.toString() : null,
        groupIds: u.groupIds.map((id) => id.toString()),
      }))}
    />
  );
}
