# Cobia

[![License: PolyForm Noncommercial 1.0.0](https://img.shields.io/badge/license-PolyForm%20Noncommercial%201.0.0-2563eb.svg)](LICENSE.md)
[![Source available](https://img.shields.io/badge/source-available-f59e0b.svg)](LICENSE.md)
[![Node.js 24+](https://img.shields.io/badge/Node.js-24%2B-339933.svg?logo=node.js&logoColor=white)](package.json)
[![Live on X Layer](https://img.shields.io/badge/live-X%20Layer-111827.svg)](https://getcobia.com)
[![CI](https://github.com/SebastianBoehler/cobia/actions/workflows/ci.yml/badge.svg)](https://github.com/SebastianBoehler/cobia/actions/workflows/ci.yml)

Cobia is a verified intent system centered on X Layer protocols. A wallet signs
an exact policy, Cobia captures public wallet and protocol state at pinned chain
blocks, and independent solvers propose unsigned programs. A separate trusted
verifier checks policy and deployment identities and reproduces each proposal
on a fresh fork before any wallet execution is offered.

Generation is open-world, while production authorization remains independently
verified. The first semantic modules are USDG/USDt0 Aave V3 supply and
registered Curve StableSwap NG or Uniswap V3 exact-input swaps. External solvers
may also submit exact wallet-call programs; Cobia binds their code identities,
approvals, asset deltas, events, and state diffs to a fresh fork replay before
the owner can execute them. V1 allocation rounds remain readable as a control.

![Cobia intent workspace](marketing/remotion/public/ui/cobia-new-ui-desktop.png)

## Current truth

| Capability | Status |
|---|---|
| Wallet connection and X Layer switching | Live |
| Direct Aave V3 reserve/oracle, Curve swap, and Uniswap V3 quote/LP reads | Live V2 capture with pinned current and historical X Layer blocks |
| Versioned policy, snapshot, route, and quote commitments | Implemented |
| In-process coding-agent V2 generation | Implemented with an ephemeral Node 24 Vercel Sandbox, bounded shell loop, explicit egress, and provenance capture |
| Independent capability verification | Implemented for typed registered Aave supply and Curve/Uniswap exact-input modules; unsupported actions fail closed |
| Quote selection and owner signatures | Implemented |
| MPP/EIP-3009 paid reveal | Implemented on X Layer mainnet with fixed USDt0 and one off-chain authorization per recipient |
| PostgreSQL request/payment/purchase history | Implemented |
| X Layer mainnet USDt0 and Aave aToken balances | Live reads |
| Aave + Curve + Uniswap route planning | Implemented for one exact conserved leg: Aave supply, Curve/Uniswap swap-to-Aave, or one-sided full-range Uniswap LP entry |
| Solver competition | Open signed intent intake, solver registration, immutable decision revisions, abstention, capability programs, exact wallet-call programs, and replay protection are implemented; the reference solver runs independently on the VPS |
| Independent fork replay | Vercel verifies proposals and delegates only disposable Anvil execution to an authenticated, concurrency-capped VPS replay service |
| Registered RWA acquisition | Live signed-intent lane for issuer-sourced Ethereum token identities, explicit jurisdiction attestation, exact-call construction, and verified token-balance increase |
| x402 resource purchase | Live for exactly pinned merchant resources on their declared payment network; the order policy binds product, price, payee, payer, deadline, and settlement evidence before wallet authorization |
| Transaction construction/execution engine | Unit/fork-tested and wired as buyer-authenticated, one-step-at-a-time X Layer mainnet wallet execution |
| X Layer mainnet-fork route rehearsal | Product-visible, persisted, and green for direct Aave, Curve/Uniswap-to-Aave, and full-range Uniswap LP-entry routes |
| Verified stepwise X Layer mainnet execution | Product-wired for fresh, purchased, rehearsed V2 routes; every transaction requires an explicit buyer-wallet confirmation and durable receipt verification |
| Capped atomic executor beta | Chain-196 registry, risk manager, and executor are active under the governance Safe; wallet, target, selector, principal, deadline, and final-balance bounds remain enforced on-chain |
| Agent-program wallet execution | Owner-authenticated preparation, live executor preflight, exact wallet calls, and receipt attribution are implemented for both capability and wallet-call programs |
| AI execution/calldata authority | Never granted: verifier-owned capability modules compile calldata and the owner wallet alone signs production transactions |

APY and TVL are snapshot-derived estimates. A block-bounded capture does not
turn an off-chain rate into an on-chain oracle. Buying a route does not move
principal. After a paid V2 route is unlocked, its buyer can first replay the
exact bundle at its committed snapshot block in disposable Anvil state, then
separately authorize verified stepwise chain-196 execution while the route remains fresh.
The browser and server independently rebuild each step; each approval, swap,
supply, or LP mint requires its own wallet confirmation. Persisted hashes, receipts,
events, and postconditions make reload recovery explicit. Fork evidence is
historical and APY remains a forecast—not a profitability guarantee. LP fee
APY is annualized from a historical fee-growth window; impermanent loss, depeg,
future fees, and exit value are not guaranteed. The owner receives the LP NFT,
but Cobia does not yet build collect, rebalance, decrease-liquidity, or exit steps.

## Trust boundary

```mermaid
flowchart LR
    W["Owner wallet"] --> V["Vercel: Next.js UI + Route Handlers"]
    V --> I["Signed intent + pinned snapshot"]
    I --> S["Independent VPS solver"]
    S --> P["Unsigned program"]
    P --> V
    V --> F["VPS replay service + disposable Anvil"]
    F --> T["Verifier attestation"]
    T --> E["Exact owner-wallet execution"]
    V --> D["VPS PostgreSQL over TLS"]
```

The agent may discover arbitrary protocols and write arbitrary research code,
but executable calldata exists only when a verifier-owned capability module
understands its semantics and deployment identities. Rejected programs are
retained as evidence, never exposed as executable. Expired findings are labeled
`Past discovery`; they require a new wallet-specific intent and fresh verification.
First-class Aave, Curve, and Uniswap execution uses X Layer mainnet chain 196.
Registered RWA programs may execute on their issuer chain, and a supported x402
resource uses the payment chain declared by its exact merchant manifest. Every
chain remains explicit in the signed policy and evidence. The app stores
credential hashes and receipt evidence, not raw spend-capable payment credentials.

## Production topology

- **Vercel:** the complete Next.js application, UI, and Route Handlers. There is
  no duplicate Next.js server on the VPS.
- **Hetzner VPS:** PostgreSQL, the independent reference solver, the authenticated
  replay service, disposable loopback-only Anvil forks, and Caddy.
- **`api.getcobia.com`:** the replay-service HTTPS boundary only. The product and
  public API remain at `getcobia.com`.
- **Database:** Vercel connects to VPS PostgreSQL on port `15432` with TLS,
  SCRAM, and `sslmode=verify-full`. The deleted Vercel-managed database is not a
  migration source.

The exact bootstrap, update, and rollback procedure is documented in the
[Hetzner production runbook](docs/deployments/hetzner-production-runbook.md).

## Run locally

Requirements: Node.js 24+, pnpm 11.20.0, and PostgreSQL 16+. The isolated
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
the missing non-secret `PAYMENT_REALM` and a new local
`EXECUTION_SESSION_SECRET`. It never prints generated private keys or secrets.
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

## Continuous verification

- `CI` runs lint, type checks, unit tests, production builds, isolated database
  integration tests, contract tests, and a rendered Compose topology on every
  pull request and `main` update.
- `Mainnet fork` runs the opt-in pinned-block rehearsal nightly and on demand.
- `Security` audits production dependencies and runs CodeQL on every change;
  weekly container scans fail on fixed high or critical vulnerabilities.

Security reports belong in the private process described in
[`SECURITY.md`](SECURITY.md), never in a public issue.

The wallet-confirmed X Layer Testnet deployment and independent receipt checks
are documented in
[`docs/deployments/xlayer-testnet-executor-v2-runbook.md`](docs/deployments/xlayer-testnet-executor-v2-runbook.md).

## Workspace

- `apps/web` — Next.js product, API routes, MCP endpoint, persistence, and chain reads
- `apps/replay-service` — authenticated standalone replay API and disposable Anvil lifecycle
- `examples/open-solver` — independently deployable reference solver
- `packages/domain` — canonical schemas, commitments, allocation math, scoring, and verification
- `packages/solvers` — deterministic builder and bounded agentic candidate selector
- `deploy/hetzner` — production and local Docker Compose topology
- `docs/architecture` — current/target architecture and intent-compatibility boundaries
- `docs/design/cobia-brand-system.md` — canonical brand, visual, and product-language system
- `docs/design/cobia-x-community-playbook.md` — X publishing and community voice playbook

See [apps/web/README.md](apps/web/README.md) for the exact network and payment
configuration boundary.

## License

Cobia is source-available under the
[PolyForm Noncommercial License 1.0.0](LICENSE.md). You may use, modify, and
share it only for permitted noncommercial purposes. Commercial use—including
using Cobia or a modified version to provide a paid product or service—requires
a separate commercial license from Sebastian Böhler.

This is not an OSI-approved open-source license. Sebastian Böhler retains the
right to use, license, and commercialize Cobia separately. The license does not
grant rights to the Cobia name, logos, or branding. For commercial licensing,
[contact Sebastian Böhler](https://github.com/SebastianBoehler).
