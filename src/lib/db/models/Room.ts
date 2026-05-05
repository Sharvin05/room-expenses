import { Schema, model, models, type InferSchemaType, type Model, Types } from "mongoose";

const RoomSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

export type RoomDoc = InferSchemaType<typeof RoomSchema> & { _id: Types.ObjectId };

export const Room: Model<RoomDoc> =
  (models.Room as Model<RoomDoc>) ?? model<RoomDoc>("Room", RoomSchema);
