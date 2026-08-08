import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowUpRight, Plus, Banknote, RefreshCw, Fuel, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Rule } from "@/components/ui/card";
import { CopyAddress } from "@/components/CopyAddress";
import { TransactionRow } from "@/components/TransactionRow";
import { SendDialog } from "@/components/SendDialog";
import { walletApi } from "@/lib/api";
import { formatUsd, cn } from "@/lib/utils";
import type { Capabilities, Transaction, WalletDetail } from "@/types/api";

function BalanceSkeleton() {
  return (
    <div className="h-[52px] w-44 animate-pulse rounded-lg bg-line" aria-label="Loading balance" />
  );
}

export default function Dashboard() {
  const [wallet, setWallet] = useState<WalletDetail | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [rampLoading, setRampLoading] = useState<"buy" | "sell" | null>(null);

  const load = useCallback(async ({ quiet = false }: { quiet?: boolean } = {}) => {
    if (quiet) setRefreshing(true);
    try {
      const [walletData, txData] = await Promise.all([
        walletApi.get(),
        walletApi.transactions(6).catch(() => ({ transactions: [] as Transaction[] })),
      ]);
      setWallet(walletData);
      setTransactions(txData.transactions);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    walletApi.capabilities().then(setCaps).catch(() => undefined);
    void load();
  }, [load]);

  // A pending send resolves on chain in a few seconds — poll until it settles.
  useEffect(() => {
    if (!transactions.some((t) => t.status === "pending")) return;
    const timer = setInterval(() => void load({ quiet: true }), 4000);
    return () => clearInterval(timer);
  }, [transactions, load]);

  async function openRamp(kind: "buy" | "sell") {
    setRampLoading(kind);
    try {
      const { url } = kind === "buy" ? await walletApi.onramp() : await walletApi.offramp();
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setRampLoading(null);
    }
  }

  const balance = wallet?.balance.formatted ?? "0";

  return (
    <div className="space-y-8">
      {/* The ledger head: balance, the rule, then the address written beneath it. */}
      <section>
        <div className="flex items-start justify-between gap-4">
          <span className="eyebrow">Balance</span>
          <button
            onClick={() => void load({ quiet: true })}
            className="rounded-md p-1 text-ink-faint transition-colors hover:text-indigo"
            aria-label="Refresh balance"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          </button>
        </div>

        <div className="mt-2 flex items-baseline gap-2.5">
          {loading ? (
            <BalanceSkeleton />
          ) : (
            <>
              <span className="tnum font-display text-[46px] font-semibold leading-none tracking-[-0.025em] text-ink sm:text-[54px]">
                <span className="text-ink-faint">$</span>
                {formatUsd(balance)}
              </span>
              <span className="text-[13px] font-medium text-ink-faint">USDC</span>
            </>
          )}
        </div>

        <Rule className="mt-5" />

        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <CopyAddress address={wallet?.address} />
          <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-faint">
            <Fuel className="h-3.5 w-3.5" aria-hidden="true" />
            Fees covered
          </span>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-4 flex items-start gap-2.5 rounded-[10px] border border-debit/25 bg-debit/6 px-3.5 py-3 text-[13px] text-debit"
          >
            <AlertCircle className="mt-[2px] h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}
      </section>

      <section className="grid grid-cols-3 gap-2.5">
        <Button size="lg" onClick={() => setSendOpen(true)} disabled={!wallet}>
          <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          Send
        </Button>
        <Button
          size="lg"
          variant="secondary"
          onClick={() => void openRamp("buy")}
          loading={rampLoading === "buy"}
          disabled={!wallet || (caps !== null && !caps.onramp)}
          title={caps && !caps.onramp ? "MoonPay isn't configured yet" : undefined}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Buy
        </Button>
        <Button
          size="lg"
          variant="secondary"
          onClick={() => void openRamp("sell")}
          loading={rampLoading === "sell"}
          disabled={!wallet || (caps !== null && !caps.offramp)}
          title={caps && !caps.offramp ? "MoonPay isn't configured yet" : undefined}
        >
          <Banknote className="h-4 w-4" aria-hidden="true" />
          Cash out
        </Button>
      </section>

      {/* The rules continue downward — balance and history are one ledger. */}
      <section>
        <div className="flex items-baseline justify-between">
          <span className="eyebrow">Activity</span>
          {transactions.length > 0 && (
            <Link
              to="/activity"
              className="text-[13px] font-medium text-indigo transition-opacity hover:opacity-70"
            >
              See all
            </Link>
          )}
        </div>

        <Rule className="mt-2.5" />

        {loading ? (
          <div className="space-y-3 py-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-11 animate-pulse rounded-lg bg-line" />
            ))}
          </div>
        ) : transactions.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-[14.5px] font-medium text-ink">No activity yet</p>
            <p className="mx-auto mt-1 max-w-[34ch] text-[13.5px] leading-relaxed text-ink-soft">
              Add USDC to your wallet, or share your address to receive your first payment.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-line">
            {transactions.map((tx, i) => (
              <TransactionRow key={tx.hash ?? `${tx.timestamp}-${i}`} tx={tx} />
            ))}
          </div>
        )}
      </section>

      <SendDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        balance={balance}
        onSent={() => void load({ quiet: true })}
      />
    </div>
  );
}
