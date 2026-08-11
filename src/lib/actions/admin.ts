"use server";

import { Types } from "mongoose";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { connectDb } from "@/lib/db/connect";
import { Room } from "@/lib/db/models/Room";
import {
  Group,
  effectiveMembers,
  isCurrentMember,
  membershipDayStamp,
  withMemberJoined,
  withMemberLeft,
} from "@/lib/db/models/Group";
import { User, USER_ROLES } from "@/lib/db/models/User";
import { Expense } from "@/lib/db/models/Expense";
import { hashPassword } from "@/lib/auth/password";
import { requireAdmin, requireOwner, requireAdminForRoom } from "@/lib/auth/session";

const objectId = z
  .string()
  .refine((v) => Types.ObjectId.isValid(v), { message: "invalid id" });

export type ActionResult = { ok: true } | { ok: false; error: string };

// Anything that mutates group membership has to evict the router cache for the
// expense surfaces — they read groups for the picker and the per-expense
// participant resolution. Without this, the new member won't appear on
// /expenses/new until the cache happens to expire.
function revalidateGroupSurfaces() {
  revalidatePath("/admin/groups");
  revalidatePath("/admin/users");
  revalidatePath("/admin");
  revalidatePath("/dashboard");
  revalidatePath("/expenses/new");
  revalidatePath("/expenses/history");
}

const createRoomSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export async function createRoomAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireOwner();
  const parsed = createRoomSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { ok: false, error: "Name is required" };

  await connectDb();
  const exists = await Room.findOne({ name: parsed.data.name });
  if (exists) return { ok: false, error: "Room with that name already exists" };

  await Room.create({ name: parsed.data.name, createdBy: new Types.ObjectId(session.sub) });
  revalidatePath("/admin/rooms");
  revalidatePath("/admin");
  return { ok: true };
}

export async function deleteRoomAction(roomId: string): Promise<ActionResult> {
  await requireOwner();
  if (!Types.ObjectId.isValid(roomId)) return { ok: false, error: "invalid id" };

  await connectDb();
  const rid = new Types.ObjectId(roomId);
  await Promise.all([
    Group.deleteMany({ roomId: rid }),
    Expense.deleteMany({ roomId: rid }),
    User.deleteMany({ roomId: rid }),
    Room.deleteOne({ _id: rid }),
  ]);
  revalidatePath("/admin/rooms");
  revalidatePath("/admin");
  return { ok: true };
}

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().trim().min(1).max(80),
  password: z.string().min(6).max(120),
  role: z.enum(USER_ROLES),
  roomId: objectId.optional(),
  groupIds: z.array(objectId).optional(),
});

export async function createUserAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireAdmin();

  const groupIdsRaw = formData.getAll("groupIds").map(String).filter(Boolean);
  const parsed = createUserSchema.safeParse({
    email: formData.get("email"),
    name: formData.get("name"),
    password: formData.get("password"),
    role: formData.get("role"),
    roomId: formData.get("roomId") || undefined,
    groupIds: groupIdsRaw.length ? groupIdsRaw : undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  if (parsed.data.role === "owner") {
    return { ok: false, error: "Cannot create another owner" };
  }

  let roomId: string | null = parsed.data.roomId ?? null;
  if (session.role === "roomAdmin") {
    if (!session.roomId) return { ok: false, error: "Room admin missing room" };
    roomId = session.roomId;
  }
  if (!roomId) return { ok: false, error: "roomId is required" };

  await requireAdminForRoom(roomId);

  await connectDb();
  const exists = await User.findOne({ email: parsed.data.email.toLowerCase() });
  if (exists) return { ok: false, error: "Email already in use" };

  const passwordHash = await hashPassword(parsed.data.password);
  const groupObjectIds = (parsed.data.groupIds ?? []).map((id) => new Types.ObjectId(id));
  const userDoc = await User.create({
    email: parsed.data.email.toLowerCase(),
    name: parsed.data.name,
    passwordHash,
    role: parsed.data.role,
    roomId: new Types.ObjectId(roomId),
    groupIds: groupObjectIds,
  });

  // Mirror the assignment onto each Group.members. We load → mutate → save so
  // legacy groups (still on `memberIds`) get materialized into `members` with
  // backfilled periods, instead of being overwritten by a blind $push.
  if (groupObjectIds.length) {
    const stamp = membershipDayStamp();
    const groupsToUpdate = await Group.find({
      _id: { $in: groupObjectIds },
      roomId: new Types.ObjectId(roomId),
    });
    for (const g of groupsToUpdate) {
      g.set("members", withMemberJoined(effectiveMembers(g), userDoc._id, stamp));
      g.set("memberIds", undefined);
      await g.save();
    }
  }

  revalidateGroupSurfaces();
  return { ok: true };
}

export async function deleteUserAction(userId: string): Promise<ActionResult> {
  const session = await requireAdmin();
  if (!Types.ObjectId.isValid(userId)) return { ok: false, error: "invalid id" };

  await connectDb();
  const target = await User.findById(userId);
  if (!target) return { ok: false, error: "User not found" };
  if (target.role === "owner") return { ok: false, error: "Cannot delete the owner" };
  if (session.role === "roomAdmin") {
    if (!session.roomId || !target.roomId || target.roomId.toString() !== session.roomId) {
      return { ok: false, error: "Forbidden" };
    }
  }

  await User.deleteOne({ _id: target._id });
  // Close their membership rather than erasing it. Their expenses outlive the
  // account, so an edit to one of those still has to resolve the participants
  // who were in the group at the time.
  const stamp = membershipDayStamp();
  const affected = await Group.find({
    $or: [{ memberIds: target._id }, { "members.userId": target._id }],
  });
  for (const g of affected) {
    g.set("members", withMemberLeft(effectiveMembers(g), target._id, stamp));
    g.set("memberIds", undefined);
    await g.save();
  }
  revalidateGroupSurfaces();
  return { ok: true };
}

const createGroupSchema = z.object({
  name: z.string().trim().min(1).max(80),
  roomId: objectId,
  memberIds: z.array(objectId).optional(),
});

export async function createGroupAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireAdmin();

  const memberIdsRaw = formData.getAll("memberIds").map(String).filter(Boolean);
  const fallbackRoomId = session.role === "roomAdmin" ? session.roomId ?? "" : "";
  const parsed = createGroupSchema.safeParse({
    name: formData.get("name"),
    roomId: formData.get("roomId") || fallbackRoomId,
    memberIds: memberIdsRaw.length ? memberIdsRaw : undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await requireAdminForRoom(parsed.data.roomId);

  await connectDb();
  const exists = await Group.findOne({ roomId: parsed.data.roomId, name: parsed.data.name });
  if (exists) return { ok: false, error: "Group already exists in this room" };

  const stamp = membershipDayStamp();
  const group = await Group.create({
    name: parsed.data.name,
    roomId: new Types.ObjectId(parsed.data.roomId),
    members: (parsed.data.memberIds ?? []).map((id) => ({
      userId: new Types.ObjectId(id),
      periods: [{ joinedAt: stamp, leftAt: null }],
    })),
  });

  if (parsed.data.memberIds?.length) {
    await User.updateMany(
      { _id: { $in: parsed.data.memberIds.map((id) => new Types.ObjectId(id)) } },
      { $addToSet: { groupIds: group._id } },
    );
  }

  revalidateGroupSurfaces();
  return { ok: true };
}

export async function updateGroupMembersAction(
  groupId: string,
  memberIds: string[],
): Promise<ActionResult> {
  if (!Types.ObjectId.isValid(groupId)) return { ok: false, error: "invalid id" };
  for (const id of memberIds) {
    if (!Types.ObjectId.isValid(id)) return { ok: false, error: "invalid member id" };
  }

  await connectDb();
  const group = await Group.findById(groupId);
  if (!group) return { ok: false, error: "Group not found" };

  await requireAdminForRoom(group.roomId.toString());

  // `memberIds` is the roster as it should stand from today onward, so diff it
  // against who is in the group now: anyone dropped gets their period closed as
  // of today, anyone added gets a new one opened. Past periods are carried
  // through untouched — that is what keeps a mid-month removal from rewriting
  // the days the member was actually there.
  const existing = effectiveMembers(group);
  const oldIds = existing.filter(isCurrentMember).map((m) => m.userId.toString());
  const stamp = membershipDayStamp();

  const removed = oldIds.filter((id) => !memberIds.includes(id));
  const added = memberIds.filter((id) => !oldIds.includes(id));

  let nextMembers = existing;
  for (const id of removed) {
    nextMembers = withMemberLeft(nextMembers, new Types.ObjectId(id), stamp);
  }
  for (const id of added) {
    nextMembers = withMemberJoined(nextMembers, new Types.ObjectId(id), stamp);
  }
  group.set("members", nextMembers);
  // Drop the legacy field so future reads use `members` directly.
  group.set("memberIds", undefined);
  await group.save();
  if (removed.length) {
    await User.updateMany(
      { _id: { $in: removed.map((id) => new Types.ObjectId(id)) } },
      { $pull: { groupIds: group._id } },
    );
  }
  if (added.length) {
    await User.updateMany(
      { _id: { $in: added.map((id) => new Types.ObjectId(id)) } },
      { $addToSet: { groupIds: group._id } },
    );
  }

  revalidateGroupSurfaces();
  return { ok: true };
}

export async function deleteGroupAction(groupId: string): Promise<ActionResult> {
  if (!Types.ObjectId.isValid(groupId)) return { ok: false, error: "invalid id" };
  await connectDb();
  const group = await Group.findById(groupId);
  if (!group) return { ok: false, error: "Group not found" };

  await requireAdminForRoom(group.roomId.toString());

  await User.updateMany({ groupIds: group._id }, { $pull: { groupIds: group._id } });
  await Group.deleteOne({ _id: group._id });
  revalidateGroupSurfaces();
  return { ok: true };
}
