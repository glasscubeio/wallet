/**
 * Prints the gas station's address and balance.
 *
 * The address is never stored anywhere — it's derived from
 * OPERATOR_PRIVATE_KEY, so the two can't drift out of sync. This is just the
 * convenient way to find out where to send ETH.
 *
 *   bun run operator
 */
import { formatEther, parseEther } from "viem";
import { env, gasStationConfigured } from "../config/env.ts";
import { getOperatorStatus } from "../services/gasStation.service.ts";

if (!gasStationConfigured) {
  console.error("OPERATOR_PRIVATE_KEY is not set in .env\n");
  console.error("Generate one with:");
  console.error(
    `  bun -e "import('viem/accounts').then(m=>{const k=m.generatePrivateKey();console.log(k, m.privateKeyToAccount(k).address)})"`,
  );
  process.exit(1);
}

const status = await getOperatorStatus();
const floor = parseEther(env.OPERATOR_MIN_BALANCE_ETH);

console.log(`
  Gas station (${env.NETWORK})

  address   ${status.address}
  balance   ${status.balanceEth} ETH${status.low ? `  ⚠ below the ${env.OPERATOR_MIN_BALANCE_ETH} ETH floor` : ""}
  capacity  ~${status.estimatedTransfersRemaining} more transfers
  explorer  ${env.EXPLORER_BASE_URL}/address/${status.address}
`);

if (status.low) {
  console.log(`  Fund it with Base Sepolia ETH:`);
  console.log(`    https://www.alchemy.com/faucets/base-sepolia`);
  console.log(`  Needs at least ${formatEther(floor)} ETH to clear the health check.\n`);
}
