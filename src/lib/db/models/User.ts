import { Schema, model, models, type InferSchemaType, type Model, Types } from "mongoose";

export const USER_ROLES = ["owner", "roomAdmin", "user"] as const;
export type UserRole = (typeof USER_ROLES)[number];

const UserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: USER_ROLES, required: true },
    roomId: { type: Schema.Types.ObjectId, ref: "Room", default: null },
    groupIds: { type: [Schema.Types.ObjectId], ref: "Group", default: [] },
  },
  { timestamps: true },
);

UserSchema.index({ roomId: 1, role: 1 });

export type UserDoc = InferSchemaType<typeof UserSchema> & { _id: Types.ObjectId };

export const User: Model<UserDoc> =
  (models.User as Model<UserDoc>) ?? model<UserDoc>("User", UserSchema);
