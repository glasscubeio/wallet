import { ArrowUpRight, ArrowDownLeft, Clock, ExternalLink } from "lucide-react";
import { shortAddress, formatUsd, formatRelativeTime, cn } from "@/lib/utils";
import type { Transaction } from "@/types/api";

/**
 * One ledger entry. Direction drives everything: the glyph, the sign, and the
 * colour — so the column can be scanned without reading a single label.
 */
export function TransactionRow({ tx }: { tx: Transaction }) {
  const isIn = tx.direction === "in";
  const pending = tx.status === "pending";
  const counterparty = isIn ? tx.from : tx.to;

  const Icon = pending ? Clock : isIn ? ArrowDownLeft : ArrowUpRight;

  return (
    <div className="flex items-center gap-3 py-3.5">
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
          pending
            ? "bg-saffron-wash text-saffron"
            : isIn
              ? "bg-credit/10 text-credit"
              : "bg-indigo-wash text-indigo",
        )}
      >
        <Icon className={cn("h-4 w-4", pending && "animate-pulse")} aria-hidden="true" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-[14.5px] font-medium text-ink">
            {pending ? "Sending" : isIn ? "Received" : "Sent"}
          </span>
          <span className="truncate font-mono text-[12.5px] text-ink-faint">
            {isIn ? "from" : "to"} {shortAddress(counterparty, 6, 4)}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-ink-faint">
          <span>{pending ? "Waiting for the network" : formatRelativeTime(tx.timestamp)}</span>
          {tx.explorerUrl && (
            <a
              href={tx.explorerUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 transition-colors hover:text-indigo"
            >
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
              <span className="sr-only">View on Basescan</span>
            </a>
          )}
        </div>
      </div>

      <div
        className={cn(
          "tnum shrink-0 text-[15px] font-medium",
          pending ? "text-ink-faint" : isIn ? "text-credit" : "text-ink",
        )}
      >
        {isIn ? "+" : "−"}${formatUsd(tx.amount)}
      </div>
    </div>
  );
}
