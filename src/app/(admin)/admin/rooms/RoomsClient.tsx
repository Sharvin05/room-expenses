"use client";

import { useActionState, useTransition } from "react";
import { createRoomAction, deleteRoomAction, type ActionResult } from "@/lib/actions/admin";

type Row = { id: string; name: string; createdAt: string | null };

export default function RoomsClient({ initial }: { initial: Row[] }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    createRoomAction,
    null,
  );
  const [deletingId, startDelete] = useTransition();

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold">Rooms</h1>
        <p className="text-sm text-muted">Owner-only. Each room is a separate household / building.</p>
      </header>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-medium">Create new room</h2>
        <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1.5 text-sm">
            <span className="font-medium">Name</span>
            <input
              name="name"
              required
              className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-60 px-4 py-2 text-sm font-medium"
          >
            {pending ? "Creating…" : "Create"}
          </button>
        </form>
        {state && state.ok === false ? (
          <p className="mt-3 text-sm text-red-600">{state.error}</p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-border bg-surface">
        <header className="border-b border-border px-5 py-3 text-sm font-medium">Existing</header>
        {initial.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">No rooms yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {initial.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="font-medium">{r.name}</p>
                  {r.createdAt ? (
                    <p className="text-xs text-muted">
                      Created {new Date(r.createdAt).toLocaleDateString()}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="text-sm text-red-600 hover:underline disabled:opacity-50"
                  disabled={deletingId}
                  onClick={() => {
                    if (
                      confirm(
                        `Delete "${r.name}"? This removes ALL users, groups, and expenses in that room.`,
                      )
                    ) {
                      startDelete(async () => {
                        await deleteRoomAction(r.id);
                      });
                    }
                  }}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
