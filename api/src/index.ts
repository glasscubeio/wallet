import { createApp } from "./app.ts";
import { connectDb, disconnectDb } from "./config/db.ts";
import {
  env,
  cdpConfigured,
  gasStationConfigured,
  resendConfigured,
  basescanConfigured,
  moonpayConfigured,
} from "./config/env.ts";
import { getOperatorStatus } from "./services/gasStation.service.ts";
import { checkWalletSecret } from "./services/cdp.service.ts";

async function reportConfig(): Promise<void> {
  const line = (label: string, ok: boolean) =>
    `  ${ok ? "✓" : "○"} ${label}${ok ? "" : "  (not configured)"}`;

  console.log(
    [
      `[hamyon] ${env.NODE_ENV} — ${env.NETWORK} (chain ${env.CHAIN_ID})`,
      line("CDP wallets (signing only, never user-facing)", cdpConfigured),
      line("Gas station (our operator wallet)", gasStationConfigured),
      line("Resend email", resendConfigured),
      line("Basescan history", basescanConfigured),
      line("MoonPay on/off ramp", moonpayConfigured),
    ].join("\n"),
  );

  if (cdpConfigured) {
    const walletSecret = await checkWalletSecret();
    if (!walletSecret.ok) {
      console.warn(`[hamyon] CDP credentials incomplete — ${walletSecret.reason}`);
      console.warn("[hamyon] reads will work but creating wallets and signing transfers will fail");
    }
  }

  if (!gasStationConfigured) {
    console.warn("[hamyon] no OPERATOR_PRIVATE_KEY — transfers will be rejected until one is set");
    return;
  }

  try {
    const operator = await getOperatorStatus();
    console.log(
      `[hamyon] gas station ${operator.address} — ${operator.balanceEth} ETH` +
        (operator.estimatedTransfersRemaining !== null
          ? ` (~${operator.estimatedTransfersRemaining} transfers)`
          : ""),
    );
    if (operator.low) {
      console.warn(
        `[hamyon] gas station is BELOW ${env.OPERATOR_MIN_BALANCE_ETH} ETH — top it up or sends will start failing`,
      );
    }
  } catch (err) {
    console.warn("[hamyon] could not read gas station balance:", err);
  }
}

async function main(): Promise<void> {
  await connectDb();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    void reportConfig();
    console.log(`[hamyon] listening on http://localhost:${env.PORT}`);
  });

  const shutdown = (signal: string) => {
    console.log(`\n[hamyon] ${signal} received, shutting down`);
    server.close(() => {
      void disconnectDb().then(() => process.exit(0));
    });
    // Don't hang forever on a stuck connection.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err: unknown) => {
  console.error("[hamyon] failed to start", err);
  process.exit(1);
});
