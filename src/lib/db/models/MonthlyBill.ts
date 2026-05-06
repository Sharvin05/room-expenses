import { Schema, model, models, type InferSchemaType, type Model, Types } from "mongoose";

const PerUserAmountSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const SettlementSchema = new Schema(
  {
    fromUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    toUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

const MonthlyBillSchema = new Schema(
  {
    roomId: { type: Schema.Types.ObjectId, ref: "Room", required: true, index: true },
    year: { type: Number, required: true },
    month: { type: Number, required: true, min: 1, max: 12 },
    totalAmount: { type: Number, required: true, default: 0 },
    expenseCount: { type: Number, required: true, default: 0 },
    perUserSpent: { type: [PerUserAmountSchema], default: [] },
    perUserShare: { type: [PerUserAmountSchema], default: [] },
    settlements: { type: [SettlementSchema], default: [] },
    recomputedAt: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: true },
);

MonthlyBillSchema.index({ roomId: 1, year: 1, month: 1 }, { unique: true });

export type MonthlyBillDoc = InferSchemaType<typeof MonthlyBillSchema> & {
  _id: Types.ObjectId;
};

export const MonthlyBill: Model<MonthlyBillDoc> =
  (models.MonthlyBill as Model<MonthlyBillDoc>) ??
  model<MonthlyBillDoc>("MonthlyBill", MonthlyBillSchema);
