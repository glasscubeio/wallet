import type { Types } from "mongoose";
import {
  Otp,
  generateCode,
  hashCode,
  MAX_OTP_ATTEMPTS,
  type OtpDoc,
  type OtpPayload,
  type OtpPurpose,
} from "../models/Otp.ts";
import { env } from "../config/env.ts";
import { ApiError } from "../utils/ApiError.ts";

/**
 * Issues a fresh code, invalidating any earlier unconsumed code for the same
 * purpose so only the newest email in the user's inbox ever works.
 */
export async function issueOtp({
  userId,
  purpose,
  payload = null,
}: {
  userId: Types.ObjectId | string;
  purpose: OtpPurpose;
  payload?: OtpPayload | null;
}): Promise<{ code: string; otp: OtpDoc }> {
  await Otp.updateMany(
    { user: userId, purpose, consumedAt: null },
    { $set: { consumedAt: new Date() } },
  );

  const code = generateCode();
  const otp = await Otp.create({
    user: userId,
    purpose,
    codeHash: hashCode(code),
    payload,
    expiresAt: new Date(Date.now() + env.OTP_TTL_MINUTES * 60 * 1000),
  });

  return { code, otp };
}

/**
 * Consumes a code. A failed guess counts against the attempt budget so a
 * 6-digit code can't be brute-forced, and success marks it used so it can
 * never be replayed.
 */
export async function consumeOtp({
  userId,
  purpose,
  code,
}: {
  userId: Types.ObjectId | string;
  purpose: OtpPurpose;
  code: string;
}): Promise<OtpDoc> {
  const otp = await Otp.findOne({ user: userId, purpose, consumedAt: null }).sort({
    createdAt: -1,
  });

  if (!otp) {
    throw ApiError.badRequest("That code is no longer valid. Request a new one.", "otp_missing");
  }

  if (otp.expiresAt.getTime() <= Date.now()) {
    throw ApiError.badRequest("That code has expired. Request a new one.", "otp_expired");
  }

  if (otp.attempts >= MAX_OTP_ATTEMPTS) {
    throw ApiError.badRequest("Too many wrong attempts. Request a new code.", "otp_locked");
  }

  if (otp.codeHash !== hashCode(code)) {
    otp.attempts += 1;
    await otp.save();
    const left = MAX_OTP_ATTEMPTS - otp.attempts;
    throw ApiError.badRequest(
      left > 0
        ? `Incorrect code. ${left} attempt${left === 1 ? "" : "s"} left.`
        : "Too many wrong attempts. Request a new code.",
      "otp_invalid",
    );
  }

  otp.consumedAt = new Date();
  await otp.save();
  return otp;
}
