import { Schema, model, models, type InferSchemaType, type Model, Types } from "mongoose";

const GroupSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    roomId: { type: Schema.Types.ObjectId, ref: "Room", required: true, index: true },
    memberIds: { type: [Schema.Types.ObjectId], ref: "User", default: [] },
  },
  { timestamps: true },
);

GroupSchema.index({ roomId: 1, name: 1 }, { unique: true });

export type GroupDoc = InferSchemaType<typeof GroupSchema> & { _id: Types.ObjectId };

export const Group: Model<GroupDoc> =
  (models.Group as Model<GroupDoc>) ?? model<GroupDoc>("Group", GroupSchema);
