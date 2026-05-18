import { Schema, model, models, type InferSchemaType, type Model, Types } from "mongoose";

export const TRANSFER_STATUSES = ["pending", "confirmed", "rejected"] as const;
export type TransferStatus = (typeof TRANSFER_STATUSES)[number];

const TransferSchema = new Schema(
  {
    roomId: { type: Schema.Types.ObjectId, ref: "Room", required: true, index: true },
    year: { type: Number, required: true },
    month: { type: Number, required: true, min: 1, max: 12 },
    fromUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    toUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true, min: 1 },
    status: { type: String, enum: TRANSFER_STATUSES, required: true, default: "pending" },
    note: { type: String, default: "", trim: true, maxlength: 200 },
    declaredBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    declaredAt: { type: Date, required: true, default: () => new Date() },
    resolvedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

TransferSchema.index({ roomId: 1, year: 1, month: 1, status: 1 });
TransferSchema.index({ roomId: 1, fromUserId: 1, toUserId: 1, status: 1 });

export type TransferDoc = InferSchemaType<typeof TransferSchema> & { _id: Types.ObjectId };

export const Transfer: Model<TransferDoc> =
  (models.Transfer as Model<TransferDoc>) ?? model<TransferDoc>("Transfer", TransferSchema);
