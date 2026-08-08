import crypto from "node:crypto";
import { env, moonpayConfigured } from "../config/env.ts";
import { ApiError } from "../utils/ApiError.ts";

interface RampArgs {
  walletAddress: string;
  email?: string;
  amount?: number | undefined;
  redirectUrl?: string;
}

/**
 * MoonPay requires the widget URL to be signed with the secret key: HMAC-SHA256
 * over the query string (leading "?" included), base64, appended as `signature`.
 * Signing must happen server-side — the secret never reaches the browser.
 */
function signUrl(url: URL): string {
  const signature = crypto
    .createHmac("sha256", env.MOONPAY_SECRET_KEY as string)
    .update(url.search)
    .digest("base64");

  return `${url.toString()}&signature=${encodeURIComponent(signature)}`;
}

function assertConfigured(): void {
  if (!moonpayConfigured) {
    throw ApiError.unavailable(
      "MoonPay is not configured (missing MOONPAY_PUBLISHABLE_KEY / MOONPAY_SECRET_KEY)",
      "moonpay_not_configured",
    );
  }
}

/** On-ramp: card -> USDC delivered to the user's wallet. */
export function buildBuyUrl({ walletAddress, email, amount, redirectUrl }: RampArgs): string {
  assertConfigured();

  const url = new URL(env.MOONPAY_BUY_URL);
  url.searchParams.set("apiKey", env.MOONPAY_PUBLISHABLE_KEY as string);
  url.searchParams.set("currencyCode", env.MOONPAY_CURRENCY_CODE);
  url.searchParams.set("walletAddress", walletAddress);
  if (email) url.searchParams.set("email", email);
  if (amount) url.searchParams.set("baseCurrencyAmount", String(amount));
  url.searchParams.set("baseCurrencyCode", "usd");
  if (redirectUrl) url.searchParams.set("redirectURL", redirectUrl);

  return signUrl(url);
}

/** Off-ramp: USDC -> bank/card payout. */
export function buildSellUrl({ walletAddress, email, amount, redirectUrl }: RampArgs): string {
  assertConfigured();

  const url = new URL(env.MOONPAY_SELL_URL);
  url.searchParams.set("apiKey", env.MOONPAY_PUBLISHABLE_KEY as string);
  url.searchParams.set("baseCurrencyCode", env.MOONPAY_CURRENCY_CODE);
  url.searchParams.set("refundWalletAddress", walletAddress);
  if (email) url.searchParams.set("email", email);
  if (amount) url.searchParams.set("baseCurrencyAmount", String(amount));
  url.searchParams.set("quoteCurrencyCode", "usd");
  if (redirectUrl) url.searchParams.set("redirectURL", redirectUrl);

  return signUrl(url);
}
