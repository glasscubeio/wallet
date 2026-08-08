import type { Request, Response } from "express";
import { getAddress, isAddress } from "viem";
import {
  env,
  basescanConfigured,
  moonpayConfigured,
  cdpConfigured,
  gasStationConfigured,
} from "../config/env.ts";
import { ApiError } from "../utils/ApiError.ts";
import { Transfer, TRANSFER_STATUS, type TransferDoc } from "../models/Transfer.ts";
import { OTP_PURPOSE } from "../models/Otp.ts";
import type { WalletDoc } from "../models/Wallet.ts";
import { ensureWallet } from "../services/wallet.service.ts";
import { getUsdcBalance, signTransferAuthorization } from "../services/cdp.service.ts";
import { relayTransfer, getOperatorStatus } from "../services/gasStation.service.ts";
import { getUsdcTransfers, type ChainTransaction } from "../services/basescan.service.ts";
import { buildBuyUrl, buildSellUrl } from "../services/moonpay.service.ts";
import { issueOtp, consumeOtp } from "../services/otp.service.ts";
import { sendTransferOtpEmail } from "../services/email.service.ts";
import { toBaseUnits, fromBaseUnits } from "../utils/usdc.ts";
import { requireUser } from "../middleware/auth.ts";
import { parsedQuery } from "../middleware/validate.ts";

const ZERO = "0x0000000000000000000000000000000000000000";

function normalizeRecipient(to: string): string {
  if (!isAddress(to)) {
    throw ApiError.badRequest("That doesn't look like a valid wallet address", "bad_address", {
      to: "Enter a valid 0x… address",
    });
  }
  const checksummed = getAddress(to);
  if (checksummed === ZERO) {
    throw ApiError.badRequest("Can't send to the zero address", "bad_address", {
      to: "Can't send to the zero address",
    });
  }
  return checksummed;
}

function serializeTransfer(t: TransferDoc) {
  return {
    id: t._id.toString(),
    to: t.to,
    from: t.from,
    amount: fromBaseUnits(t.amount),
    status: t.status,
    txHash: t.txHash,
    error: t.error,
    explorerUrl: t.txHash ? `${env.EXPLORER_BASE_URL}/tx/${t.txHash}` : null,
    createdAt: t.createdAt,
  };
}

/* ---------------------------------- read ---------------------------------- */

export async function getWallet(req: Request, res: Response): Promise<void> {
  const wallet = await ensureWallet(requireUser(req)._id);
  const balance = await getUsdcBalance(wallet.address);

  res.json({
    address: wallet.address,
    network: wallet.network,
    chainId: env.CHAIN_ID,
    explorerUrl: `${env.EXPLORER_BASE_URL}/address/${wallet.address}`,
    balance: {
      raw: balance.toString(),
      formatted: fromBaseUnits(balance),
      symbol: "USDC",
      decimals: 6,
    },
    gasSponsored: true,
  });
}

export async function getBalance(req: Request, res: Response): Promise<void> {
  const wallet = await ensureWallet(requireUser(req)._id);
  const balance = await getUsdcBalance(wallet.address);
  res.json({
    raw: balance.toString(),
    formatted: fromBaseUnits(balance),
    symbol: "USDC",
    decimals: 6,
  });
}

/**
 * Chain history from Basescan, with any still-unconfirmed local sends merged
 * in on top — so a transfer shows up the instant it's submitted rather than
 * when the indexer notices it.
 */
export async function getTransactions(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const wallet = await ensureWallet(user._id);
  const { page, limit } = parsedQuery<{ page: number; limit: number }>(req);

  let chain: ChainTransaction[] = [];
  let indexerError: string | null = null;

  if (basescanConfigured) {
    try {
      chain = await getUsdcTransfers(wallet.address, { page, limit });
    } catch (err) {
      console.error("[transactions] basescan failed", err);
      indexerError = err instanceof Error ? err.message : String(err);
    }
  } else {
    indexerError = "BASESCAN_API_KEY not configured";
  }

  const confirmedHashes = new Set(chain.map((t) => t.hash.toLowerCase()));

  const local = await Transfer.find({
    user: user._id,
    status: { $in: [TRANSFER_STATUS.BROADCASTING, TRANSFER_STATUS.COMPLETED] },
  })
    .sort({ createdAt: -1 })
    .limit(limit);

  const pending = local
    .filter((t) => !t.txHash || !confirmedHashes.has(t.txHash.toLowerCase()))
    .map((t) => ({
      hash: t.txHash,
      direction: "out" as const,
      from: t.from,
      to: t.to,
      amount: fromBaseUnits(t.amount),
      symbol: "USDC",
      timestamp: t.createdAt.getTime(),
      status: t.status === TRANSFER_STATUS.COMPLETED ? "confirmed" : "pending",
      explorerUrl: t.txHash ? `${env.EXPLORER_BASE_URL}/tx/${t.txHash}` : null,
      source: "local" as const,
    }));

  const transactions = [
    ...pending,
    ...chain.map((t) => ({ ...t, status: "confirmed" as const })),
  ].sort((a, b) => b.timestamp - a.timestamp);

  res.json({ transactions, address: wallet.address, indexerError });
}

/* ---------------------------------- send ---------------------------------- */

/**
 * Signs the authorization with the user's key, then hands it to our gas
 * station to broadcast and pay for.
 */
async function signAndRelay(transfer: TransferDoc, wallet: WalletDoc): Promise<TransferDoc> {
  try {
    const auth = await signTransferAuthorization({
      wallet,
      to: transfer.to,
      value: BigInt(transfer.amount),
    });

    transfer.authorizationNonce = auth.nonce;
    transfer.validAfter = Number(auth.validAfter);
    transfer.validBefore = Number(auth.validBefore);
    transfer.status = TRANSFER_STATUS.BROADCASTING;
    await transfer.save();

    const result = await relayTransfer(auth);

    transfer.status = TRANSFER_STATUS.COMPLETED;
    transfer.txHash = result.txHash;
    transfer.gasPaidWei = result.gasPaidWei;
    transfer.relayerAddress = result.relayerAddress;
    await transfer.save();

    return transfer;
  } catch (err) {
    transfer.status = TRANSFER_STATUS.FAILED;
    transfer.error =
      err instanceof ApiError
        ? err.message
        : err instanceof Error
          ? err.message.slice(0, 500)
          : "Transfer failed";
    await transfer.save();

    if (err instanceof ApiError) throw err;
    throw ApiError.badRequest(
      "Transfer failed. Your balance has not changed.",
      "transfer_failed",
      { reason: transfer.error },
    );
  }
}

export async function initiateSend(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const wallet = await ensureWallet(user._id);
  const { to: rawTo, amount: rawAmount } = req.body as { to: string; amount: string };

  const to = normalizeRecipient(rawTo);

  let amountBaseUnits: bigint;
  try {
    amountBaseUnits = toBaseUnits(rawAmount);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid amount";
    throw ApiError.badRequest(message, "bad_amount", { amount: message });
  }

  if (amountBaseUnits <= 0n) {
    throw ApiError.badRequest("Enter an amount greater than zero", "bad_amount", {
      amount: "Enter an amount greater than zero",
    });
  }

  // The gas station pays the fee, so the user's whole balance is spendable —
  // but if it's dry, say so before taking a code from them.
  const operator = await getOperatorStatus();
  if (!operator.configured) {
    throw ApiError.unavailable(
      "Transfers are unavailable right now — the gas station isn't configured.",
      "gas_station_not_configured",
    );
  }
  if (operator.balanceWei === "0") {
    throw ApiError.unavailable(
      "Transfers are paused while we top up the network fee account. Try again shortly.",
      "gas_station_empty",
    );
  }

  const balance = await getUsdcBalance(wallet.address);
  if (balance < amountBaseUnits) {
    throw ApiError.badRequest(
      `Not enough USDC. Your balance is $${fromBaseUnits(balance)}.`,
      "insufficient_funds",
      { amount: `You only have $${fromBaseUnits(balance)}` },
    );
  }

  const transfer = await Transfer.create({
    user: user._id,
    from: wallet.address,
    to,
    amount: amountBaseUnits.toString(),
    status: env.REQUIRE_OTP_FOR_SEND
      ? TRANSFER_STATUS.PENDING_OTP
      : TRANSFER_STATUS.BROADCASTING,
  });

  // The emailed code is what authorises the signature. It's tied to this exact
  // transfer, so a code phished for one payment can't move a different one.
  if (env.REQUIRE_OTP_FOR_SEND) {
    const { code } = await issueOtp({
      userId: user._id,
      purpose: OTP_PURPOSE.SIGN_TRANSFER,
      payload: { transferId: transfer._id.toString() },
    });

    await sendTransferOtpEmail({
      to: user.email,
      username: user.username,
      code,
      amount: fromBaseUnits(amountBaseUnits),
      recipient: to,
    });

    res.status(202).json({
      requiresOtp: true,
      transfer: serializeTransfer(transfer),
      message: `We emailed a 6-digit code to ${user.email}.`,
    });
    return;
  }

  await signAndRelay(transfer, wallet);
  res.json({ requiresOtp: false, transfer: serializeTransfer(transfer) });
}

export async function confirmSend(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const { transferId, code } = req.body as { transferId: string; code: string };
  const wallet = await ensureWallet(user._id);

  const transfer = await Transfer.findOne({ _id: transferId, user: user._id });
  if (!transfer) throw ApiError.notFound("Transfer not found", "transfer_not_found");

  if (transfer.status !== TRANSFER_STATUS.PENDING_OTP) {
    throw ApiError.badRequest("This transfer was already processed", "transfer_settled");
  }

  const otp = await consumeOtp({
    userId: user._id,
    purpose: OTP_PURPOSE.SIGN_TRANSFER,
    code,
  });

  // Guards against a code issued for a different (e.g. smaller) transfer.
  if (otp.payload?.transferId !== transfer._id.toString()) {
    throw ApiError.badRequest("That code was issued for a different transfer", "otp_mismatch");
  }

  await signAndRelay(transfer, wallet);
  res.json({ transfer: serializeTransfer(transfer) });
}

/** Polled by the UI while a transfer is still in flight. */
export async function getTransfer(req: Request, res: Response): Promise<void> {
  const transfer = await Transfer.findOne({
    _id: req.params.id,
    user: requireUser(req)._id,
  });
  if (!transfer) throw ApiError.notFound("Transfer not found", "transfer_not_found");
  res.json({ transfer: serializeTransfer(transfer) });
}

/* ---------------------------------- ramps --------------------------------- */

export async function getOnrampUrl(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const wallet = await ensureWallet(user._id);
  const { amount } = parsedQuery<{ amount?: number }>(req);

  res.json({
    url: buildBuyUrl({
      walletAddress: wallet.address,
      email: user.email,
      amount,
      redirectUrl: `${env.WEB_ORIGIN.split(",")[0]}/?ramp=buy`,
    }),
  });
}

export async function getOfframpUrl(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const wallet = await ensureWallet(user._id);
  const { amount } = parsedQuery<{ amount?: number }>(req);

  res.json({
    url: buildSellUrl({
      walletAddress: wallet.address,
      email: user.email,
      amount,
      redirectUrl: `${env.WEB_ORIGIN.split(",")[0]}/?ramp=sell`,
    }),
  });
}

/** Lets the UI hide buttons whose provider hasn't been configured yet. */
export function getCapabilities(_req: Request, res: Response): void {
  res.json({
    wallet: cdpConfigured,
    gasStation: gasStationConfigured,
    history: basescanConfigured,
    onramp: moonpayConfigured,
    offramp: moonpayConfigured,
    otpOnSend: env.REQUIRE_OTP_FOR_SEND,
    network: env.NETWORK,
    chainId: env.CHAIN_ID,
    explorerBaseUrl: env.EXPLORER_BASE_URL,
  });
}
