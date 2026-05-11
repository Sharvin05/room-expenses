"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export type SwitchableUser = { id: string; name: string };

export default function UserSwitcher({
  users,
  selfId,
  viewedUserId,
  year,
  month,
}: {
  users: SwitchableUser[];
  selfId: string;
  viewedUserId: string;
  year: number;
  month: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function navigate(asId: string) {
    const params = new URLSearchParams();
    params.set("y", String(year));
    params.set("m", String(month));
    if (asId !== selfId) params.set("as", asId);
    start(() => router.push(`/dashboard?${params.toString()}`));
  }

  const sortedUsers = [...users].sort((a, b) => {
    if (a.id === selfId) return -1;
    if (b.id === selfId) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <section className="rounded-2xl border border-border bg-surface px-5 py-4">
      <label className="flex flex-wrap items-center gap-3 text-sm">
        <span className="font-medium">Viewing dashboard as</span>
        <select
          value={viewedUserId}
          onChange={(e) => navigate(e.target.value)}
          disabled={pending}
          className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
        >
          {sortedUsers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.id === selfId ? `${u.name} (you)` : u.name}
            </option>
          ))}
        </select>
        {viewedUserId !== selfId ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            admin view
          </span>
        ) : null}
      </label>
    </section>
  );
}
