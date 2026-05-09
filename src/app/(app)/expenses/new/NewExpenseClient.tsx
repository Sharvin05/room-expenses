"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { aedInputToFils } from "@/lib/format/currency";
import { createExpenseAction } from "@/lib/actions/expenses";
import type { UserRole } from "@/lib/db/models/User";
import ExpensesPanel, { type ExpenseItem } from "./ExpensesPanel";

type Group = { id: string; name: string; memberIds: string[] };
type User = { id: string; name: string };

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function NewExpenseClient({
  currentUserId,
  role,
  groups,
  users,
  monthExpenses,
  selectedYear,
  selectedMonth,
  prevMonth,
  nextMonth,
}: {
  currentUserId: string;
  role: UserRole;
  groups: Group[];
  users: User[];
  monthExpenses: ExpenseItem[];
  selectedYear: number;
  selectedMonth: number;
  prevMonth: { y: number; m: number } | null;
  nextMonth: { y: number; m: number } | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [amount, setAmount] = useState("");
  const [shopName, setShopName] = useState("");
  const [date, setDate] = useState<string>(todayIso());
  const [mode, setMode] = useState<"group" | "individuals">(groups.length ? "group" : "individuals");
  const [groupId, setGroupId] = useState<string>(groups[0]?.id ?? "");
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [includeSelf, setIncludeSelf] = useState(true);

  const otherUsers = useMemo(
    () => users.filter((u) => u.id !== currentUserId),
    [users, currentUserId],
  );

  function submit() {
    setError(null);
    const fils = aedInputToFils(amount);
    if (fils === null || fils < 1) {
      setError("Enter a valid amount");
      return;
    }
    if (!shopName.trim()) {
      setError("Shop name is required");
      return;
    }
    if (mode === "group" && !groupId) {
      setError("Pick a group");
      return;
    }
    if (mode === "individuals" && participantIds.length === 0 && !includeSelf) {
      setError("Pick at least one participant");
      return;
    }

    start(async () => {
      const result = await createExpenseAction({
        amountFils: fils,
        shopName: shopName.trim(),
        date,
        mode,
        groupId: mode === "group" ? groupId : undefined,
        participantIds: mode === "individuals" ? participantIds : undefined,
        includeSelf,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAmount("");
      setShopName("");
      setDate(todayIso());
      setMode(groups.length ? "group" : "individuals");
      setGroupId(groups[0]?.id ?? "");
      setParticipantIds([]);
      setIncludeSelf(true);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Add expense</h1>
        <p className="text-sm text-muted">
          You paid for this. Pick who to split it with — your share is computed automatically.
        </p>
      </header>

      <div className="rounded-2xl border border-border bg-surface p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Amount (AED)</span>
            <input
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Shop / restaurant</span>
            <input
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <div className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Split between</span>
            <div className="flex rounded-md border border-border bg-surface-muted p-1 text-sm">
              <button
                type="button"
                disabled={groups.length === 0}
                onClick={() => setMode("group")}
                className={`flex-1 rounded px-3 py-1.5 ${
                  mode === "group"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted hover:text-foreground disabled:opacity-50"
                }`}
              >
                Group
              </button>
              <button
                type="button"
                onClick={() => setMode("individuals")}
                className={`flex-1 rounded px-3 py-1.5 ${
                  mode === "individuals"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted hover:text-foreground"
                }`}
              >
                Individuals
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4">
          {mode === "group" ? (
            groups.length === 0 ? (
              <p className="text-sm text-muted">No groups in your room. Ask your admin to create one.</p>
            ) : (
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium">Group</span>
                <select
                  value={groupId}
                  onChange={(e) => setGroupId(e.target.value)}
                  className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.memberIds.length})
                    </option>
                  ))}
                </select>
              </label>
            )
          ) : (
            <fieldset className="flex flex-col gap-2 text-sm">
              <legend className="font-medium">Participants</legend>
              <div className="flex flex-wrap gap-2">
                {otherUsers.length === 0 ? (
                  <p className="text-xs text-muted">No other users in your room yet.</p>
                ) : (
                  otherUsers.map((u) => {
                    const checked = participantIds.includes(u.id);
                    return (
                      <label
                        key={u.id}
                        className={`flex items-center gap-2 rounded-md border px-3 py-1.5 ${
                          checked
                            ? "border-primary bg-surface-muted"
                            : "border-border bg-surface-muted"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setParticipantIds((prev) =>
                              e.target.checked ? [...prev, u.id] : prev.filter((id) => id !== u.id),
                            )
                          }
                        />
                        <span>{u.name}</span>
                      </label>
                    );
                  })
                )}
              </div>
            </fieldset>
          )}
        </div>

        {mode === "individuals" ? (
          <label className="mt-4 inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includeSelf}
              onChange={(e) => setIncludeSelf(e.target.checked)}
            />
            Include me in the split
          </label>
        ) : null}

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-60 px-5 py-2 text-sm font-medium"
          >
            {pending ? "Saving…" : "Save expense"}
          </button>
        </div>
      </div>

      <ExpensesPanel
        currentUserId={currentUserId}
        role={role}
        members={users}
        groups={groups}
        expenses={monthExpenses}
        selectedYear={selectedYear}
        selectedMonth={selectedMonth}
        prevMonth={prevMonth}
        nextMonth={nextMonth}
      />
    </div>
  );
}
