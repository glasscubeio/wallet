import { useEffect, useState } from "react";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { shortAddress, cn } from "@/lib/utils";

export interface CopyAddressProps {
  address: string | null | undefined;
  className?: string;
  full?: boolean;
}

/**
 * Copies the full address while showing the shortened form. The button holds
 * a "Copied" state for a beat so the feedback is visible without a toast on
 * its own — the toast is the fallback for screen readers and failures.
 */
export function CopyAddress({ address, className, full = false }: CopyAddressProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
    } catch {
      // Clipboard is blocked on insecure origins and some in-app browsers.
      toast.error("Couldn't copy. Select the address and copy it manually.");
    }
  }

  if (!address) {
    return <span className={cn("font-mono text-[13px] text-ink-faint", className)}>—</span>;
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "Address copied" : `Copy address ${address}`}
      className={cn(
        "group inline-flex items-center gap-2 rounded-[8px] px-1.5 py-1 -mx-1.5 font-mono text-[13px] text-ink-soft transition-colors hover:bg-indigo-wash hover:text-ink",
        className,
      )}
    >
      <span className={full ? "break-all text-left" : ""}>
        {full ? address : shortAddress(address)}
      </span>
      {copied ? (
        <Check className="h-3.5 w-3.5 shrink-0 text-credit" aria-hidden="true" />
      ) : (
        <Copy
          className="h-3.5 w-3.5 shrink-0 opacity-50 transition-opacity group-hover:opacity-100"
          aria-hidden="true"
        />
      )}
      <span aria-live="polite" className="sr-only">
        {copied ? "Copied to clipboard" : ""}
      </span>
    </button>
  );
}
