"use server";

import { Types } from "mongoose";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { connectDb } from "@/lib/db/connect";
import { Transfer } from "@/lib/db/models/Transfer";
import { User } from "@/lib/db/models/User";
import { requireUser } from "@/lib/auth/session";
import { currentYearMonth } from "@/lib/money/reports";

const objectId = z.string().refine((v) => Types.ObjectId.isValid(v), { message: "invalid id" });

export type TransferActionResult = { ok: true; id: string } | { ok: false; error: string };

const recordSchema = z.object({
  toUserId: objectId,
  amount: z.number().int().min(1),
  note: z.string().trim().max(200).optional(),
});

export async function recordOverallTransferAction(input: {
  toUserId: string;
  amount: number;
  note?: string;
}): Promise<TransferActionResult> {
  const session = await requireUser();
  if (!session.roomId) return { ok: false, error: "User missing room" };

  const parsed = recordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  if (parsed.data.toUserId === session.sub) {
    return { ok: false, error: "Can't transfer to yourself" };
  }

  await connectDb();

  const recipient = await User.findById(parsed.data.toUserId);
  if (!recipient || recipient.roomId?.toString() !== session.roomId) {
    return { ok: false, error: "Invalid recipient" };
  }

  const { year, month } = currentYearMonth();

  const transfer = await Transfer.create({
    roomId: new Types.ObjectId(session.roomId),
    year,
    month,
    fromUserId: new Types.ObjectId(session.sub),
    toUserId: new Types.ObjectId(parsed.data.toUserId),
    amount: parsed.data.amount,
    status: "pending",
    note: parsed.data.note ?? "",
    declaredBy: new Types.ObjectId(session.sub),
    declaredAt: new Date(),
  });

  revalidatePath("/dashboard");
  return { ok: true, id: transfer._id.toString() };
}

export async function confirmTransferAction(transferId: string): Promise<TransferActionResult> {
  const session = await requireUser();
  if (!Types.ObjectId.isValid(transferId)) return { ok: false, error: "invalid id" };

  await connectDb();
  const t = await Transfer.findById(transferId);
  if (!t) return { ok: false, error: "Not found" };
  if (t.roomId.toString() !== session.roomId) return { ok: false, error: "Forbidden" };
  if (t.status !== "pending") return { ok: false, error: "Already resolved" };

  const isRecipient = t.toUserId.toString() === session.sub;
  const isAdmin = session.role === "owner" || session.role === "roomAdmin";
  if (!isRecipient && !isAdmin) return { ok: false, error: "Forbidden" };

  t.status = "confirmed";
  t.resolvedBy = new Types.ObjectId(session.sub);
  t.resolvedAt = new Date();
  await t.save();

  revalidatePath("/dashboard");
  return { ok: true, id: transferId };
}

export async function rejectTransferAction(transferId: string): Promise<TransferActionResult> {
  const session = await requireUser();
  if (!Types.ObjectId.isValid(transferId)) return { ok: false, error: "invalid id" };

  await connectDb();
  const t = await Transfer.findById(transferId);
  if (!t) return { ok: false, error: "Not found" };
  if (t.roomId.toString() !== session.roomId) return { ok: false, error: "Forbidden" };
  if (t.status !== "pending") return { ok: false, error: "Already resolved" };

  const isRecipient = t.toUserId.toString() === session.sub;
  const isAdmin = session.role === "owner" || session.role === "roomAdmin";
  if (!isRecipient && !isAdmin) return { ok: false, error: "Forbidden" };

  t.status = "rejected";
  t.resolvedBy = new Types.ObjectId(session.sub);
  t.resolvedAt = new Date();
  await t.save();

  revalidatePath("/dashboard");
  return { ok: true, id: transferId };
}

export async function cancelTransferAction(transferId: string): Promise<TransferActionResult> {
  const session = await requireUser();
  if (!Types.ObjectId.isValid(transferId)) return { ok: false, error: "invalid id" };

  await connectDb();
  const t = await Transfer.findById(transferId);
  if (!t) return { ok: false, error: "Not found" };
  if (t.roomId.toString() !== session.roomId) return { ok: false, error: "Forbidden" };
  if (t.status !== "pending") return { ok: false, error: "Already resolved" };

  const isSender = t.fromUserId.toString() === session.sub;
  const isAdmin = session.role === "owner" || session.role === "roomAdmin";
  if (!isSender && !isAdmin) return { ok: false, error: "Forbidden" };

  await Transfer.deleteOne({ _id: t._id });

  revalidatePath("/dashboard");
  return { ok: true, id: transferId };
}
