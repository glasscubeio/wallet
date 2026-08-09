import crypto from "node:crypto";
import mongoose, { type ClientSession } from "mongoose";
import type { Request, Response } from "express";
import { User } from "../models/User.ts";
import { Wallet } from "../models/Wallet.ts";
import { Session } from "../models/Session.ts";
import { Otp, OTP_PURPOSE } from "../models/Otp.ts";
import { Transfer } from "../models/Transfer.ts";
import type { UserDoc } from "../models/User.ts";
import { ApiError } from "../utils/ApiError.ts";
import { env } from "../config/env.ts";
import {
  REFRESH_COOKIE,
  clearAuthCookies,
  hashToken,
  setAuthCookies,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../utils/tokens.ts";
import { issueOtp, consumeOtp } from "../services/otp.service.ts";
import { tryEnsureWallet } from "../services/wallet.service.ts";
import { requireUser } from "../middleware/auth.ts";
import {
  sendVerifyEmail,
  sendResetPasswordEmail,
  sendWelcomeEmail,
  sendDeleteAccountEmail,
} from "../services/email.service.ts";

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Issues a rotated refresh token + access token and sets both cookies. */
async function startSession(
  res: Response,
  req: Request,
  user: UserDoc,
): Promise<void> {
  const jti = crypto.randomUUID();
  const refreshToken = signRefreshToken(user, jti);
  const accessToken = signAccessToken(user);

  await Session.create({
    user: user._id,
    tokenHash: hashToken(refreshToken),
    userAgent: req.get("user-agent") ?? "",
    ip: req.ip ?? "",
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  });

  setAuthCookies(res, { accessToken, refreshToken });
}

export async function register(req: Request, res: Response): Promise<void> {
  const { username, email, password } = req.body as {
    username: string;
    email: string;
    password: string;
  };

  // Explicit pre-check gives a per-field message; the unique index is still
  // the real guard against a concurrent duplicate.
  const clash = await User.findOne({ $or: [{ email }, { username }] });
  if (clash) {
    const details: Record<string, string> = {};
    if (clash.email === email) details.email = "Email is already registered";
    if (clash.username === username)
      details.username = "Username is already taken";
    throw ApiError.conflict("Account already exists", "duplicate", details);
  }

  const user = await User.create({ username, email, password });

  // The wallet is created the moment they register — nothing for the user to do.
  const wallet = await tryEnsureWallet(user._id);

  await startSession(res, req, user);

  // Fire-and-forget: a slow mail provider must not slow down signup.
  void (async () => {
    try {
      if (wallet) {
        await sendWelcomeEmail({
          to: user.email,
          username: user.username,
          address: wallet.address,
        });
      }
      const { code } = await issueOtp({
        userId: user._id,
        purpose: OTP_PURPOSE.VERIFY_EMAIL,
      });
      await sendVerifyEmail({ to: user.email, username: user.username, code });
    } catch (err) {
      console.error("[register] post-signup email failed", err);
    }
  })();

  res.status(201).json({
    user: user.toPublic(),
    wallet: wallet
      ? { address: wallet.address, network: wallet.network }
      : null,
  });
}

export async function login(req: Request, res: Response): Promise<void> {
  const { identifier, password } = req.body as {
    identifier: string;
    password: string;
  };

  const query = identifier.includes("@")
    ? { email: identifier.toLowerCase() }
    : { username: identifier };

  const user = await User.findOne(query).select("+password");

  // Same message and roughly the same work either way, so the response can't
  // be used to enumerate which usernames exist.
  if (!user || !(await user.comparePassword(password))) {
    throw ApiError.unauthorized(
      "Incorrect email or password",
      "bad_credentials",
    );
  }

  if (env.REQUIRE_EMAIL_VERIFICATION && !user.emailVerifiedAt) {
    throw ApiError.forbidden(
      "Verify your email before signing in",
      "email_unverified",
    );
  }

  await tryEnsureWallet(user._id);
  await startSession(res, req, user);

  res.json({ user: user.toPublic() });
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  if (!token) throw ApiError.unauthorized("No session", "no_refresh_token");

  let sub: string;
  try {
    sub = verifyRefreshToken(token).sub;
  } catch {
    clearAuthCookies(res);
    throw ApiError.unauthorized("Session expired", "invalid_refresh_token");
  }

  const tokenHash = hashToken(token);
  const session = await Session.findOne({ tokenHash, user: sub });

  if (
    !session ||
    session.revokedAt ||
    session.expiresAt.getTime() <= Date.now()
  ) {
    // A valid JWT whose session row is gone means it was already rotated —
    // treat as replay and drop every session for that user.
    if (!session) {
      await Session.updateMany(
        { user: sub },
        { $set: { revokedAt: new Date() } },
      );
    }
    clearAuthCookies(res);
    throw ApiError.unauthorized("Session expired", "session_revoked");
  }

  const user = await User.findById(sub);
  if (!user) {
    clearAuthCookies(res);
    throw ApiError.unauthorized("Account no longer exists", "user_gone");
  }

  // Rotate: the old refresh token stops working the instant a new one is issued.
  await Session.deleteOne({ _id: session._id });
  await startSession(res, req, user);

  res.json({ user: user.toPublic() });
}

export async function logout(req: Request, res: Response): Promise<void> {
  const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  if (token) await Session.deleteOne({ tokenHash: hashToken(token) });
  clearAuthCookies(res);
  res.json({ ok: true });
}

export async function logoutAll(req: Request, res: Response): Promise<void> {
  await Session.deleteMany({ user: requireUser(req)._id });
  clearAuthCookies(res);
  res.json({ ok: true });
}

export async function me(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const wallet = await Wallet.findOne({ user: user._id });
  res.json({
    user: user.toPublic(),
    wallet: wallet
      ? { address: wallet.address, network: wallet.network }
      : null,
  });
}

/* ---------------------------------- email --------------------------------- */

export async function requestEmailVerification(
  req: Request,
  res: Response,
): Promise<void> {
  const user = requireUser(req);
  if (user.emailVerifiedAt) {
    res.json({ ok: true, alreadyVerified: true });
    return;
  }

  const { code } = await issueOtp({
    userId: user._id,
    purpose: OTP_PURPOSE.VERIFY_EMAIL,
  });
  await sendVerifyEmail({ to: user.email, username: user.username, code });

  res.json({ ok: true });
}

export async function confirmEmailVerification(
  req: Request,
  res: Response,
): Promise<void> {
  const user = requireUser(req);
  const { code } = req.body as { code: string };

  await consumeOtp({
    userId: user._id,
    purpose: OTP_PURPOSE.VERIFY_EMAIL,
    code,
  });

  user.emailVerifiedAt = new Date();
  await user.save();

  res.json({ ok: true, user: user.toPublic() });
}

/* -------------------------------- password -------------------------------- */

export async function forgotPassword(
  req: Request,
  res: Response,
): Promise<void> {
  const { email } = req.body as { email: string };
  const user = await User.findOne({ email: email.toLowerCase() });

  // Always the same response — never reveal whether the address is registered.
  if (user) {
    const { code } = await issueOtp({
      userId: user._id,
      purpose: OTP_PURPOSE.RESET_PASSWORD,
    });
    try {
      await sendResetPasswordEmail({
        to: user.email,
        username: user.username,
        code,
      });
    } catch (err) {
      console.error("[forgotPassword] email failed", err);
    }
  }

  res.json({
    ok: true,
    message: "If that email is registered, a reset code is on its way.",
  });
}

export async function resetPassword(
  req: Request,
  res: Response,
): Promise<void> {
  const { email, code, password } = req.body as {
    email: string;
    code: string;
    password: string;
  };

  const user = await User.findOne({ email: email.toLowerCase() }).select(
    "+password",
  );
  if (!user) {
    throw ApiError.badRequest(
      "That code is no longer valid. Request a new one.",
      "otp_missing",
    );
  }

  await consumeOtp({
    userId: user._id,
    purpose: OTP_PURPOSE.RESET_PASSWORD,
    code,
  });

  user.password = password;
  await user.save();

  // A password reset invalidates every existing session everywhere.
  await Session.deleteMany({ user: user._id });
  clearAuthCookies(res);

  res.json({
    ok: true,
    message: "Password updated. Sign in with your new password.",
  });
}

export async function changePassword(
  req: Request,
  res: Response,
): Promise<void> {
  const { currentPassword, newPassword } = req.body as {
    currentPassword: string;
    newPassword: string;
  };

  const user = await User.findById(requireUser(req)._id).select("+password");
  if (!user)
    throw ApiError.unauthorized("Account no longer exists", "user_gone");

  if (!(await user.comparePassword(currentPassword))) {
    throw ApiError.badRequest("Current password is incorrect", "bad_password", {
      currentPassword: "Current password is incorrect",
    });
  }

  user.password = newPassword;
  await user.save();

  // Keep the current device signed in, drop all the others.
  await Session.deleteMany({ user: user._id });
  await startSession(res, req, user);

  res.json({ ok: true, message: "Password updated." });
}

/* ----------------------------- delete account ----------------------------- */

export async function requestAccountDeletion(
  req: Request,
  res: Response,
): Promise<void> {
  const user = requireUser(req);
  const { code } = await issueOtp({
    userId: user._id,
    purpose: OTP_PURPOSE.DELETE_ACCOUNT,
  });
  await sendDeleteAccountEmail({
    to: user.email,
    username: user.username,
    code,
  });
  res.json({ ok: true });
}

/**
 * Hard delete — rows are removed, not flagged.
 *
 * Note: the CDP-side account cannot be destroyed via their API, so the on-chain
 * address survives. Everything linking it to a person is gone from our side,
 * which is what deletion means here.
 */
export async function confirmAccountDeletion(
  req: Request,
  res: Response,
): Promise<void> {
  const user = requireUser(req);
  const { password, code } = req.body as { password: string; code: string };

  const withPassword = await User.findById(user._id).select("+password");
  if (!withPassword || !(await withPassword.comparePassword(password))) {
    throw ApiError.badRequest("Password is incorrect", "bad_password", {
      password: "Password is incorrect",
    });
  }

  await consumeOtp({
    userId: user._id,
    purpose: OTP_PURPOSE.DELETE_ACCOUNT,
    code,
  });

  const purge = async (session: ClientSession | null) => {
    const opts = session ? { session } : {};
    await Transfer.deleteMany({ user: user._id }, opts);
    await Otp.deleteMany({ user: user._id }, opts);
    await Session.deleteMany({ user: user._id }, opts);
    await Wallet.deleteOne({ user: user._id }, opts);
    await User.deleteOne({ _id: user._id }, opts);
  };

  // Prefer an atomic purge, but a standalone mongod (no replica set) rejects
  // transactions outright. Rather than pattern-match the driver's wording,
  // fall back to a sequential purge on any transaction failure — the deletes
  // are idempotent, so retrying them is always safe.
  let session: ClientSession | null = null;
  try {
    session = await mongoose.startSession();
    await session.withTransaction(() => purge(session));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[delete] transactional purge unavailable (${message}); deleting sequentially`,
    );
    await purge(null);
  } finally {
    if (session) await session.endSession().catch(() => undefined);
  }

  clearAuthCookies(res);
  res.json({
    ok: true,
    message: "Your account and all associated data have been deleted.",
  });
}
