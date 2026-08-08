# Gas station end-to-end test

Proves the relayer against real Base Sepolia state: a user holding **zero ETH**
sends USDC, and the operator wallet pays the gas. Also asserts that a used
authorization can't be replayed and that a signature can't be reused for a
larger amount.

Requires [Foundry](https://getfoundry.sh).

```bash
npm run test:gas
```

The script forks Base Sepolia locally, funds a throwaway operator, hands a
throwaway user 500 USDC by writing the balance slot directly, and runs the real
`relayTransfer()` against it. Nothing touches mainnet or your funded keys.
