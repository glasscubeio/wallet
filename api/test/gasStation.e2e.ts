/**
 * End-to-end proof of the gas station against a fork of Base Sepolia.
 *
 * Uses the real relayTransfer() from the service. The only thing stubbed is
 * WHO holds the user's key: here a local key signs the EIP-712 payload, in
 * production CDP signs the identical payload.
 */
import {
  createPublicClient,
  http,
  erc20Abi,
  getAddress,
  formatEther,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { relayTransfer, getOperatorStatus } from "../src/services/gasStation.service.ts";

const RPC = "http://127.0.0.1:8545";
const USDC = getAddress("0x036CbD53842c5426634e7929541eC2318f3dCF7e");

const pub = createPublicClient({ transport: http(RPC) });

const user = privateKeyToAccount(process.env.TEST_USER_KEY as Hex);
const recipient = getAddress("0x2222222222222222222222222222222222222222");

const balanceOf = (who: string) =>
  pub.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [getAddress(who)] });

const usd = (v: bigint) => (Number(v) / 1e6).toFixed(2);

let failures = 0;
const check = (label: string, ok: boolean, extra = "") => {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${extra ? "  " + extra : ""}`);
};

console.log("=== gas station end-to-end (Base Sepolia fork) ===\n");

const op = await getOperatorStatus();
console.log(`operator    ${op.address}`);
console.log(`  ETH       ${op.balanceEth}`);
console.log(`user        ${user.address}`);
console.log(`  USDC      $${usd(await balanceOf(user.address))}`);
console.log(`recipient   ${recipient}`);
console.log(`  USDC      $${usd(await balanceOf(recipient))}\n`);

// The user has zero ETH — the entire point of the gas station.
const userEth = await pub.getBalance({ address: user.address });
check("user holds ZERO ETH and still can send", userEth === 0n, `(${formatEther(userEth)} ETH)`);

const opEthBefore = await pub.getBalance({ address: op.address! });
const userBefore = await balanceOf(user.address);
const recipBefore = await balanceOf(recipient);

// --- sign exactly what cdp.service.ts signs -------------------------------
const value = 25_000_000n; // $25.00
const now = Math.floor(Date.now() / 1000);
const validAfter = 0n;
const validBefore = BigInt(now + 600);
const nonce = ("0x" + Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")) as Hex;

const signature = await user.signTypedData({
  domain: { name: "USDC", version: "2", chainId: 84532, verifyingContract: USDC },
  types: {
    TransferWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  },
  primaryType: "TransferWithAuthorization",
  message: { from: user.address, to: recipient, value, validAfter, validBefore, nonce },
});

// --- relay it through the real service ------------------------------------
console.log("\nrelaying $25.00 via the operator...");
const result = await relayTransfer({
  from: user.address,
  to: recipient,
  value,
  validAfter,
  validBefore,
  nonce,
  signature,
});
console.log(`  tx        ${result.txHash}`);
console.log(`  gas paid  ${formatEther(BigInt(result.gasPaidWei))} ETH by ${result.relayerAddress}\n`);

const userAfter = await balanceOf(user.address);
const recipAfter = await balanceOf(recipient);
const opEthAfter = await pub.getBalance({ address: op.address! });

check("recipient received exactly $25.00", recipAfter - recipBefore === value, `$${usd(recipAfter - recipBefore)}`);
check("sender debited exactly $25.00", userBefore - userAfter === value, `$${usd(userBefore - userAfter)}`);
check("no fee taken from the USDC amount", recipAfter - recipBefore === userBefore - userAfter);
check("OPERATOR paid the gas", opEthAfter < opEthBefore, `-${formatEther(opEthBefore - opEthAfter)} ETH`);
check("user's ETH still untouched at zero", (await pub.getBalance({ address: user.address })) === 0n);

// --- replay must be impossible --------------------------------------------
console.log("\nattempting to replay the same authorization...");
let replayBlocked = false;
let replayMsg = "";
try {
  await relayTransfer({ from: user.address, to: recipient, value, validAfter, validBefore, nonce, signature });
} catch (err) {
  replayBlocked = true;
  replayMsg = err instanceof Error ? err.message : String(err);
}
check("replay rejected by the contract nonce guard", replayBlocked, replayMsg.slice(0, 60));

// --- a tampered amount must not verify -------------------------------------
console.log("\nattempting to reuse the signature for a LARGER amount...");
let tamperBlocked = false;
try {
  await relayTransfer({
    from: user.address,
    to: recipient,
    value: 400_000_000n, // $400 instead of $25
    validAfter,
    validBefore,
    nonce: ("0x" + Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")) as Hex,
    signature,
  });
} catch {
  tamperBlocked = true;
}
check("tampered amount rejected (signature covers the value)", tamperBlocked);

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures ? 1 : 0);
