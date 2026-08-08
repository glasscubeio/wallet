import { useCallback, useEffect, useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Rule } from "@/components/ui/card";
import { TransactionRow } from "@/components/TransactionRow";
import { CopyAddress } from "@/components/CopyAddress";
import { walletApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { TransactionsResponse } from "@/types/api";

const EMPTY: TransactionsResponse = { transactions: [], address: "", indexerError: null };

export default function Activity() {
  const [data, setData] = useState<TransactionsResponse>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async ({ quiet = false }: { quiet?: boolean } = {}) => {
    if (quiet) setRefreshing(true);
    try {
      setData(await walletApi.transactions(100));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!data.transactions.some((t) => t.status === "pending")) return;
    const timer = setInterval(() => void load({ quiet: true }), 4000);
    return () => clearInterval(timer);
  }, [data.transactions, load]);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-[26px] font-semibold tracking-[-0.02em] text-ink">
              Activity
            </h1>
            <p className="mt-1 text-[13.5px] text-ink-soft">
              Every USDC transfer in and out of your wallet.
            </p>
          </div>
          <button
            onClick={() => void load({ quiet: true })}
            className="mt-1 rounded-md p-1 text-ink-faint transition-colors hover:text-indigo"
            aria-label="Refresh activity"
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          </button>
        </div>

        {data.address && (
          <div className="mt-3">
            <CopyAddress address={data.address} />
          </div>
        )}
      </div>

      <Rule />

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-[10px] border border-debit/25 bg-debit/6 px-3.5 py-3 text-[13px] text-debit"
        >
          <AlertCircle className="mt-[2px] h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {/* Confirmed history comes from the indexer; say so when it's unavailable
          rather than silently showing a short list. */}
      {data.indexerError && !loading && (
        <div className="rounded-[10px] border border-line bg-card px-3.5 py-3 text-[13px] text-ink-soft">
          Confirmed history is unavailable right now
          {data.indexerError.includes("BASESCAN_API_KEY")
            ? " — the explorer key isn't set."
            : "."}{" "}
          Transfers you make in this app still appear below.
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-line" />
          ))}
        </div>
      ) : data.transactions.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-[15px] font-medium text-ink">Nothing here yet</p>
          <p className="mx-auto mt-1.5 max-w-[36ch] text-[13.5px] leading-relaxed text-ink-soft">
            Once you send or receive USDC, every transfer will be listed here with a link to
            Basescan.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-line">
          {data.transactions.map((tx, i) => (
            <TransactionRow key={tx.hash ?? `${tx.timestamp}-${i}`} tx={tx} />
          ))}
        </div>
      )}
    </div>
  );
}
