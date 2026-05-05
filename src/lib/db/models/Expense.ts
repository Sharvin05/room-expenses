import { Schema, model, models, type InferSchemaType, type Model, Types } from "mongoose";

const ExpenseSchema = new Schema(
  {
    amount: { type: Number, required: true, min: 1 },
    shopName: { type: String, required: true, trim: true },
    roomId: { type: Schema.Types.ObjectId, ref: "Room", required: true, index: true },
    payerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    participantIds: { type: [Schema.Types.ObjectId], ref: "User", required: true },
    groupId: { type: Schema.Types.ObjectId, ref: "Group", default: null },
    date: { type: Date, required: true },
    year: { type: Number, required: true },
    month: { type: Number, required: true, min: 1, max: 12 },
  },
  { timestamps: true },
);

ExpenseSchema.index({ roomId: 1, year: 1, month: 1 });
ExpenseSchema.index({ roomId: 1, payerId: 1, date: -1 });

export type ExpenseDoc = InferSchemaType<typeof ExpenseSchema> & { _id: Types.ObjectId };

export const Expense: Model<ExpenseDoc> =
  (models.Expense as Model<ExpenseDoc>) ?? model<ExpenseDoc>("Expense", ExpenseSchema);
