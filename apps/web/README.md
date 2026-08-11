# Cobia web

Cobia creates one deterministic, route-authorized quote for X Layer. A wallet
signs an exact USDG or USDt0 policy; direct Aave V3 and Uniswap V3 reads are
captured at one pinned block; and the signed plan is independently recomputed
before it can be selected or revealed through OKX MPP. APY remains an estimated
pre-gas rate. Principal remains unmoved by the product.

## Local run

Requirements: Node.js 22.22+, pnpm 11.20.0, and PostgreSQL 16+.

```bash
pnpm install
pnpm env:dev
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE \
  pnpm --filter @cobia/web db:migrate
pnpm --filter @cobia/web dev
```

`pnpm env:dev` creates an ignored, owner-readable `apps/web/.env.local` with
a fresh deterministic signing wallet, a separate recoverable dev treasury, an
MPP secret, and a canonical local payment realm. It never overwrites an
existing value or prints private keys. When migrating an older file, it may
append the missing non-secret `PAYMENT_REALM`. Fill in the blank OKX
credentials before exercising live discovery.

Open <http://localhost:3000>. The MCP endpoint is
<http://localhost:3000/mcp>.

Every variable in `.env.example` is required for the corresponding live path.
The app returns an explicit error when PostgreSQL, OKX, deterministic signing,
or payment configuration is unavailable; it does not substitute sample data.

## Network boundary

- V2 capture verifies chain `196`, block number/hash/timestamp, registered
  runtime and proxy implementation code, Aave reserve/oracle state, and the
  registered Uniswap pool/quote at the same block. V1 stored rounds retain their
  explicitly labeled OKX-derived estimates.
- One configured deterministic solver proposes a direct Aave supply,
  Uniswap-to-Aave route, or retain-all plan. Cobia recomputes exact conservation,
  exposure, opportunity amounts, pre-gas economics, registry coverage, expiry,
  and signer before publishing a sanitized quote.
- Reveal payment supports only X Layer testnet chain `1952` and its fixed
  six-decimal USDt0 token at `0x9e29b3aada05bf2d2c827af80bd28dc0b9b4fb0c`.
- The product does not move the user's stablecoin principal. A guarded
  transaction-construction/execution library exists behind a local verifier
  capability, but it is not wired to UI or persistence. `eth_estimateGas` is gas
  preflight, not product simulation. No testnet Aave or Uniswap deployment is
  claimed.
- An opt-in Docker/Anvil test at pinned X Layer mainnet block `67,649,362` has
  passed capture, authorization, exact USDG approval, Uniswap USDG-to-USDt0,
  exact USDt0 approval, and Aave supply with receipt, event, and state checks.
  This isolated fork rehearsal is not product simulation, persisted/product
  execution, live mainnet principal execution, or deployment proof.
  A full testnet payment check requires a funded Agentic Wallet, OKX MPP
  credentials, treasury/signer addresses, and a deployed payment asset.

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
