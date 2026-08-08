#!/usr/bin/env bash
# Forks Base Sepolia, funds throwaway accounts, and runs the relayer for real.
set -euo pipefail
cd "$(dirname "$0")/.."

RPC=http://127.0.0.1:8545
USDC=0x036CbD53842c5426634e7929541eC2318f3dCF7e
# FiatTokenV2 keeps its balances mapping at storage slot 9.
BALANCES_SLOT=9

command -v anvil >/dev/null || { echo "anvil not found — install Foundry: https://getfoundry.sh"; exit 1; }

echo "forking Base Sepolia..."
anvil --fork-url "${FORK_RPC_URL:-https://sepolia.base.org}" --port 8545 --silent &
ANVIL_PID=$!
trap 'kill $ANVIL_PID 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do nc -z 127.0.0.1 8545 2>/dev/null && break; sleep 0.5; done
sleep 1

key() { bun -e "import('viem/accounts').then(m=>console.log(m.generatePrivateKey()))"; }
addr() { bun -e "import('viem/accounts').then(m=>console.log(m.privateKeyToAccount('$1').address))"; }

OP_KEY=$(key);   OP_ADDR=$(addr "$OP_KEY")
USER_KEY=$(key); USER_ADDR=$(addr "$USER_KEY")

# Operator gets ETH. The user deliberately gets none — only USDC.
cast rpc anvil_setBalance "$OP_ADDR" "$(cast to-wei 1 ether)" --rpc-url $RPC >/dev/null
cast rpc anvil_setStorageAt "$USDC" "$(cast index address "$USER_ADDR" $BALANCES_SLOT)" \
  "$(cast to-uint256 500000000)" --rpc-url $RPC >/dev/null

MONGODB_URI=mongodb://127.0.0.1:27017/hamyon-test \
JWT_ACCESS_SECRET=0123456789abcdef0123456789abcdef \
JWT_REFRESH_SECRET=abcdef0123456789abcdef0123456789 \
RPC_URL=$RPC CHAIN_ID=84532 \
OPERATOR_PRIVATE_KEY="$OP_KEY" TEST_USER_KEY="$USER_KEY" \
bun test/gasStation.e2e.ts
