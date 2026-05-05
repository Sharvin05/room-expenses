import mongoose, { type Mongoose } from "mongoose";

const MONGO_URI = process.env.MONGO_DB_URI;
if (!MONGO_URI) {
  throw new Error("MONGO_DB_URI is not set");
}

type Cached = {
  conn: Mongoose | null;
  promise: Promise<Mongoose> | null;
};

const globalWithMongoose = globalThis as typeof globalThis & {
  __mongoose?: Cached;
};

const cached: Cached = globalWithMongoose.__mongoose ?? { conn: null, promise: null };
globalWithMongoose.__mongoose = cached;

export async function connectDb(): Promise<Mongoose> {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGO_URI!, {
      bufferCommands: false,
    });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}
