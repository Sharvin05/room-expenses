"use server";

import { Types } from "mongoose";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { connectDb } from "@/lib/db/connect";
import { Room } from "@/lib/db/models/Room";
import { Group, effectiveMembers } from "@/lib/db/models/Group";
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
  // backfilled joinedAt, instead of being overwritten by a blind $push.
  if (groupObjectIds.length) {
    const now = new Date();
    const groupsToUpdate = await Group.find({
      _id: { $in: groupObjectIds },
      roomId: new Types.ObjectId(roomId),
    });
    for (const g of groupsToUpdate) {
      const current = effectiveMembers(g);
      if (current.some((m) => m.userId.equals(userDoc._id))) continue;
      g.set("members", [...current, { userId: userDoc._id, joinedAt: now }]);
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
  await Group.updateMany(
    { $or: [{ memberIds: target._id }, { "members.userId": target._id }] },
    { $pull: { memberIds: target._id, members: { userId: target._id } } },
  );
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

  const now = new Date();
  const group = await Group.create({
    name: parsed.data.name,
    roomId: new Types.ObjectId(parsed.data.roomId),
    members: (parsed.data.memberIds ?? []).map((id) => ({
      userId: new Types.ObjectId(id),
      joinedAt: now,
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

  // Preserve joinedAt for members that were already in the group; stamp new
  // members with today's date so they only appear on expenses dated on/after now.
  const existing = effectiveMembers(group);
  const existingByUserId = new Map(existing.map((m) => [m.userId.toString(), m]));
  const oldIds = existing.map((m) => m.userId.toString());
  const now = new Date();

  const nextMembers = memberIds.map((id) => {
    const prior = existingByUserId.get(id);
    return {
      userId: new Types.ObjectId(id),
      joinedAt: prior ? prior.joinedAt : now,
    };
  });
  group.set("members", nextMembers);
  // Drop the legacy field so future reads use `members` directly.
  group.set("memberIds", undefined);
  await group.save();

  const removed = oldIds.filter((id) => !memberIds.includes(id));
  const added = memberIds.filter((id) => !oldIds.includes(id));
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
