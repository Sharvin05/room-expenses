"use client";

import { useActionState, useState, useTransition, useMemo } from "react";
import { createUserAction, deleteUserAction, type ActionResult } from "@/lib/actions/admin";

type Room = { id: string; name: string };
type Group = { id: string; name: string; roomId: string };
type Row = {
  id: string;
  email: string;
  name: string;
  role: "user" | "roomAdmin" | "owner";
  roomId: string | null;
  groupIds: string[];
};

export default function UsersClient({
  isOwner,
  rooms,
  groups,
  users,
}: {
  isOwner: boolean;
  rooms: Room[];
  groups: Group[];
  users: Row[];
}) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    createUserAction,
    null,
  );
  const [deleting, startDelete] = useTransition();
  const [selectedRoomId, setSelectedRoomId] = useState<string>(
    isOwner ? rooms[0]?.id ?? "" : rooms[0]?.id ?? "",
  );

  const groupsForSelectedRoom = useMemo(
    () => groups.filter((g) => g.roomId === selectedRoomId),
    [groups, selectedRoomId],
  );

  const roomNameById = useMemo(() => new Map(rooms.map((r) => [r.id, r.name])), [rooms]);
  const groupNameById = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups]);

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold">Users</h1>
        <p className="text-sm text-muted">
          {isOwner ? "All users across all rooms." : "Users in your room."}
        </p>
      </header>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-medium">Add user</h2>
        {rooms.length === 0 ? (
          <p className="text-sm text-muted">Create a room first.</p>
        ) : (
          <form action={action} className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">Name</span>
              <input
                name="name"
                required
                className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">Email</span>
              <input
                name="email"
                type="email"
                required
                className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">Password</span>
              <input
                name="password"
                type="text"
                required
                minLength={6}
                placeholder="min 6 chars"
                className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">Role</span>
              <select
                name="role"
                defaultValue="user"
                className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="user">User</option>
                <option value="roomAdmin">Room admin</option>
              </select>
            </label>
            {isOwner ? (
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium">Room</span>
                <select
                  name="roomId"
                  required
                  value={selectedRoomId}
                  onChange={(e) => setSelectedRoomId(e.target.value)}
                  className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <fieldset className="flex flex-col gap-1.5 text-sm sm:col-span-2">
              <legend className="font-medium">Groups (optional)</legend>
              {groupsForSelectedRoom.length === 0 ? (
                <p className="text-xs text-muted">No groups in this room yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {groupsForSelectedRoom.map((g) => (
                    <label
                      key={g.id}
                      className="flex items-center gap-2 rounded-md border border-border bg-surface-muted px-3 py-1.5"
                    >
                      <input type="checkbox" name="groupIds" value={g.id} />
                      <span>{g.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
            <div className="sm:col-span-2 flex items-center justify-between gap-3">
              {state && state.ok === false ? (
                <p className="text-sm text-red-600">{state.error}</p>
              ) : (
                <span />
              )}
              <button
                type="submit"
                disabled={pending}
                className="rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-60 px-4 py-2 text-sm font-medium"
              >
                {pending ? "Adding…" : "Add user"}
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-surface">
        <header className="border-b border-border px-5 py-3 text-sm font-medium">Existing</header>
        {users.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">No users yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {users.map((u) => (
              <li key={u.id} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">
                    {u.name} <span className="text-muted">·</span>{" "}
                    <span className="text-sm text-muted">{u.email}</span>
                  </p>
                  <p className="text-xs text-muted">
                    {u.role}
                    {isOwner && u.roomId ? ` · ${roomNameById.get(u.roomId) ?? u.roomId}` : ""}
                    {u.groupIds.length
                      ? ` · ${u.groupIds.map((id) => groupNameById.get(id) ?? id).join(", ")}`
                      : ""}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={deleting}
                  className="text-sm text-red-600 hover:underline disabled:opacity-50"
                  onClick={() => {
                    if (confirm(`Remove ${u.name}?`)) {
                      startDelete(async () => {
                        await deleteUserAction(u.id);
                      });
                    }
                  }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
