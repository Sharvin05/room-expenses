"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { aedInputToFils, filsToAed } from "@/lib/format/currency";
import { deleteExpenseAction, updateExpenseAction } from "@/lib/actions/expenses";
import type { UserRole } from "@/lib/db/models/User";

export type Member = { id: string; name: string };
export type GroupOption = { id: string; name: string; memberIds: string[] };
export type ExpenseItem = {
  id: string;
  amount: number;
  shopName: string;
  payerId: string;
  participantIds: string[];
  groupId: string | null;
  date: string;
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function ExpensesPanel({
  currentUserId,
  role,
  members,
  groups,
  expenses,
  selectedYear,
  selectedMonth,
  prevMonth,
  nextMonth,
}: {
  currentUserId: string;
  role: UserRole;
  members: Member[];
  groups: GroupOption[];
  expenses: ExpenseItem[];
  selectedYear: number;
  selectedMonth: number;
  prevMonth: { y: number; m: number } | null;
  nextMonth: { y: number; m: number } | null;
}) {
  const isAdmin = role === "owner" || role === "roomAdmin";
  const tabs = useMemo(() => {
    const me = members.find((m) => m.id === currentUserId);
    const others = members.filter((m) => m.id !== currentUserId);
    return me ? [me, ...others] : members;
  }, [members, currentUserId]);

  const [activeTabId, setActiveTabId] = useState<string>(currentUserId);
  const [editingId, setEditingId] = useState<string | null>(null);

  const tabUserId = isAdmin ? activeTabId : currentUserId;
  const tabUserName = members.find((m) => m.id === tabUserId)?.name ?? "user";
  const memberNameById = useMemo(
    () => new Map(members.map((m) => [m.id, m.name])),
    [members],
  );

  const paidBy = expenses.filter((e) => e.payerId === tabUserId);
  const splitsIn = expenses.filter(
    (e) => e.payerId !== tabUserId && e.participantIds.includes(tabUserId),
  );

  const canEdit = (e: ExpenseItem) => isAdmin || e.payerId === currentUserId;
  const monthLabel = `${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`;

  return (
    <section className="rounded-2xl border border-border bg-surface p-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Expenses · {monthLabel}</h2>
          <p className="text-sm text-muted">
            {isAdmin
              ? "Pick a member to view what they paid and what they owe."
              : "What you paid this month and the splits you're in."}
          </p>
        </div>
        <div className="flex gap-2">
          {prevMonth ? (
            <Link
              href={`/expenses/new?y=${prevMonth.y}&m=${prevMonth.m}`}
              className="rounded-md border border-border bg-surface-muted px-3 py-1.5 text-sm hover:bg-border"
            >
              ← Prev
            </Link>
          ) : null}
          {nextMonth ? (
            <Link
              href={`/expenses/new?y=${nextMonth.y}&m=${nextMonth.m}`}
              className="rounded-md border border-border bg-surface-muted px-3 py-1.5 text-sm hover:bg-border"
            >
              Next →
            </Link>
          ) : null}
        </div>
      </header>

      {isAdmin ? (
        <div className="mb-4 flex flex-wrap gap-2 border-b border-border pb-4">
          {tabs.map((m) => {
            const active = activeTabId === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setActiveTabId(m.id);
                  setEditingId(null);
                }}
                className={`rounded-md border px-3 py-1.5 text-sm ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-surface-muted text-foreground hover:border-primary"
                }`}
              >
                {m.id === currentUserId ? `${m.name} (me)` : m.name}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="flex flex-col gap-6">
        <ExpenseList
          title={`Paid by ${tabUserName}`}
          empty={`Nothing paid by ${tabUserName} this month.`}
          expenses={paidBy}
          editingId={editingId}
          setEditingId={setEditingId}
          canEdit={canEdit}
          memberNameById={memberNameById}
          members={members}
          groups={groups}
        />
        <ExpenseList
          title={`Splits ${tabUserName} is in`}
          empty={`${tabUserName} isn't in any other splits this month.`}
          expenses={splitsIn}
          editingId={editingId}
          setEditingId={setEditingId}
          canEdit={canEdit}
          memberNameById={memberNameById}
          members={members}
          groups={groups}
        />
      </div>
    </section>
  );
}

function ExpenseList({
  title,
  empty,
  expenses,
  editingId,
  setEditingId,
  canEdit,
  memberNameById,
  members,
  groups,
}: {
  title: string;
  empty: string;
  expenses: ExpenseItem[];
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  canEdit: (e: ExpenseItem) => boolean;
  memberNameById: Map<string, string>;
  members: Member[];
  groups: GroupOption[];
}) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      {expenses.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border bg-surface-muted">
          {expenses.map((e) =>
            editingId === e.id ? (
              <li key={e.id} className="px-4 py-3">
                <ExpenseEditForm
                  expense={e}
                  members={members}
                  groups={groups}
                  payerName={memberNameById.get(e.payerId) ?? "payer"}
                  onClose={() => setEditingId(null)}
                />
              </li>
            ) : (
              <li
                key={e.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">{e.shopName}</p>
                  <p className="text-xs text-muted">
                    {new Date(e.date).toLocaleDateString()} · paid by{" "}
                    {memberNameById.get(e.payerId) ?? "?"} · {e.participantIds.length} ppl
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="font-semibold">{filsToAed(e.amount)}</p>
                  {canEdit(e) ? (
                    <button
                      type="button"
                      onClick={() => setEditingId(e.id)}
                      className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm hover:border-primary"
                    >
                      Edit
                    </button>
                  ) : null}
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}

function ExpenseEditForm({
  expense,
  members,
  groups,
  payerName,
  onClose,
}: {
  expense: ExpenseItem;
  members: Member[];
  groups: GroupOption[];
  payerName: string;
  onClose: () => void;
}) {
  const initialMode: "group" | "individuals" = expense.groupId ? "group" : "individuals";
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [amount, setAmount] = useState(() => (expense.amount / 100).toFixed(2));
  const [shopName, setShopName] = useState(expense.shopName);
  const [date, setDate] = useState(() => expense.date.slice(0, 10));
  const [mode, setMode] = useState<"group" | "individuals">(initialMode);
  const [groupId, setGroupId] = useState<string>(
    expense.groupId ?? groups[0]?.id ?? "",
  );

  const payerInParticipants = expense.participantIds.includes(expense.payerId);
  const initialIndividuals = expense.participantIds.filter((id) => id !== expense.payerId);
  const [participantIds, setParticipantIds] = useState<string[]>(initialIndividuals);
  const [includePayer, setIncludePayer] = useState<boolean>(payerInParticipants);

  const otherMembers = members.filter((m) => m.id !== expense.payerId);

  function save() {
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
    if (mode === "individuals" && participantIds.length === 0 && !includePayer) {
      setError("Pick at least one participant");
      return;
    }

    start(async () => {
      const result = await updateExpenseAction(expense.id, {
        amountFils: fils,
        shopName: shopName.trim(),
        date,
        mode,
        groupId: mode === "group" ? groupId : undefined,
        participantIds: mode === "individuals" ? participantIds : undefined,
        includeSelf: includePayer,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
    });
  }

  function remove() {
    if (!confirm(`Delete expense "${expense.shopName}"?`)) return;
    setError(null);
    start(async () => {
      const result = await deleteExpenseAction(expense.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Amount (AED)</span>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Shop / restaurant</span>
          <input
            value={shopName}
            onChange={(e) => setShopName(e.target.value)}
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        <div className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Split between</span>
          <div className="flex rounded-md border border-border bg-surface p-1 text-sm">
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

      {mode === "group" ? (
        groups.length === 0 ? (
          <p className="text-sm text-muted">No groups in this room.</p>
        ) : (
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Group</span>
            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
            {otherMembers.length === 0 ? (
              <p className="text-xs text-muted">No other room members.</p>
            ) : (
              otherMembers.map((m) => {
                const checked = participantIds.includes(m.id);
                return (
                  <label
                    key={m.id}
                    className={`flex items-center gap-2 rounded-md border px-3 py-1.5 ${
                      checked
                        ? "border-primary bg-surface"
                        : "border-border bg-surface"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        setParticipantIds((prev) =>
                          e.target.checked
                            ? [...prev, m.id]
                            : prev.filter((id) => id !== m.id),
                        )
                      }
                    />
                    <span>{m.name}</span>
                  </label>
                );
              })
            )}
          </div>
        </fieldset>
      )}

      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={includePayer}
          onChange={(e) => setIncludePayer(e.target.checked)}
        />
        Include {payerName} in the split
      </label>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          className="rounded-md border border-red-300 bg-surface px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-60"
        >
          Delete
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-md border border-border bg-surface px-4 py-2 text-sm hover:bg-surface-muted disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
