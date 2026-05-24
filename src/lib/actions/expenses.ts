"use server";

import { Types } from "mongoose";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { connectDb } from "@/lib/db/connect";
import { Expense } from "@/lib/db/models/Expense";
import { Group, effectiveMembers } from "@/lib/db/models/Group";
import { User } from "@/lib/db/models/User";
import { requireUser } from "@/lib/auth/session";

const objectId = z.string().refine((v) => Types.ObjectId.isValid(v), { message: "invalid id" });

const expenseSchema = z
  .object({
    amountFils: z.number().int().min(1),
    shopName: z.string().trim().min(1).max(120),
    date: z.string().min(1),
    mode: z.enum(["group", "individuals"]),
    groupId: objectId.optional(),
    participantIds: z.array(objectId).optional(),
    includeSelf: z.boolean(),
  })
  .refine((d) => (d.mode === "group" ? !!d.groupId : true), {
    path: ["groupId"],
    message: "groupId required",
  })
  .refine((d) => (d.mode === "individuals" ? !!d.participantIds?.length : true), {
    path: ["participantIds"],
    message: "select at least one user",
  });

export type ExpenseResult = { ok: true; id: string } | { ok: false; error: string };

type ExpenseInput = {
  amountFils: number;
  shopName: string;
  date: string;
  mode: "group" | "individuals";
  groupId?: string;
  participantIds?: string[];
  includeSelf: boolean;
};

async function resolveParticipants(
  data: ReturnType<typeof expenseSchema.parse>,
  roomId: string,
  payerObjectId: Types.ObjectId,
  expenseDate: Date,
): Promise<{ ok: true; participantIds: Types.ObjectId[]; groupId: Types.ObjectId | null } | { ok: false; error: string }> {
  let participantIds: Types.ObjectId[] = [];
  let groupId: Types.ObjectId | null = null;

  if (data.mode === "group") {
    const group = await Group.findById(data.groupId);
    if (!group) return { ok: false, error: "Group not found" };
    if (group.roomId.toString() !== roomId) return { ok: false, error: "Forbidden" };
    groupId = group._id;
    // Only include members who had joined the group on/before this expense's date.
    // This is what makes "members are only on expenses from their join date forward"
    // hold for both new expenses and edits of historical ones.
    const cutoff = expenseDate.getTime();
    participantIds = effectiveMembers(group)
      .filter((m) => m.joinedAt.getTime() <= cutoff)
      .map((m) => m.userId);
  } else {
    participantIds = data.participantIds!.map((id) => new Types.ObjectId(id));
    const valid = await User.countDocuments({
      _id: { $in: participantIds },
      roomId: new Types.ObjectId(roomId),
    });
    if (valid !== participantIds.length) return { ok: false, error: "Invalid participants" };

    if (data.includeSelf) {
      if (!participantIds.some((id) => id.equals(payerObjectId))) {
        participantIds.push(payerObjectId);
      }
    } else {
      participantIds = participantIds.filter((id) => !id.equals(payerObjectId));
    }
  }

  if (participantIds.length === 0) {
    return { ok: false, error: "Need at least one participant" };
  }

  return { ok: true, participantIds, groupId };
}

function revalidateExpenseSurfaces() {
  revalidatePath("/dashboard");
  revalidatePath("/expenses/new");
  revalidatePath("/expenses/history");
}

export async function createExpenseAction(input: ExpenseInput): Promise<ExpenseResult> {
  const session = await requireUser();
  if (!session.roomId) return { ok: false, error: "User missing room" };

  const parsed = expenseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await connectDb();

  const date = new Date(parsed.data.date);
  if (Number.isNaN(date.getTime())) return { ok: false, error: "Invalid date" };

  const payerObjectId = new Types.ObjectId(session.sub);
  const resolved = await resolveParticipants(parsed.data, session.roomId, payerObjectId, date);
  if (!resolved.ok) return resolved;

  const expense = await Expense.create({
    amount: parsed.data.amountFils,
    shopName: parsed.data.shopName,
    roomId: new Types.ObjectId(session.roomId),
    payerId: payerObjectId,
    participantIds: resolved.participantIds,
    groupId: resolved.groupId,
    date,
    year: date.getFullYear(),
    month: date.getMonth() + 1,
  });

  revalidateExpenseSurfaces();
  return { ok: true, id: expense._id.toString() };
}

export async function updateExpenseAction(
  expenseId: string,
  input: ExpenseInput,
): Promise<ExpenseResult> {
  const session = await requireUser();
  if (!session.roomId) return { ok: false, error: "User missing room" };
  if (!Types.ObjectId.isValid(expenseId)) return { ok: false, error: "invalid id" };

  const parsed = expenseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await connectDb();
  const exp = await Expense.findById(expenseId);
  if (!exp) return { ok: false, error: "Not found" };
  if (exp.roomId.toString() !== session.roomId) return { ok: false, error: "Forbidden" };

  const isPayer = exp.payerId.toString() === session.sub;
  const isAdmin = session.role === "owner" || session.role === "roomAdmin";
  if (!isPayer && !isAdmin) return { ok: false, error: "Forbidden" };

  const date = new Date(parsed.data.date);
  if (Number.isNaN(date.getTime())) return { ok: false, error: "Invalid date" };

  const resolved = await resolveParticipants(parsed.data, session.roomId, exp.payerId, date);
  if (!resolved.ok) return resolved;

  exp.amount = parsed.data.amountFils;
  exp.shopName = parsed.data.shopName;
  exp.participantIds = resolved.participantIds;
  exp.groupId = resolved.groupId;
  exp.date = date;
  exp.year = date.getFullYear();
  exp.month = date.getMonth() + 1;
  await exp.save();

  revalidateExpenseSurfaces();
  return { ok: true, id: exp._id.toString() };
}

export async function deleteExpenseAction(expenseId: string): Promise<ExpenseResult> {
  const session = await requireUser();
  if (!Types.ObjectId.isValid(expenseId)) return { ok: false, error: "invalid id" };

  await connectDb();
  const exp = await Expense.findById(expenseId);
  if (!exp) return { ok: false, error: "Not found" };
  if (exp.roomId.toString() !== session.roomId) return { ok: false, error: "Forbidden" };

  const isPayer = exp.payerId.toString() === session.sub;
  const isAdmin = session.role === "owner" || session.role === "roomAdmin";
  if (!isPayer && !isAdmin) return { ok: false, error: "Forbidden" };

  await Expense.deleteOne({ _id: exp._id });
  revalidateExpenseSurfaces();
  return { ok: true, id: expenseId };
}
