import type { ReactNode } from "react";
import { Brand } from "@/components/Brand";

/**
 * Shared frame for the signed-out screens. Deliberately quiet: one card on the
 * paper ground, the wordmark above it, and the network note below — so the
 * form is the only thing asking for attention.
 */
export default function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-paper px-4 py-10 sm:py-16">
      <div className="mx-auto w-full max-w-[400px]">
        <div className="mb-8 flex justify-center">
          <Brand size="lg" />
        </div>

        <div className="rounded-card border border-line bg-card p-6 shadow-[0_1px_2px_rgba(16,24,43,0.04)] sm:p-7">
          <h1 className="font-display text-[23px] font-semibold tracking-[-0.015em] text-ink">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1.5 text-[14px] leading-relaxed text-ink-soft">{subtitle}</p>
          )}

          <div className="mt-6">{children}</div>
        </div>

        {footer && <div className="mt-5 text-center text-[13.5px] text-ink-soft">{footer}</div>}

        <p className="mt-8 text-center text-[12px] text-ink-faint">
          Base Sepolia testnet · balances have no real value
        </p>
      </div>
    </div>
  );
}
