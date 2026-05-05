import { connectDb } from "@/lib/db/connect";
import { User } from "@/lib/db/models/User";
import { Room } from "@/lib/db/models/Room";
import { requireAdmin } from "@/lib/auth/session";
import AppHeader, { type NavItem } from "@/components/AppHeader";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();
  await connectDb();
  const [me, room] = await Promise.all([
    User.findById(session.sub),
    session.roomId ? Room.findById(session.roomId) : null,
  ]);

  const navItems: NavItem[] = [];
  if (session.role === "owner") {
    navItems.push({ href: "/admin/rooms", label: "Rooms" });
  }
  navItems.push(
    { href: "/admin/users", label: "Users" },
    { href: "/admin/groups", label: "Groups" },
    { href: "/expenses/month", label: "Expenses" },
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader
        homeHref="/admin"
        brand={room?.name ?? "Room Expenses"}
        tag="Admin"
        navItems={navItems}
        userName={me?.name ?? session.sub}
      />
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
