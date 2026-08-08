import { cn } from "@/lib/utils";

/**
 * The wordmark. "Hamyon" is Uzbek for wallet — set in the display serif with
 * the saffron dot, echoing the passbook line that runs through the rest of the
 * app.
 */
export function Brand({ className, size = "md" }: { className?: string; size?: "sm" | "md" | "lg" }) {
  const sizes: Record<"sm" | "md" | "lg", string> = {
    sm: "text-[17px]",
    md: "text-[21px]",
    lg: "text-[30px]",
  };

  return (
    <span className={cn("inline-flex items-baseline gap-[3px]", className)}>
      <span className={cn("font-display font-semibold tracking-[-0.02em] text-ink", sizes[size])}>
        hamyon
      </span>
      <span className="mb-[3px] h-[5px] w-[5px] rounded-full bg-saffron" aria-hidden="true" />
    </span>
  );
}
