# Cobia web

Cobia runs deterministic and bounded agentic solvers for X Layer. A wallet
signs an exact USDG or USDt0 policy; direct Aave V3, Curve StableSwap NG, and Uniswap V3 reads are
captured at one pinned block; and the signed plan is independently recomputed
before it can be selected or revealed through OKX MPP. APY remains an estimated
pre-gas rate. Buying a route does not move principal; a fresh rehearsed V2 route
can be executed later through separate, explicit X Layer mainnet wallet prompts.

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
append the missing non-secret `PAYMENT_REALM` and a new local
`EXECUTION_SESSION_SECRET`. Fill in the blank OKX credentials before exercising
live discovery.

Open <http://localhost:3000>. The MCP endpoint is
<http://localhost:3000/mcp>.

Every variable in `.env.example` is required for the corresponding live path.
The V2 solver market requires the OpenAI key/model and a separate agentic
signer. The app returns an explicit error when PostgreSQL, protocol, solver, or
payment configuration is unavailable; it does not substitute sample data.

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
  `eth_estimateGas` remains gas preflight, not a profitability guarantee. No
  A separate capped atomic-executor contract is still an undeployed, paused-by-default beta
  foundation and is not presented as a live product action.
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
