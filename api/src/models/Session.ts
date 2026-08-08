import mongoose, { Schema, type HydratedDocument, type Types } from "mongoose";

/**
 * One row per issued refresh token. Storing the hash lets us rotate on every
 * refresh, revoke a single device, and hard-delete every session when the user
 * deletes their account.
 */
export interface ISession {
  user: Types.ObjectId;
  tokenHash: string;
  userAgent: string;
  ip: string;
  revokedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type SessionDoc = HydratedDocument<ISession>;

const sessionSchema = new Schema<ISession>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true, index: true },
    userAgent: { type: String, default: "" },
    ip: { type: String, default: "" },
    revokedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session = mongoose.model<ISession>("Session", sessionSchema);
