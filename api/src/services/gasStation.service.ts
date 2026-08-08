import {
  createWalletClient,
  http,
  defineChain,
  parseSignature,
  parseEther,
  formatEther,
  getAddress,
  type Address,
  type Hex,
  type TransactionReceipt,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { env, gasStationConfigured } from "../config/env.ts";
import { ApiError } from "../utils/ApiError.ts";
import { publicClient } from "./cdp.service.ts";
import type { TransferAuthorization } from "./cdp.service.ts";

/**
 * EIP-3009. `transferWithAuthorization` is deliberately callable by anyone —
 * the authority comes from the signature, not from msg.sender — which is
 * precisely what lets our operator submit a transfer on a user's behalf.
 */
const EIP3009_ABI = [
  {
    name: "transferWithAuthorization",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    name: "authorizationState",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "authorizer", type: "address" },
      { name: "nonce", type: "bytes32" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

const chain = defineChain({
  id: env.CHAIN_ID,
  name: env.NETWORK,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [env.RPC_URL] } },
});

function operatorAccount() {
  if (!gasStationConfigured) {
    throw ApiError.unavailable(
      "The gas station is not configured (missing OPERATOR_PRIVATE_KEY)",
      "gas_station_not_configured",
    );
  }
  return privateKeyToAccount(env.OPERATOR_PRIVATE_KEY as Hex);
}

let walletClient: ReturnType<typeof createWalletClient> | null = null;

function relayer() {
  walletClient ??= createWalletClient({
    account: operatorAccount(),
    chain,
    transport: http(env.RPC_URL),
  });
  return walletClient;
}

export function operatorAddress(): Address | null {
  if (!gasStationConfigured) return null;
  return operatorAccount().address;
}

/**
 * The operator is a single account, so its transaction nonces must be issued
 * in order. Without this, two users sending at the same moment would both be
 * assigned the same nonce and one would be dropped by the node.
 *
 * A promise chain is enough here because there is one API process per host; a
 * multi-process deployment would need this moved into Redis or a nonce manager.
 */
let queue: Promise<unknown> = Promise.resolve();

function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  // Keep the chain alive even if this task rejects.
  queue = run.catch(() => undefined);
  return run;
}

export interface RelayResult {
  txHash: Hex;
  receipt: TransactionReceipt;
  gasPaidWei: string;
  relayerAddress: Address;
}

/**
 * Broadcasts a user's signed authorization and pays the gas for it.
 *
 * The operator can only ever move funds a user has explicitly signed for: it
 * holds no USDC of its own and has no allowance over anyone's balance.
 */
export async function relayTransfer(auth: TransferAuthorization): Promise<RelayResult> {
  const client = relayer();
  const account = operatorAccount();
  const usdc = getAddress(env.USDC_ADDRESS);
  const { r, s, v, yParity } = parseSignature(auth.signature);

  const args = [
    auth.from,
    auth.to,
    auth.value,
    auth.validAfter,
    auth.validBefore,
    auth.nonce,
    // Older USDC implementations want 27/28 rather than a 0/1 yParity.
    Number(v ?? BigInt(yParity) + 27n),
    r,
    s,
  ] as const;

  return serialize(async () => {
    // Simulate first: a revert here costs nothing, whereas broadcasting a
    // doomed transaction still burns the operator's ETH.
    try {
      await publicClient.simulateContract({
        address: usdc,
        abi: EIP3009_ABI,
        functionName: "transferWithAuthorization",
        args,
        account: account.address,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw ApiError.badRequest(
        "The network rejected this transfer. Your balance has not changed.",
        "authorization_rejected",
        { reason: message.slice(0, 300) },
      );
    }

    const txHash = await client.writeContract({
      address: usdc,
      abi: EIP3009_ABI,
      functionName: "transferWithAuthorization",
      args,
      account,
      chain,
    });

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      timeout: 60_000,
    });

    if (receipt.status !== "success") {
      throw ApiError.badRequest(
        "The transfer failed on chain. Your balance has not changed.",
        "transfer_reverted",
      );
    }

    return {
      txHash,
      receipt,
      gasPaidWei: (receipt.gasUsed * receipt.effectiveGasPrice).toString(),
      relayerAddress: account.address,
    };
  });
}

/** True once this authorization has been used — the on-chain replay guard. */
export async function isAuthorizationUsed(authorizer: string, nonce: Hex): Promise<boolean> {
  return publicClient.readContract({
    address: getAddress(env.USDC_ADDRESS),
    abi: EIP3009_ABI,
    functionName: "authorizationState",
    args: [getAddress(authorizer), nonce],
  });
}

export interface OperatorStatus {
  configured: boolean;
  address: Address | null;
  balanceWei: string;
  balanceEth: string;
  /** Below the configured floor — top the operator up or sends will start failing. */
  low: boolean;
  /** Very rough: Base Sepolia transfers land well under 100k gas. */
  estimatedTransfersRemaining: number | null;
}

/** Surfaced on /health so an empty gas tank is visible before users hit it. */
export async function getOperatorStatus(): Promise<OperatorStatus> {
  if (!gasStationConfigured) {
    return {
      configured: false,
      address: null,
      balanceWei: "0",
      balanceEth: "0",
      low: true,
      estimatedTransfersRemaining: null,
    };
  }

  const address = operatorAccount().address;
  const balance = await publicClient.getBalance({ address });
  const floor = parseEther(env.OPERATOR_MIN_BALANCE_ETH);

  // ~80k gas at ~0.01 gwei is a generous allowance on Base.
  const perTransfer = 80_000n * 10_000_000n;

  return {
    configured: true,
    address,
    balanceWei: balance.toString(),
    balanceEth: formatEther(balance),
    low: balance < floor,
    estimatedTransfersRemaining: Number(balance / perTransfer),
  };
}
