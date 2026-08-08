import mongoose, { Schema, type HydratedDocument, type Model, type Types } from "mongoose";
import crypto from "node:crypto";

// A plain const object rather than a TS enum — enums aren't erasable, and
// Node strips types at runtime instead of compiling them.
export const OTP_PURPOSE = {
  VERIFY_EMAIL: "verify_email",
  RESET_PASSWORD: "reset_password",
  SIGN_TRANSFER: "sign_transfer",
  DELETE_ACCOUNT: "delete_account",
} as const;

export type OtpPurpose = (typeof OTP_PURPOSE)[keyof typeof OTP_PURPOSE];

export const MAX_OTP_ATTEMPTS = 5;

export interface OtpPayload {
  transferId?: string;
}

export interface IOtp {
  user: Types.ObjectId;
  purpose: OtpPurpose;
  /** sha256 of the 6-digit code — never store the code itself. */
  codeHash: string;
  attempts: number;
  consumedAt: Date | null;
  payload: OtpPayload | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type OtpDoc = HydratedDocument<IOtp>;

const otpSchema = new Schema<IOtp>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    purpose: { type: String, enum: Object.values(OTP_PURPOSE), required: true },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    consumedAt: { type: Date, default: null },
    payload: { type: Schema.Types.Mixed, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// Mongo's TTL monitor removes expired codes automatically.
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export function hashCode(code: string): string {
  return crypto.createHash("sha256").update(String(code)).digest("hex");
}

export function generateCode(): string {
  // 6 digits, uniformly distributed, cryptographically random.
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

export const Otp: Model<IOtp> = mongoose.model<IOtp>("Otp", otpSchema);
