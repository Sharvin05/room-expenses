"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import {
  createGroupAction,
  deleteGroupAction,
  updateGroupMembersAction,
  type ActionResult,
} from "@/lib/actions/admin";

type Room = { id: string; name: string };
type Group = { id: string; name: string; roomId: string; memberIds: string[] };
type User = { id: string; name: string; email: string; roomId: string | null };

export default function GroupsClient({
  isOwner,
  rooms,
  groups,
  users,
}: {
  isOwner: boolean;
  rooms: Room[];
  groups: Group[];
  users: User[];
}) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    createGroupAction,
    null,
  );
  const [busy, startBusy] = useTransition();
  const [createRoomId, setCreateRoomId] = useState<string>(rooms[0]?.id ?? "");

  const usersByRoom = useMemo(() => {
    const map = new Map<string, User[]>();
    for (const u of users) {
      if (!u.roomId) continue;
      const list = map.get(u.roomId) ?? [];
      list.push(u);
      map.set(u.roomId, list);
    }
    return map;
  }, [users]);

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold">Groups</h1>
        <p className="text-sm text-muted">
          Groups bundle users so an expense can be split among everyone at once.
        </p>
      </header>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-medium">Create new group</h2>
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
            {isOwner ? (
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium">Room</span>
                <select
                  name="roomId"
                  required
                  value={createRoomId}
                  onChange={(e) => setCreateRoomId(e.target.value)}
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
              <legend className="font-medium">Members (optional)</legend>
              <div className="flex flex-wrap gap-2">
                {(usersByRoom.get(createRoomId) ?? []).map((u) => (
                  <label
                    key={u.id}
                    className="flex items-center gap-2 rounded-md border border-border bg-surface-muted px-3 py-1.5"
                  >
                    <input type="checkbox" name="memberIds" value={u.id} />
                    <span>{u.name}</span>
                  </label>
                ))}
                {(usersByRoom.get(createRoomId) ?? []).length === 0 ? (
                  <p className="text-xs text-muted">No users in this room yet.</p>
                ) : null}
              </div>
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
                {pending ? "Creating…" : "Create group"}
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-surface">
        <header className="border-b border-border px-5 py-3 text-sm font-medium">Existing</header>
        {groups.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">No groups yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {groups.map((g) => (
              <GroupRow
                key={g.id}
                group={g}
                roomName={rooms.find((r) => r.id === g.roomId)?.name ?? "?"}
                allRoomUsers={usersByRoom.get(g.roomId) ?? []}
                busy={busy}
                onDelete={() => {
                  if (confirm(`Delete group "${g.name}"?`)) {
                    startBusy(async () => {
                      await deleteGroupAction(g.id);
                    });
                  }
                }}
                onSaveMembers={(memberIds) => {
                  startBusy(async () => {
                    await updateGroupMembersAction(g.id, memberIds);
                  });
                }}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function GroupRow({
  group,
  roomName,
  allRoomUsers,
  busy,
  onDelete,
  onSaveMembers,
}: {
  group: Group;
  roomName: string;
  allRoomUsers: User[];
  busy: boolean;
  onDelete: () => void;
  onSaveMembers: (memberIds: string[]) => void;
}) {
  const [memberIds, setMemberIds] = useState<string[]>(group.memberIds);
  const dirty = useMemo(() => {
    const a = [...memberIds].sort().join(",");
    const b = [...group.memberIds].sort().join(",");
    return a !== b;
  }, [memberIds, group.memberIds]);

  return (
    <li className="px-5 py-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{group.name}</p>
          <p className="text-xs text-muted">{roomName}</p>
        </div>
        <div className="flex items-center gap-3">
          {dirty ? (
            <button
              type="button"
              disabled={busy}
              className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm hover:opacity-90 disabled:opacity-50"
              onClick={() => onSaveMembers(memberIds)}
            >
              Save
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy}
            className="text-sm text-red-600 hover:underline disabled:opacity-50"
            onClick={onDelete}
          >
            Delete
          </button>
        </div>
      </div>
      {allRoomUsers.length === 0 ? (
        <p className="text-xs text-muted">No users in this room yet.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {allRoomUsers.map((u) => {
            const checked = memberIds.includes(u.id);
            return (
              <label
                key={u.id}
                className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm ${
                  checked ? "border-primary bg-surface-muted" : "border-border bg-surface-muted"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    setMemberIds((prev) =>
                      e.target.checked ? [...prev, u.id] : prev.filter((id) => id !== u.id),
                    );
                  }}
                />
                <span>{u.name}</span>
              </label>
            );
          })}
        </div>
      )}
    </li>
  );
}
