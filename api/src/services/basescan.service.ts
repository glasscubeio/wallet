import { env, basescanConfigured } from "../config/env.ts";
import { fromBaseUnits } from "../utils/usdc.ts";

export interface ChainTransaction {
  hash: string;
  direction: "in" | "out" | "unknown";
  from: string;
  to: string;
  amount: string;
  symbol: string;
  timestamp: number;
  blockNumber: number;
  confirmations: number;
  explorerUrl: string;
  source: "chain";
}

interface BasescanTokenTx {
  hash: string;
  from: string;
  to: string;
  value: string;
  tokenSymbol?: string;
  tokenDecimal?: string;
  timeStamp: string;
  blockNumber: string;
  confirmations?: string;
}

/**
 * Basescan/Etherscan V2 unified endpoint — one host, chain selected by
 * `chainid` (84532 = Base Sepolia). A Basescan key works here directly.
 */
async function query(params: Record<string, string | number>): Promise<BasescanTokenTx[]> {
  if (!basescanConfigured) throw new Error("BASESCAN_API_KEY is not configured");

  const url = new URL(env.BASESCAN_API_URL);
  url.searchParams.set("chainid", String(env.CHAIN_ID));
  url.searchParams.set("apikey", env.BASESCAN_API_KEY as string);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Basescan responded ${res.status}`);
  const body = (await res.json()) as { status?: string; message?: string; result?: unknown };

  // status "0" + "No transactions found" is an empty result, not an error.
  if (body.status === "0") {
    if (typeof body.message === "string" && /no (transactions|records) found/i.test(body.message)) {
      return [];
    }
    throw new Error(
      (typeof body.result === "string" ? body.result : body.message) || "Basescan request failed",
    );
  }

  return Array.isArray(body.result) ? (body.result as BasescanTokenTx[]) : [];
}

function normalize(tx: BasescanTokenTx, address: string): ChainTransaction {
  const me = address.toLowerCase();
  const from = (tx.from || "").toLowerCase();
  const to = (tx.to || "").toLowerCase();
  const decimals = Number(tx.tokenDecimal ?? 6);

  // A self-send shows as "out" rather than double-counting.
  const direction = from === me ? "out" : to === me ? "in" : "unknown";

  return {
    hash: tx.hash,
    direction,
    from: tx.from,
    to: tx.to,
    // Re-scale if the token ever reports something other than 6 dp.
    amount:
      decimals === 6 ? fromBaseUnits(tx.value) : (Number(tx.value) / 10 ** decimals).toString(),
    symbol: tx.tokenSymbol || "USDC",
    timestamp: Number(tx.timeStamp) * 1000,
    blockNumber: Number(tx.blockNumber),
    confirmations: Number(tx.confirmations ?? 0),
    explorerUrl: `${env.EXPLORER_BASE_URL}/tx/${tx.hash}`,
    source: "chain",
  };
}

/** USDC transfer history for an address, newest first. */
export async function getUsdcTransfers(
  address: string,
  { page = 1, limit = 50 }: { page?: number; limit?: number } = {},
): Promise<ChainTransaction[]> {
  const rows = await query({
    module: "account",
    action: "tokentx",
    contractaddress: env.USDC_ADDRESS,
    address,
    page,
    offset: limit,
    sort: "desc",
  });

  return rows.map((tx) => normalize(tx, address));
}
