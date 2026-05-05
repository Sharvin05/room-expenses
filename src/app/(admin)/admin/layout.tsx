import Link from "next/link";
import { connectDb } from "@/lib/db/connect";
import { User } from "@/lib/db/models/User";
import { requireAdmin } from "@/lib/auth/session";
import { logoutAction } from "@/lib/actions/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();
  await connectDb();
  const me = await User.findById(session.sub);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="flex items-center gap-2 font-semibold">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                R
              </span>
              <span>Room Expenses</span>
              <span className="ml-2 rounded-full bg-surface-muted px-2 py-0.5 text-xs text-muted">
                Admin
              </span>
            </Link>
            <nav className="flex gap-4 text-sm">
              {session.role === "owner" ? (
                <Link href="/admin/rooms" className="text-muted hover:text-foreground">
                  Rooms
                </Link>
              ) : null}
              <Link href="/admin/users" className="text-muted hover:text-foreground">
                Users
              </Link>
              <Link href="/admin/groups" className="text-muted hover:text-foreground">
                Groups
              </Link>
              <Link href="/expenses/month" className="text-muted hover:text-foreground">
                Expenses
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted">{me?.name ?? session.sub}</span>
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-md border border-border bg-surface-muted px-3 py-1.5 hover:bg-border"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
