import { CdpClient } from "@coinbase/cdp-sdk";
import {
  createPublicClient,
  http,
  erc20Abi,
  getAddress,
  type Address,
  type Hex,
} from "viem";
import crypto from "node:crypto";
import { env, cdpConfigured } from "../config/env.ts";
import { ApiError } from "../utils/ApiError.ts";
import type { WalletDoc } from "../models/Wallet.ts";

let client: CdpClient | null = null;

/**
 * A CDP Wallet Secret is a base64 PKCS8-encoded EC P-256 private key, which
 * decodes to roughly 138 bytes. Checking the shape up front turns an opaque
 * upstream "UnknownError" on the first write into a message that names the
 * actual problem — worth doing because reads (listAccounts) succeed with only
 * the API key, so a bad Wallet Secret looks like working credentials until
 * something tries to create or sign.
 */
export async function checkWalletSecret(): Promise<{ ok: boolean; reason?: string }> {
  const secret = env.CDP_WALLET_SECRET;
  if (!secret) return { ok: false, reason: "CDP_WALLET_SECRET is empty" };

  let der: Uint8Array<ArrayBuffer>;
  try {
    // Copy into a Uint8Array backed by a real ArrayBuffer. A Buffer's backing
    // store is typed as ArrayBufferLike, which importKey's BufferSource rejects.
    const bytes = Buffer.from(secret, "base64");
    der = new Uint8Array(new ArrayBuffer(bytes.byteLength));
    der.set(bytes);
  } catch {
    return { ok: false, reason: "CDP_WALLET_SECRET is not valid base64" };
  }

  try {
    await crypto.subtle.importKey(
      "pkcs8",
      der,
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign"],
    );
    return { ok: true };
  } catch {
    return {
      ok: false,
      reason:
        `CDP_WALLET_SECRET is ${secret.length} chars (decodes to ${der.length} bytes) and is not a P-256 PKCS8 key. ` +
        `Copy the "Wallet Secret" from the CDP portal — it's ~120+ chars, not the API key secret.`,
    };
  }
}

function cdp(): CdpClient {
  if (!cdpConfigured) {
    throw ApiError.unavailable(
      "Wallet provider is not configured (missing CDP_API_KEY_ID / CDP_API_KEY_SECRET / CDP_WALLET_SECRET)",
      "cdp_not_configured",
    );
  }
  client ??= new CdpClient({
    apiKeyId: env.CDP_API_KEY_ID,
    apiKeySecret: env.CDP_API_KEY_SECRET,
    walletSecret: env.CDP_WALLET_SECRET,
  });
  return client;
}

/** Read-only chain access. */
export const publicClient = createPublicClient({ transport: http(env.RPC_URL) });

/**
 * CDP account names must be 2-36 chars of [a-zA-Z0-9-]. A Mongo ObjectId is
 * 24 hex chars, so this always fits and is stable per user.
 */
function accountName(userId: string): string {
  return `wallet-${userId}`;
}

export interface ProvisionedWallet {
  address: Address;
  accountName: string;
  network: string;
}

/**
 * Creates (or re-fetches) the user's wallet — a plain EOA.
 *
 * Idempotent: CDP resolves by name, so a retried registration returns the same
 * address rather than stranding a second wallet.
 */
export async function provisionWallet(userId: string): Promise<ProvisionedWallet> {
  const name = accountName(userId);
  const account = await cdp().evm.getOrCreateAccount({ name });

  return {
    address: getAddress(account.address),
    accountName: name,
    network: env.NETWORK,
  };
}

/** USDC balance in base units (6 dp). */
export async function getUsdcBalance(address: string): Promise<bigint> {
  return publicClient.readContract({
    address: getAddress(env.USDC_ADDRESS),
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [getAddress(address)],
  });
}

export interface TransferAuthorization {
  from: Address;
  to: Address;
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
  nonce: Hex;
  signature: Hex;
}

/**
 * Produces an EIP-3009 `TransferWithAuthorization` signature.
 *
 * This is what makes the gas station possible: the user's key signs a typed
 * message off-chain — costing nothing and requiring no ETH — and our operator
 * wallet is the one that pays to put it on chain.
 *
 * The signature authorises exactly one transfer: this amount, to this
 * recipient, inside this time window, with a nonce that the USDC contract
 * itself refuses to accept twice.
 */
export async function signTransferAuthorization({
  wallet,
  to,
  value,
}: {
  wallet: WalletDoc;
  to: string;
  value: bigint;
}): Promise<TransferAuthorization> {
  const from = getAddress(wallet.address);
  const recipient = getAddress(to);

  const now = Math.floor(Date.now() / 1000);
  /*
    validAfter is 0, not `now - skew`. The contract enforces
    `block.timestamp > validAfter`, so any non-zero floor makes the transfer
    depend on our server clock agreeing with the chain's — and it reverts with
    "authorization is not yet valid" the moment the chain lags behind us.
    There's nothing to gain from a lower bound here: the authorization is
    already pinned by validBefore and by a nonce the contract only accepts once.
  */
  const validAfter = 0n;
  const validBefore = BigInt(now + env.AUTHORIZATION_TTL_SECONDS);
  const nonce = `0x${crypto.randomBytes(32).toString("hex")}` as Hex;

  const account = await cdp().evm.getOrCreateAccount({ name: wallet.accountName });

  const signature = await account.signTypedData({
    domain: {
      // Must match the deployed contract exactly or the signature is rejected.
      name: "USDC",
      version: "2",
      chainId: env.CHAIN_ID,
      verifyingContract: getAddress(env.USDC_ADDRESS),
    },
    types: {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "TransferWithAuthorization",
    message: {
      from,
      to: recipient,
      value,
      validAfter,
      validBefore,
      nonce,
    },
  });

  return { from, to: recipient, value, validAfter, validBefore, nonce, signature };
}
