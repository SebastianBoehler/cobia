# Cobia web

Cobia's web application turns an owner-signed X Layer intent into an open solver
competition, deterministic verification, disposable fork replay, and explicit
owner-wallet execution. Registered Aave V3, Curve StableSwap NG, Uniswap V3,
x402, standard-token V4, and TSLAx paths each retain their own semantic and
identity boundary. A solver proposal is never execution authority. APY and other
future-value fields remain forecasts.

Start with the root [product and evidence overview](../../README.md), the
[AI Season submission brief](../../docs/SUBMISSION.md), and the
[security model](../../docs/architecture/security-model.md).

## Local run

Requirements: Node.js 24+, pnpm 11.20.0, and PostgreSQL 16+.

```bash
pnpm install
pnpm env:dev
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE \
  pnpm --filter @cobia/web db:migrate
pnpm --filter @cobia/web dev
```

`pnpm env:dev` creates an ignored, owner-readable `apps/web/.env.local` with
fresh deterministic and agentic signing wallets, a separate recoverable dev
treasury, an MPP secret, and a canonical local payment realm. It never overwrites an
existing value or prints private keys. When migrating an older file, it may
append the missing non-secret `PAYMENT_REALM`, a local `EXECUTION_SESSION_SECRET`,
and a separate local `WALLET_AUTH_SECRET`. Fill in the blank OKX credentials before exercising
live discovery.

Open <http://localhost:3000>. The MCP endpoint is
<http://localhost:3000/mcp>.

Every variable in `.env.example` is required for the corresponding live path.
The V2 solver market requires the OpenAI key/model and a separate agentic
signer. The app returns an explicit error when PostgreSQL, protocol, solver, or
payment configuration is unavailable; it does not substitute sample data.

## Production boundary

The complete Next.js application, including all Route Handlers, is deployed on
Vercel. Production does not run a second Next.js process on the VPS.

The Hetzner stack contains only PostgreSQL, the independent reference solver,
the authenticated replay service, disposable Anvil forks, and Caddy. The web
runtime connects to PostgreSQL with TLS and delegates accepted replay inputs to
`REPLAY_SERVICE_ORIGIN`; `api.getcobia.com` does not expose Next.js routes. The
in-process V2 coding-agent path still uses Vercel Sandbox, while the open solver
path runs as an independent container and submits proposals through the public
Vercel API.

See the [production runbook](../../docs/deployments/hetzner-production-runbook.md)
for the exact service and secret boundary.

## Network boundary

- V2 capture verifies chain `196`, block number/hash/timestamp, registered
  runtime and proxy implementation code, Aave reserve/oracle state, and the
  registered Curve and Uniswap pools/quotes at the same block. LP candidates additionally
  pin a historical pool block and commit full-range fee-growth observations,
  pool balances, token amounts, and minimum liquidity. V1 stored rounds retain their
  explicitly labeled OKX-derived estimates.
- The deterministic solver ranks exact candidates; the agentic solver may
  choose only among those server-built candidates. Cobia recomputes exact conservation,
  exposure, opportunity amounts, pre-gas economics, registry coverage, expiry,
  and signer before publishing a sanitized quote.
- Reveal payment and route execution both use X Layer mainnet chain `196`.
  Payment is fixed to six-decimal USDt0 at
  `0x779ded0c9e1022225f8e0630b35a9b54be713736`; the client verifies its
  EIP-712 domain separator before requesting EIP-3009 signatures.
- Purchased V2 routes first expose a buyer-authenticated action that replays the
  exact committed bundle in disposable X Layer mainnet-fork state and persists
  the attributed trace. A passing, still-fresh route can then enter verified stepwise X
  Layer mainnet execution. The browser independently verifies each server-built
  transaction and OKX Wallet asks the buyer to confirm one approval, swap,
  supply, or LP mint at a time. The server never signs or relays principal transactions.
  `eth_estimateGas` remains gas preflight, not a profitability guarantee. The
  separately governed V3 and V4 executors enforce their registered policy and
  risk boundaries; the owner wallet still authorizes every production action.
- General Asset V4 is public for independently verified same-chain X Layer
  standard-token routes through the configured OKX lane. Registered TSLAx has a
  confirmed public acquisition receipt. LI.FI, bridging, Ethereum runtime,
  unusual-token behavior, and universal xStocks liquidity are not public claims.
- Both the product rehearsal and the opt-in acceptance lane have passed direct
  Aave, Curve/Uniswap-to-Aave, and one-sided full-range Uniswap LP-entry routes with
  exact approvals, receipts, protocol events, NFT ownership, and state checks.
  Fork evidence is historical and uses
  simulated funds; the verified stepwise wallet lane separately rechecks freshness,
  deployments, balances, gas, transaction attribution, and postconditions at
  mainnet execution time.
  Historical LP fees are forecasts, not an enforceable yield floor. The current
  LP adapter mints an owner-held position; collect, rebalance, remove-liquidity,
  and exit actions remain unimplemented.
  A funded mainnet payment canary still requires a selected test wallet with
  USDt0, OKX MPP credentials, and explicit approval before spending funds.

## Verification

```bash
pnpm test
pnpm --filter @cobia/web test:integration
pnpm --filter @cobia/web test:fork
pnpm typecheck
pnpm lint
pnpm build
```

`pnpm test` excludes `*.integration.test.ts` and `*.fork.test.ts` and does not
require Docker. The explicit integration command requires a running
Docker-compatible container runtime. Each integration suite (or standalone
migration test) owns and closes its own disposable `postgres:16-alpine`
container; the sequential command does not share one database for the whole
run. It does not use `DATABASE_URL` or `TEST_DATABASE_URL`.

The opt-in fork command also requires the container runtime plus outbound
network access to `ghcr.io` for its digest-pinned Foundry/Anvil image and
`https://rpc.xlayer.tech` for the pinned mainnet state.
