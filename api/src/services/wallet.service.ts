import type { Types } from "mongoose";
import { Wallet, type WalletDoc } from "../models/Wallet.ts";
import { provisionWallet } from "./cdp.service.ts";
import { cdpConfigured } from "../config/env.ts";
import { ApiError } from "../utils/ApiError.ts";

/**
 * Returns the user's wallet, creating it on CDP if it doesn't exist yet.
 *
 * Registration calls this too, but tolerates failure — so a CDP hiccup never
 * blocks signup, and the wallet is created on the next request instead.
 */
export async function ensureWallet(userId: Types.ObjectId | string): Promise<WalletDoc> {
  const existing = await Wallet.findOne({ user: userId });
  if (existing) return existing;

  if (!cdpConfigured) {
    throw ApiError.unavailable("Wallet provider is not configured yet", "cdp_not_configured");
  }

  const provisioned = await provisionWallet(userId.toString());

  // Upsert guards the race where two parallel requests both provision: CDP is
  // idempotent by name, so both get the same address and one row wins.
  const wallet = await Wallet.findOneAndUpdate(
    { user: userId },
    { $setOnInsert: { user: userId, ...provisioned } },
    { new: true, upsert: true },
  );

  return wallet;
}

/** Best-effort provisioning used during registration. Never throws. */
export async function tryEnsureWallet(
  userId: Types.ObjectId | string,
): Promise<WalletDoc | null> {
  try {
    return await ensureWallet(userId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[wallet] deferred provisioning for ${String(userId)}: ${message}`);
    return null;
  }
}
