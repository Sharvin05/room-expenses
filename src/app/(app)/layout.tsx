import { redirect } from "next/navigation";
import { connectDb } from "@/lib/db/connect";
import { User } from "@/lib/db/models/User";
import { Room } from "@/lib/db/models/Room";
import { requireUser } from "@/lib/auth/session";
import AppHeader, { type NavItem } from "@/components/AppHeader";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireUser();
  if (!session.roomId) redirect("/admin");

  await connectDb();
  const [me, room] = await Promise.all([
    User.findById(session.sub),
    Room.findById(session.roomId),
  ]);

  const navItems: NavItem[] = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/expenses/new", label: "Add expense" },
    { href: "/expenses/history", label: "History" },
    { href: "/transactions", label: "Transactions" },
  ];
  if (session.role !== "user") {
    navItems.push({ href: "/admin", label: "Admin" });
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader
        homeHref="/dashboard"
        brand={room?.name ?? "Room Expenses"}
        navItems={navItems}
        userName={me?.name ?? session.sub}
      />
      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
