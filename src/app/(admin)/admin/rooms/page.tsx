import { connectDb } from "@/lib/db/connect";
import { Room } from "@/lib/db/models/Room";
import { requireOwner } from "@/lib/auth/session";
import RoomsClient from "./RoomsClient";

export default async function RoomsPage() {
  await requireOwner();
  await connectDb();
  const rooms = await Room.find().sort({ createdAt: -1 }).lean();

  const initial = rooms.map((r) => ({
    id: r._id.toString(),
    name: r.name,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : null,
  }));

  return <RoomsClient initial={initial} />;
}
