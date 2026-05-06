"use client";

import { useState, useTransition } from "react";
import { aedInputToFils, filsToAed } from "@/lib/format/currency";
import {
  cancelTransferAction,
  confirmTransferAction,
  recordTransferAction,
  rejectTransferAction,
} from "@/lib/actions/transfers";
import type { SettlementRow, TransferLite } from "@/lib/money/bills";

export default function SettleUpPanel({
  billId,
  rows,
  currentUserId,
  userNameById,
}: {
  billId: string;
  rows: SettlementRow[];
  currentUserId: string;
  userNameById: Record<string, string>;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface">
      <header className="border-b border-border px-5 py-3 text-sm font-medium">Settle up</header>
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted">Already settled.</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((row) => (
            <SettleRow
              key={`${row.fromUserId}-${row.toUserId}`}
              billId={billId}
              row={row}
              currentUserId={currentUserId}
              fromName={userNameById[row.fromUserId] ?? row.fromUserId}
              toName={userNameById[row.toUserId] ?? row.toUserId}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function SettleRow({
  billId,
  row,
  currentUserId,
  fromName,
  toName,
}: {
  billId: string;
  row: SettlementRow;
  currentUserId: string;
  fromName: string;
  toName: string;
}) {
  const isSender = row.fromUserId === currentUserId;
  const isRecipient = row.toUserId === currentUserId;
  const [recordOpen, setRecordOpen] = useState(false);

  const status: "settled" | "overpaid" | "partial" | "open" = row.overpaid
    ? "overpaid"
    : row.settled
      ? "settled"
      : row.paidAmount > 0
        ? "partial"
        : "open";

  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm">
            <span className="font-medium">{fromName}</span>{" "}
            <span className="text-muted">pays</span>{" "}
            <span className="font-medium">{toName}</span>
          </p>
          <p className="mt-0.5 text-xs text-muted">
            owed {filsToAed(row.owedAmount)}
            {row.paidAmount !== 0 ? ` · paid ${filsToAed(row.paidAmount)}` : ""}
            {row.pendingAmount !== 0 ? ` · pending ${filsToAed(row.pendingAmount)}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusPill status={status} />
          <p className="font-semibold">{filsToAed(row.outstandingAmount)}</p>
          {isSender && !row.settled ? (
            <button
              type="button"
              onClick={() => setRecordOpen((v) => !v)}
              className="rounded-md border border-border bg-surface-muted px-3 py-1.5 text-sm hover:bg-border"
            >
              {recordOpen ? "Close" : "Record payment"}
            </button>
          ) : null}
        </div>
      </div>

      {isSender && recordOpen ? (
        <RecordForm
          billId={billId}
          toUserId={row.toUserId}
          maxAmount={Math.max(row.outstandingAmount, row.owedAmount)}
          onDone={() => setRecordOpen(false)}
        />
      ) : null}

      {row.pendingTransfers.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2">
          {row.pendingTransfers.map((t) => (
            <PendingTransferItem
              key={t.id}
              transfer={t}
              fromName={t.fromUserId === row.fromUserId ? fromName : toName}
              toName={t.toUserId === row.toUserId ? toName : fromName}
              isRecipient={t.toUserId === currentUserId || isRecipient}
              isOwnSubmission={t.fromUserId === currentUserId}
            />
          ))}
        </ul>
      ) : null}

      {row.confirmedTransfers.length > 0 ? (
        <details className="mt-2 text-xs text-muted">
          <summary className="cursor-pointer">
            {row.confirmedTransfers.length} confirmed payment{row.confirmedTransfers.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-2 flex flex-col gap-1 pl-2">
            {row.confirmedTransfers.map((t) => (
              <li key={t.id}>
                {t.fromUserId === row.fromUserId ? fromName : toName} → {t.toUserId === row.toUserId ? toName : fromName} ·{" "}
                {filsToAed(t.amount)}
                {t.note ? ` · "${t.note}"` : ""}
                {t.resolvedAt ? ` · ${new Date(t.resolvedAt).toLocaleDateString()}` : ""}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </li>
  );
}

function StatusPill({ status }: { status: "settled" | "overpaid" | "partial" | "open" }) {
  const styles: Record<typeof status, string> = {
    settled: "bg-emerald-100 text-emerald-700 border-emerald-300",
    overpaid: "bg-blue-100 text-blue-700 border-blue-300",
    partial: "bg-amber-100 text-amber-800 border-amber-300",
    open: "bg-surface-muted text-muted border-border",
  };
  const labels: Record<typeof status, string> = {
    settled: "Settled",
    overpaid: "Overpaid",
    partial: "Partial",
    open: "Open",
  };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function RecordForm({
  billId,
  toUserId,
  maxAmount,
  onDone,
}: {
  billId: string;
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
      const result = await recordTransferAction({
        billId,
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
  fromName,
  toName,
  isRecipient,
  isOwnSubmission,
}: {
  transfer: TransferLite;
  fromName: string;
  toName: string;
  isRecipient: boolean;
  isOwnSubmission: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

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
          <span className="font-medium">{fromName}</span>{" "}
          <span className="text-muted">paid</span>{" "}
          <span className="font-medium">{toName}</span> · {filsToAed(transfer.amount)}
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
