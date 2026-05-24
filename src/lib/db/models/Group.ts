import { Schema, model, models, type InferSchemaType, type Model, Types } from "mongoose";

const GroupMemberSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    joinedAt: { type: Date, required: true },
  },
  { _id: false },
);

const GroupSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    roomId: { type: Schema.Types.ObjectId, ref: "Room", required: true, index: true },
    members: { type: [GroupMemberSchema], default: [] },
    // Legacy field kept so pre-migration docs still read correctly via effectiveMembers.
    // New writes set `members` and unset `memberIds`.
    memberIds: { type: [Schema.Types.ObjectId], ref: "User", default: undefined },
  },
  { timestamps: true },
);

GroupSchema.index({ roomId: 1, name: 1 }, { unique: true });

export type GroupMember = { userId: Types.ObjectId; joinedAt: Date };

export type GroupDoc = InferSchemaType<typeof GroupSchema> & { _id: Types.ObjectId };

export const Group: Model<GroupDoc> =
  (models.Group as Model<GroupDoc>) ?? model<GroupDoc>("Group", GroupSchema);

/**
 * Returns the group's members as `{ userId, joinedAt }`. If a legacy doc still
 * has only `memberIds`, each id is lifted to `joinedAt = group.createdAt` so
 * existing members are treated as having been in the group since day one.
 */
export function effectiveMembers(group: {
  members?: { userId: Types.ObjectId; joinedAt: Date }[] | null;
  memberIds?: Types.ObjectId[] | null;
  createdAt?: Date;
}): GroupMember[] {
  if (group.members && group.members.length > 0) {
    return group.members.map((m) => ({ userId: m.userId, joinedAt: m.joinedAt }));
  }
  if (group.memberIds && group.memberIds.length > 0) {
    const joinedAt = group.createdAt ?? new Date(0);
    return group.memberIds.map((id) => ({ userId: id, joinedAt }));
  }
  return [];
}
