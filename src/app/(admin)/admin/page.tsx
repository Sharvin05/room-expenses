import Link from "next/link";
import { connectDb } from "@/lib/db/connect";
import { Room } from "@/lib/db/models/Room";
import { Group } from "@/lib/db/models/Group";
import { User } from "@/lib/db/models/User";
import { Expense } from "@/lib/db/models/Expense";
import { requireAdmin } from "@/lib/auth/session";
import { Types } from "mongoose";

export default async function AdminHome() {
  const session = await requireAdmin();
  await connectDb();

  const isOwner = session.role === "owner";
  const roomFilter = isOwner ? {} : { roomId: new Types.ObjectId(session.roomId!) };

  const [rooms, users, groups, expenses] = await Promise.all([
    isOwner ? Room.countDocuments() : Room.countDocuments({ _id: new Types.ObjectId(session.roomId!) }),
    User.countDocuments(roomFilter),
    Group.countDocuments(roomFilter),
    Expense.countDocuments(roomFilter),
  ]);

  const cards = [
    isOwner ? { label: "Rooms", value: rooms, href: "/admin/rooms" } : null,
    { label: "Users", value: users, href: "/admin/users" },
    { label: "Groups", value: groups, href: "/admin/groups" },
    { label: "Expenses", value: expenses, href: "/expenses/month" },
  ].filter(Boolean) as { label: string; value: number; href: string }[];

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold">Admin</h1>
        <p className="text-sm text-muted">
          {isOwner ? "Manage every room, user, and group." : "Manage your room."}
        </p>
      </header>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="rounded-2xl border border-border bg-surface p-5 hover:border-primary"
          >
            <p className="text-xs uppercase tracking-wide text-muted">{c.label}</p>
            <p className="mt-2 text-3xl font-semibold">{c.value}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
