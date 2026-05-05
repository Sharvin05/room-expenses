import mongoose from "mongoose";
import { connectDb } from "../src/lib/db/connect";
import { User } from "../src/lib/db/models/User";
import { hashPassword } from "../src/lib/auth/password";

async function main() {
  const email = process.env.OWNER_EMAIL;
  const password = process.env.OWNER_PASSWORD;
  if (!email || !password) {
    throw new Error("OWNER_EMAIL and OWNER_PASSWORD must be set in .env");
  }

  await connectDb();

  const existing = await User.findOne({ email: email.toLowerCase() });
  const passwordHash = await hashPassword(password);

  if (existing) {
    existing.passwordHash = passwordHash;
    existing.role = "owner";
    existing.roomId = null;
    existing.name = existing.name || "Owner";
    await existing.save();
    console.log(`Updated owner ${email}`);
  } else {
    await User.create({
      email: email.toLowerCase(),
      name: "Owner",
      passwordHash,
      role: "owner",
      roomId: null,
      groupIds: [],
    });
    console.log(`Created owner ${email}`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
