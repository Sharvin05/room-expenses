import Link from "next/link";
import { redirect } from "next/navigation";
import { connectDb } from "@/lib/db/connect";
import { User } from "@/lib/db/models/User";
import { requireUser } from "@/lib/auth/session";
import { logoutAction } from "@/lib/actions/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireUser();
  if (!session.roomId) redirect("/admin");

  await connectDb();
  const me = await User.findById(session.sub);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                R
              </span>
              <span>Room Expenses</span>
            </Link>
            <nav className="flex gap-4 text-sm">
              <Link href="/dashboard" className="text-muted hover:text-foreground">
                Dashboard
              </Link>
              <Link href="/expenses/new" className="text-muted hover:text-foreground">
                Add expense
              </Link>
              <Link href="/expenses/month" className="text-muted hover:text-foreground">
                This month
              </Link>
              <Link href="/expenses/history" className="text-muted hover:text-foreground">
                History
              </Link>
              {session.role !== "user" ? (
                <Link href="/admin" className="text-muted hover:text-foreground">
                  Admin
                </Link>
              ) : null}
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
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
