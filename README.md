# Hamyon

A USDC wallet on Base that behaves like a bank account: sign up with an email,
get a wallet instantly, send money without ever touching gas, and reach it from
any device.

- **API** — `wa.glasscube.uz`, port `9550` locally
- **Web** — `wallet.glasscube.uz`, port `9551` locally
- **Network** — Base Sepolia testnet (chain `84532`), USDC at `0x036CbD…F7e`

---

## How the wallet works

This is the part worth understanding before changing anything.

Each user gets a **plain EOA** the moment they register, held by Coinbase CDP.
Transfers are gasless because of **EIP-3009**, not because of a paymaster.

**We run the gas station.** The user's key signs an EIP-712
`TransferWithAuthorization` message off chain — that costs nothing and needs no
ETH. Our operator wallet (`OPERATOR_PRIVATE_KEY`) then submits that
authorization to the USDC contract and pays the gas. No ERC-4337, no bundler,
no third-party paymaster, no smart-account deployment. Just our wallet paying
for our users.

The operator can't steal anything: it holds no user USDC and has no allowance
over anyone's balance. It can only broadcast a transfer the user's own key
already signed, for the exact amount and recipient in that signature, once —
the contract rejects a reused nonce.

**The user never sees Coinbase.** CDP is a server-side signing API here. There
is no CDP widget, no CDP login, no browser SDK, and nothing in localStorage.
Sign in from a different machine, browser, or country and the same wallet is
there, because it's bound to the account rather than to a device.

**Email codes authorise transfers.** Every send emails a 6-digit code bound to
that exact transfer — amount and recipient. A code phished for one payment
can't move a different one. Set `REQUIRE_OTP_FOR_SEND=false` to skip it during
a demo.

The trade-off, stated plainly: this is **custodial**. The server can sign,
which is what makes device-independent access possible. Right call for a
testnet demo; revisit before mainnet with real money.

### The send path

```
user taps Send
  -> POST /api/wallet/send        validates, checks balance + gas tank
  -> emails a 6-digit code        bound to this transfer id
  -> user enters it in the modal
  -> POST /api/wallet/send/confirm
  -> CDP signs EIP-3009 authorization      (no gas, no ETH)
  -> operator broadcasts transferWithAuthorization  (operator pays gas)
  -> recipient has the full amount, nothing skimmed
```

### The auth story

Access and refresh tokens are both **httpOnly cookies**. Nothing touches
localStorage — the browser holds the session, the API validates it, and the
frontend never sees a token. Refresh tokens rotate on every use, and a refresh
token presented twice revokes every session for that user.

---

## Running locally

You'll need [Bun](https://bun.sh) and MongoDB. Bun runs the TypeScript
directly — there is no build step on the server.

```bash
bun run install:all

cp server/.env.example server/.env    # then fill in the keys below
cp web/.env.example web/.env

bun run dev        # API on :9550, web on :9551
```

Everything runs on Bun — package manager, script runner, server runtime, and
Vite. Two Bun-specific notes worth knowing before you touch the scripts:

- `src/bun-compat.ts` is preloaded via `bunfig.toml`. `bson` (via mongoose)
  calls a `node:v8` API Bun hasn't implemented, which otherwise kills the
  import at startup. The shim returns the answer Node would.
- The web scripts point at `node_modules/vite/bin/vite.js` rather than `vite`,
  because the `.bin` shim's `#!/usr/bin/env node` shebang would re-exec the dev
  server under Node.

Useful along the way:

```bash
bun run operator     # where to send gas money, and how much is left
bun run typecheck    # both projects
bun run lint         # eslint, type-aware
bun run test:gas     # gas station end-to-end (needs Foundry)
```

### Cookies and NODE_ENV

Cookie `Secure`/`SameSite` follows **the scheme in `WEB_ORIGIN`**, not
`NODE_ENV`. This matters: a `Secure` cookie is silently discarded over plain
http, so keying it off `NODE_ENV` meant running `NODE_ENV=production` locally
handed the browser cookies it threw away — you'd register successfully and land
straight back on the sign-in screen with no error anywhere. Set
`COOKIE_SECURE` only if TLS terminates somewhere that makes the inference wrong.

Loopback origins (`localhost`, `127.0.0.1`, `[::1]`, any port) are accepted
outside production, because Vite serves the same app on several of them and
treating them as distinct origins turns a normal local run into an unexplained
CORS failure. A refused origin is logged with the fix:

```
[cors] refused origin http://127.0.0.1:5173 — add it to WEB_ORIGIN (currently: http://localhost:9551)
```

### Rate limiting

nginx owns it, and nothing else does. `api/deploy/wa.glasscube.uz.conf` holds
the zones. The app has no limiter of its own — two independent limits on the
same traffic just means two places to look when a legitimate request 429s. The
trade-off: the API is unthrottled if you expose port 9550 without the proxy.

### Logs

HTTP access logs go to stdout via morgan, same readable format in every
environment:

```
::1 POST /api/auth/verify-email/request 400 311 - 2193.036 ms "curl/8.7.1"
```

Successful `/health` polls are skipped so monitoring doesn't bury real traffic;
a failing one still logs. In production: `journalctl -u hamyon-api -f`.

Email failures log the provider's own words rather than being flattened into a
generic 500 — that flattening is what made a broken verify-email button
impossible to diagnose from the outside:

```
[email] send failed to=x@example.com subject="… verification code" status=422
        name=validation_error: Invalid `to` field. …
```

The API starts and reports which integrations are live:

```
[hamyon] development — base-sepolia (chain 84532)
  ✓ CDP wallets (signing only, never user-facing)
  ✓ Gas station (our operator wallet)
  ○ Resend email  (not configured)
  ...
[hamyon] gas station 0x03F9…5000 — 0.42 ETH (~4900 transfers)
```

Anything not configured degrades honestly rather than crashing: without CDP the
app still registers users and provisions their wallet on the next request;
without Resend, codes are printed to the server log so you can keep testing;
without a funded operator, sends are refused with a plain message instead of
failing halfway.

## Keys you need

| Variable | Where to get it |
|---|---|
| `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, `CDP_WALLET_SECRET` | See [CDP credentials](#cdp-credentials-which-ones) below — there are four kinds and only these three are the right ones |
| `OPERATOR_PRIVATE_KEY` | Generate one (`bun run operator` tells you how), then fund it. This is your gas station |
| `RESEND_API_KEY`, `EMAIL_FROM` | [resend.com/api-keys](https://resend.com/api-keys). `EMAIL_FROM` must be a verified domain |
| `BASESCAN_API_KEY` | [basescan.org/myapikey](https://basescan.org/myapikey) |
| `MOONPAY_PUBLISHABLE_KEY`, `MOONPAY_SECRET_KEY` | [dashboard.moonpay.com](https://dashboard.moonpay.com) — **sandbox** keys |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | `openssl rand -hex 32`, twice |

Getting testnet USDC to try a send: [faucet.circle.com](https://faucet.circle.com)
(pick Base Sepolia) and paste the address from the dashboard.

### CDP credentials: which ones?

The CDP portal issues four different things and they are not interchangeable.
This project is **server-side only**, so it needs the bottom two:

| Credential | What it's for | Used here? |
|---|---|---|
| **Project ID** | Identifies the project | No |
| **Client API Key** | Frontend SDKs (Embedded Wallets, Onramp). Domain-whitelisted | **No** — we never call CDP from the browser |
| **Secret API Key** (id + secret) | Authenticates backend REST calls | Yes |
| **Wallet Secret** | Signs *write* operations — creating an account, signing a transfer | Yes |

The Wallet Secret is the one people miss, because it's generated separately
from the API key and shown only once. It's a base64 P-256 PKCS8 private key,
~120+ characters — much longer than the API key secret.

It exists because CDP splits authentication in two: the API key proves *which
project* is calling, and the Wallet Secret proves the caller is allowed to move
funds. You can see this in the SDK — write calls to `/v2/evm/accounts` carry an
extra `X-Wallet-Auth` JWT signed with it. That's why **reads succeed while
writes fail** if it's wrong: listing accounts needs only the API key, but
creating a wallet or signing a transfer needs both.

To avoid a confusing failure later, the server checks the key's shape on
startup and says so plainly:

```
[hamyon] CDP credentials incomplete — CDP_WALLET_SECRET is 32 chars
         (decodes to 24 bytes) and is not a P-256 PKCS8 key.
```

If you only have a Client API Key and a whitelisted domain, that's the
**Embedded Wallets** product — a different integration that keeps a session in
browser storage and asks the user to authenticate with Coinbase. This project
deliberately doesn't use it.

### Where's the operator address?

It isn't configured anywhere — it's derived from `OPERATOR_PRIVATE_KEY` at
runtime, so the two can never disagree. To see it:

```bash
bun run operator
```

It's also printed on startup and returned by `GET /health`.

## API

All routes are cookie-authenticated. `POST` unless noted.

**Auth** — `/api/auth`

| Route | Purpose |
|---|---|
| `/register` | Create account, provision wallet, start session |
| `/login` | Email **or** username, plus password |
| `/refresh` | Rotate the session |
| `/logout`, `/logout-all` | End this session / every session |
| `GET /me` | Current user and wallet |
| `/verify-email/request`, `/verify-email/confirm` | Email verification |
| `/forgot-password`, `/reset-password` | Reset by emailed code |
| `/change-password` | Requires the current password |
| `/delete-account/request`, `/delete-account/confirm` | Hard delete |

**Wallet** — `/api/wallet`

| Route | Purpose |
|---|---|
| `GET /` | Address, balance, explorer link |
| `GET /balance` | Balance only |
| `GET /transactions` | Basescan history, merged with in-flight sends |
| `/send` | Start a transfer — emails the code |
| `/send/confirm` | Submit the code, broadcast |
| `GET /transfers/:id` | Poll a transfer to completion |
| `GET /onramp`, `GET /offramp` | Signed MoonPay widget URLs |
| `GET /capabilities` | Which integrations are configured |

### Account deletion is a hard delete

`delete-account/confirm` removes the user, wallet, sessions, codes, and transfer
rows outright — no soft-delete flag, and the email becomes reusable immediately.
It runs in a transaction on a replica set, falling back to sequential deletes on
a standalone `mongod`.

One honest caveat: the CDP account itself can't be destroyed through their API,
so the on-chain address continues to exist. Everything connecting it to a person
is gone from our side.

## Deploying

```bash
bun run build          # -> web/dist
```

- `deploy/nginx/wa.glasscube.uz.conf` — API proxy plus the rate-limit zones
- `deploy/nginx/wallet.glasscube.uz.conf` — static SPA with correct cache headers
- `deploy/hamyon-api.service` — systemd unit

In production set `COOKIE_DOMAIN=.glasscube.uz` so the cookie issued by the API
is sent to the app on the sibling subdomain, and `WEB_ORIGIN=https://wallet.glasscube.uz`
so CORS reflects it. Both are required — the session silently won't stick if
either is missing.

## Layout

```
server/src/            TypeScript, run directly by Node's type stripping
  config/      env validation, mongo
  models/      User, Wallet, Session, Otp, Transfer
  services/    cdp (signing), gasStation (relayer), email,
               basescan, moonpay, otp, wallet
  controllers/ auth, wallet
  routes/      auth, wallet
  middleware/  auth, validate, error, rateLimit
server/test/   gas station end-to-end against a fork
web/src/               TypeScript + React
  pages/       Login, Register, ForgotPassword, ResetPassword,
               Dashboard, Activity, Settings
  components/  AppLayout, AuthShell, SendDialog, TransactionRow,
               CopyAddress, Brand, ui/
  context/     AuthContext
  lib/         api client, formatting
  types/       API response contracts
```

## Keeping the gas station full

`GET /health` returns 503 when the operator wallet drops below
`OPERATOR_MIN_BALANCE_ETH`, so monitoring catches an empty tank before users
do. The startup banner prints the balance and a rough transfer count. A
transfer costs roughly 0.00009 ETH on Base Sepolia, so 0.1 ETH covers on the
order of a thousand sends.

If the operator runs dry, `/api/wallet/send` refuses with a plain message
rather than taking an OTP from the user and then failing.

## Tests

```bash
bun run test:gas   # needs Foundry
```

Forks Base Sepolia, gives a throwaway user USDC and **no ETH**, and runs the
real relayer end to end — asserting the recipient gets the full amount, the
operator pays the gas, a used authorization can't be replayed, and a signature
can't be reused for a larger amount.

## Notes on the demo

Balances are testnet and worth nothing. MoonPay sandbox supports a limited set
of currencies and will not deliver real USDC to a Base Sepolia address — the
buy and cash-out buttons open a correctly signed, correctly parameterised
widget, which is the integration point; completing a sandbox purchase end to end
needs MoonPay to enable testnet assets on your account.
