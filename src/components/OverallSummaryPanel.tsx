"use client";

import { useState, useTransition } from "react";
import { aedInputToFils, filsToAed } from "@/lib/format/currency";
import {
  cancelTransferAction,
  confirmTransferAction,
  recordOverallTransferAction,
  rejectTransferAction,
} from "@/lib/actions/transfers";
import type {
  CounterpartSummary,
  OverallBalance,
  TransferLite,
  UserTransferRow,
} from "@/lib/money/overall";

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export default function OverallSummaryPanel({
  balance,
  recentTransfers,
  userNameById,
  currentUserId,
}: {
  balance: OverallBalance;
  recentTransfers: UserTransferRow[];
  userNameById: Map<string, string>;
  currentUserId: string;
}) {
  const nameOf = (id: string) => userNameById.get(id) ?? id;

  return (
    <section className="rounded-2xl border border-border bg-surface">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-5 py-3">
        <div>
          <h2 className="text-sm font-medium">Overall balance</h2>
          <p className="text-xs text-muted">Across all months · the place to settle up</p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-muted">Paid so far</p>
          <p className="text-lg font-semibold">{filsToAed(balance.totalPaidByMe)}</p>
        </div>
      </header>

      <div className="grid gap-px bg-border sm:grid-cols-2">
        <BalanceColumn
          label="You owe"
          total={balance.youOwe.total}
          rows={balance.youOwe.perCreditor}
          tone="negative"
          emptyText="You're all settled up."
          nameOf={nameOf}
          currentUserId={currentUserId}
          canRecord
        />
        <BalanceColumn
          label="You're owed"
          total={balance.owedToYou.total}
          rows={balance.owedToYou.perDebtor}
          tone="positive"
          emptyText="Nobody owes you right now."
          nameOf={nameOf}
          currentUserId={currentUserId}
          canRecord={false}
        />
      </div>

      <div className="border-t border-border">
        <header className="flex items-center justify-between px-5 py-3">
          <h3 className="text-sm font-medium">Recent transactions</h3>
        </header>
        {recentTransfers.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted">No payments recorded yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {recentTransfers.map((t) => {
              const isOutgoing = t.fromUserId === currentUserId;
              const counterpartId = isOutgoing ? t.toUserId : t.fromUserId;
              const date = t.resolvedAt ?? t.declaredAt;
              return (
                <li key={t.id} className="flex items-center justify-between px-5 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {isOutgoing
                        ? `You paid ${nameOf(counterpartId)}`
                        : `${nameOf(counterpartId)} paid you`}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {MONTH_SHORT[t.month - 1] ?? "—"} {t.year || ""} ·{" "}
                      {new Date(date).toLocaleDateString()}
                      {t.note ? ` · ${t.note}` : ""}
                    </p>
                  </div>
                  <p
                    className={`font-semibold ${isOutgoing ? "text-red-600" : "text-emerald-600"}`}
                  >
                    {isOutgoing ? "−" : "+"}
                    {filsToAed(t.amount)}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function BalanceColumn({
  label,
  total,
  rows,
  tone,
  emptyText,
  nameOf,
  currentUserId,
  canRecord,
}: {
  label: string;
  total: number;
  rows: CounterpartSummary[];
  tone: "positive" | "negative";
  emptyText: string;
  nameOf: (id: string) => string;
  currentUserId: string;
  canRecord: boolean;
}) {
  const totalTone =
    total === 0
      ? "text-foreground"
      : tone === "positive"
        ? "text-emerald-600"
        : "text-red-600";

  return (
    <div className="bg-surface p-5">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${totalTone}`}>{filsToAed(total)}</p>
      {rows.length === 0 ? (
        <p className="mt-3 text-xs text-muted">{emptyText}</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {rows.map((row) => (
            <CounterpartRow
              key={row.userId}
              row={row}
              nameOf={nameOf}
              tone={tone}
              currentUserId={currentUserId}
              canRecord={canRecord}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function CounterpartRow({
  row,
  nameOf,
  tone,
  currentUserId,
  canRecord,
}: {
  row: CounterpartSummary;
  nameOf: (id: string) => string;
  tone: "positive" | "negative";
  currentUserId: string;
  canRecord: boolean;
}) {
  const [recordOpen, setRecordOpen] = useState(false);
  const amountTone = tone === "positive" ? "text-emerald-600" : "text-red-600";
  const totalActivity = row.paidByMe + row.paidByThem;
  const showRecord = canRecord && row.netOutstanding > 0;

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{nameOf(row.userId)}</p>
          {totalActivity > 0 ? (
            <p className="text-xs text-muted">
              {row.paidByMe > 0 ? `you paid ${filsToAed(row.paidByMe)}` : null}
              {row.paidByMe > 0 && row.paidByThem > 0 ? " · " : ""}
              {row.paidByThem > 0 ? `they paid ${filsToAed(row.paidByThem)}` : null}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <p className={`font-semibold ${amountTone}`}>{filsToAed(row.netOutstanding)}</p>
          {showRecord ? (
            <button
              type="button"
              onClick={() => setRecordOpen((v) => !v)}
              className="rounded-md border border-border bg-surface-muted px-3 py-1.5 text-xs hover:bg-border"
            >
              {recordOpen ? "Close" : "Record payment"}
            </button>
          ) : null}
        </div>
      </div>

      {showRecord && recordOpen ? (
        <RecordForm
          toUserId={row.userId}
          maxAmount={row.netOutstanding}
          onDone={() => setRecordOpen(false)}
        />
      ) : null}

      {row.pending.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2">
          {row.pending.map((t) => (
            <PendingTransferItem
              key={t.id}
              transfer={t}
              nameOf={nameOf}
              currentUserId={currentUserId}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function RecordForm({
  toUserId,
  maxAmount,
  onDone,
}: {
  toUserId: string;
  maxAmount: number;
  onDone: () => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState(() => (maxAmount / 100).toFixed(2));
  const [note, setNote] = useState("");

  function submit() {
    setError(null);
    const fils = aedInputToFils(amount);
    if (fils === null || fils < 1) {
      setError("Enter a valid amount");
      return;
    }
    start(async () => {
      const result = await recordOverallTransferAction({
        toUserId,
        amount: fils,
        note: note.trim() || undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onDone();
    });
  }

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-md border border-border bg-surface-muted p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Amount paid (AED)</span>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Note (optional)</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Venmo, cash on May 6"
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onDone}
          disabled={pending}
          className="rounded-md border border-border bg-surface px-4 py-2 text-sm hover:bg-surface-muted disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Recording…" : "Record payment"}
        </button>
      </div>
    </div>
  );
}

function PendingTransferItem({
  transfer,
  nameOf,
  currentUserId,
}: {
  transfer: TransferLite;
  nameOf: (id: string) => string;
  currentUserId: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isRecipient = transfer.toUserId === currentUserId;
  const isOwnSubmission = transfer.fromUserId === currentUserId;

  function run(action: () => Promise<{ ok: true; id: string } | { ok: false; error: string }>) {
    setError(null);
    start(async () => {
      const result = await action();
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
      <div className="min-w-0">
        <p>
          <span className="font-medium">{nameOf(transfer.fromUserId)}</span>{" "}
          <span className="text-muted">paid</span>{" "}
          <span className="font-medium">{nameOf(transfer.toUserId)}</span> ·{" "}
          {filsToAed(transfer.amount)}
        </p>
        <p className="text-xs text-muted">
          declared {new Date(transfer.declaredAt).toLocaleDateString()}
          {transfer.note ? ` · "${transfer.note}"` : ""}
        </p>
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
      </div>
      <div className="flex gap-2">
        {isRecipient ? (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => confirmTransferAction(transfer.id))}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              Confirm
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => rejectTransferAction(transfer.id))}
              className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
            >
              Reject
            </button>
          </>
        ) : isOwnSubmission ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!confirm("Cancel this pending payment?")) return;
              run(() => cancelTransferAction(transfer.id));
            }}
            className="rounded-md border border-border bg-white px-3 py-1.5 text-xs hover:bg-surface-muted disabled:opacity-60"
          >
            Cancel
          </button>
        ) : (
          <span className="text-xs text-muted">awaiting confirmation</span>
        )}
      </div>
    </li>
  );
}
