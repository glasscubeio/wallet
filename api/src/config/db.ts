import mongoose from "mongoose";
import { env } from "./env.ts";

mongoose.set("strictQuery", true);

export async function connectDb(): Promise<void> {
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
  console.log("[db] connected");
}

export async function disconnectDb(): Promise<void> {
  await mongoose.connection.close();
}
