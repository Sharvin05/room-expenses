import { Schema, model, models, type InferSchemaType, type Model, Types } from "mongoose";

const MembershipPeriodSchema = new Schema(
  {
    joinedAt: { type: Date, required: true },
    leftAt: { type: Date, default: null },
  },
  { _id: false },
);

const GroupMemberSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    periods: { type: [MembershipPeriodSchema], default: undefined },
    // Legacy field kept so pre-migration docs still read correctly via
    // effectiveMembers. New writes set `periods` and leave this unset.
    joinedAt: { type: Date, default: undefined },
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

export type MembershipPeriod = { joinedAt: Date; leftAt: Date | null };

/**
 * A member's full history in the group as half-open day intervals
 * `[joinedAt, leftAt)`. Someone who left and came back has two periods; a
 * current member's last period has `leftAt === null`.
 */
export type GroupMember = { userId: Types.ObjectId; periods: MembershipPeriod[] };

export type GroupDoc = InferSchemaType<typeof GroupSchema> & { _id: Types.ObjectId };

export const Group: Model<GroupDoc> =
  (models.Group as Model<GroupDoc>) ?? model<GroupDoc>("Group", GroupSchema);

/** Midnight UTC of the calendar day `d` falls on, read in UTC. */
function toUtcDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Stamps a membership boundary at the *local* calendar day the admin acted on,
 * normalized to midnight UTC — the convention `<input type="date">` already
 * uses, since it submits "YYYY-MM-DD" and `new Date()` reads that as midnight
 * UTC. Stamping a raw `new Date()` instead would land at, say, 14:00 and sort
 * *after* a same-day expense at 00:00, so a member added today would be left
 * off today's expenses.
 */
export function membershipDayStamp(at: Date = new Date()): Date {
  return new Date(Date.UTC(at.getFullYear(), at.getMonth(), at.getDate()));
}

type RawMember = {
  userId: Types.ObjectId;
  periods?: { joinedAt: Date; leftAt?: Date | null }[] | null;
  joinedAt?: Date | null;
};

/**
 * Returns every member the group has ever had, past and present, as
 * `{ userId, periods }`. Two legacy shapes are lifted to a single open period
 * so pre-migration docs read correctly: a member with only `joinedAt`, and a
 * group with only `memberIds` (whose members are treated as having been in the
 * group since it was created).
 */
export function effectiveMembers(group: {
  members?: RawMember[] | null;
  memberIds?: Types.ObjectId[] | null;
  createdAt?: Date;
}): GroupMember[] {
  if (group.members && group.members.length > 0) {
    return group.members.map((m) => ({
      userId: m.userId,
      periods:
        m.periods && m.periods.length > 0
          ? m.periods.map((p) => ({ joinedAt: p.joinedAt, leftAt: p.leftAt ?? null }))
          : [{ joinedAt: m.joinedAt ?? new Date(0), leftAt: null }],
    }));
  }
  if (group.memberIds && group.memberIds.length > 0) {
    const joinedAt = group.createdAt ?? new Date(0);
    return group.memberIds.map((id) => ({ userId: id, periods: [{ joinedAt, leftAt: null }] }));
  }
  return [];
}

/**
 * Was this member in the group on `date`? Compared at day granularity against
 * half-open intervals: the join day counts, the leave day does not. So removing
 * someone on the 8th and re-adding them on the 22nd leaves them on the 1st–7th,
 * off the 8th–21st, and back on from the 22nd — no matter when the expense is
 * actually entered.
 */
export function isMemberOn(member: GroupMember, date: Date): boolean {
  const day = toUtcDay(date);
  return member.periods.some((p) => {
    if (day < toUtcDay(p.joinedAt)) return false;
    return p.leftAt == null || day < toUtcDay(p.leftAt);
  });
}

/** True while the member has an open period, i.e. they are in the group now. */
export function isCurrentMember(member: GroupMember): boolean {
  return member.periods.some((p) => p.leftAt == null);
}

export function currentMemberIds(group: {
  members?: RawMember[] | null;
  memberIds?: Types.ObjectId[] | null;
  createdAt?: Date;
}): string[] {
  return effectiveMembers(group)
    .filter(isCurrentMember)
    .map((m) => m.userId.toString());
}

/**
 * Adds `userId` to the group as of `at`, preserving any earlier periods. A
 * member who is already in the group is left untouched so their original join
 * date survives a no-op save.
 */
export function withMemberJoined(
  members: readonly GroupMember[],
  userId: Types.ObjectId,
  at: Date,
): GroupMember[] {
  const existing = members.find((m) => m.userId.equals(userId));
  if (!existing) {
    return [...members, { userId, periods: [{ joinedAt: at, leftAt: null }] }];
  }
  if (isCurrentMember(existing)) return members.slice();
  return members.map((m) =>
    m.userId.equals(userId)
      ? { userId: m.userId, periods: [...m.periods, { joinedAt: at, leftAt: null }] }
      : m,
  );
}

/**
 * Closes `userId`'s open period at `at` rather than dropping the member, so
 * expenses dated before the removal still resolve to them — including ones
 * entered or edited after the fact. A period that would end on or before the
 * day it began (added and removed the same day) is discarded instead, and a
 * member left with no periods at all is dropped.
 */
export function withMemberLeft(
  members: readonly GroupMember[],
  userId: Types.ObjectId,
  at: Date,
): GroupMember[] {
  const out: GroupMember[] = [];
  for (const m of members) {
    if (!m.userId.equals(userId)) {
      out.push(m);
      continue;
    }
    const periods = m.periods
      .map((p) => (p.leftAt == null ? { joinedAt: p.joinedAt, leftAt: at } : p))
      .filter((p) => p.leftAt == null || toUtcDay(p.joinedAt) < toUtcDay(p.leftAt));
    if (periods.length > 0) out.push({ userId: m.userId, periods });
  }
  return out;
}
