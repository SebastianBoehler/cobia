# Cobia

Cobia is a verified DeFi quote and paid-route market for X Layer. A wallet signs
an exact stablecoin intent, Cobia captures Aave V3 and Uniswap V3 opportunity
data at one pinned block, deterministic and bounded agentic solvers propose
routes, and an independent verifier recomputes authorization before publication. The
private signed plan is released only to the request owner after an OKX MPP
payment.

The current product is deliberately narrow: USDG/USDt0, Aave V3 supply, the
registered Uniswap V3 0.01% pool, and two Cobia-operated solvers. The agentic
solver may choose only among server-built candidates; it cannot invent assets,
amounts, contracts, or calldata. V1 OKX-derived Aave allocation rounds remain
readable for compatibility. Cobia is not yet a broad aggregator or an open
external-solver market.

## Current truth

| Capability | Status |
|---|---|
| Wallet connection and X Layer switching | Live |
| Direct Aave V3 reserve/oracle and Uniswap V3 quote reads | Live V2 capture at one pinned X Layer block |
| Versioned policy, snapshot, route, and quote commitments | Implemented |
| Deterministic V2 route authorization | Implemented and recomputed before persistence/payment |
| Bounded OpenAI route selector | Live; selects only server-enumerated candidates and signs with an independent solver key |
| Quote selection and owner signatures | Implemented |
| MPP/EIP-3009 paid reveal | Implemented for the fixed X Layer testnet payment lane |
| PostgreSQL request/payment/purchase history | Implemented |
| X Layer mainnet USDt0 and Aave aToken balances | Live reads |
| Aave V3 + Uniswap V3 route planning | Implemented for one exact exposure and at most one deployed leg |
| Solver competition | Two Cobia-operated solvers run independently; external solver admission is not implemented |
| Transaction construction/execution engine | Unit-tested and used by the buyer-authenticated purchased-route fork rehearsal |
| X Layer mainnet-fork route rehearsal | Product-visible, persisted, and green for direct Aave and Uniswap-to-Aave purchased V2 routes |
| AI execution/calldata authority | Not granted; deterministic construction and verification remain authoritative |

APY and TVL are snapshot-derived estimates. A block-bounded capture does not
turn an off-chain rate into an on-chain oracle. Product principal remains
unmoved on public chains. After a paid V2 route is unlocked, its buyer can sign
an action-scoped proof and replay that exact bundle at its committed snapshot
block in disposable Anvil state. The persisted trace shows exact approvals, an
optional Uniswap swap, Aave supply, receipts, events, and postconditions. This
is historical fork evidence—not a current-price guarantee, live mainnet
principal execution, or deployment proof.

## Trust boundary

```mermaid
flowchart LR
    W["Owner wallet"] --> I["Signed stablecoin intent"]
    I --> S["Pinned Aave + Uniswap snapshot"]
    S --> D["Deterministic solver"]
    S --> A["Bounded agentic selector"]
    D --> V["Pure verifier"]
    A --> V
    V --> Q["Sanitized public quote"]
    Q --> P["Owner-bound MPP payment"]
    P --> R["Committed private bundle"]
    R --> F["Buyer-authenticated fork rehearsal"]
```

Solvers reference only registered opportunity IDs; adapter code resolves
targets and calldata. Well-formed bundles that reach a verifier verdict are
saved even when authorization is rejected, but are not marketed as active
quotes. Solver errors, timeouts, malformed bundles, identity mismatches, and
non-actionable returns remain round failures and are not persisted as quotes.
Payment chain and execution chain are recorded separately. The app stores
credential hashes and receipt evidence, not raw spend-capable payment
credentials.

## Run locally

Requirements: Node.js 22.22+, pnpm 11.20.0, and PostgreSQL 16+. The isolated
database-integration and fork-rehearsal lanes also require a running
Docker-compatible container runtime.

```bash
pnpm install
pnpm env:dev
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE \
  pnpm --filter @cobia/web db:migrate
pnpm dev
```

`pnpm env:dev` creates an ignored, owner-readable local environment file. It
never overwrites secrets or existing values; for an older file, it may append
the missing non-secret `PAYMENT_REALM`. It never prints generated private keys.
Live OKX paths require the corresponding credentials; missing configuration
fails visibly and never substitutes sample data.

## Verify

```bash
pnpm test
pnpm --filter @cobia/web test:integration
pnpm --filter @cobia/web test:fork
pnpm typecheck
pnpm lint
pnpm build
```

The default tests exclude the integration and fork lanes and never connect to
PostgreSQL. Each integration suite (or standalone migration test) owns and
closes its own disposable `postgres:16-alpine` container; the sequential
command does not share one database for the whole run. It ignores ambient
`DATABASE_URL` and `TEST_DATABASE_URL` values.

The opt-in fork command starts a digest-pinned Foundry/Anvil container and forks
the public X Layer RPC at block `67,649,362`. It requires outbound network access
to `ghcr.io` for the image and `https://rpc.xlayer.tech` for fork state.

## Workspace

- `apps/web` — Next.js product, API routes, MCP endpoint, persistence, and chain reads
- `packages/domain` — canonical schemas, commitments, allocation math, scoring, and verification
- `packages/solvers` — deterministic builder and bounded agentic candidate selector
- `docs/architecture` — current/target architecture and intent-compatibility boundaries

See [apps/web/README.md](apps/web/README.md) for the exact network and payment
configuration boundary.
