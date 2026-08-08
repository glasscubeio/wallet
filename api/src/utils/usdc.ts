import { formatUnits, parseUnits } from "viem";

export const USDC_DECIMALS = 6;

/** "12.5" -> 12500000n (throws on more than 6 decimal places) */
export function toBaseUnits(amount: string | number): bigint {
  const trimmed = String(amount).trim();
  if (!/^\d+(\.\d{1,6})?$/.test(trimmed)) {
    throw new Error("Amount must be a positive number with at most 6 decimals");
  }
  return parseUnits(trimmed, USDC_DECIMALS);
}

/** 12500000n -> "12.5" */
export function fromBaseUnits(value: bigint | string): string {
  return formatUnits(BigInt(value), USDC_DECIMALS);
}

/** Display helper: always two decimals, like a fiat balance. */
export function formatUsd(value: bigint | string): string {
  return Number(fromBaseUnits(value)).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
