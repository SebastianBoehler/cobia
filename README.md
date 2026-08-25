# Cobia

**AI searches for the route. Cobia proves every step stays within your limits.**

[![Live on X Layer](https://img.shields.io/badge/live-X%20Layer%20mainnet-111827.svg)](https://getcobia.com)
[![CI](https://github.com/SebastianBoehler/cobia/actions/workflows/ci.yml/badge.svg)](https://github.com/SebastianBoehler/cobia/actions/workflows/ci.yml)
[![Security](https://github.com/SebastianBoehler/cobia/actions/workflows/security.yml/badge.svg)](https://github.com/SebastianBoehler/cobia/actions/workflows/security.yml)
[![Mainnet fork](https://github.com/SebastianBoehler/cobia/actions/workflows/fork.yml/badge.svg)](https://github.com/SebastianBoehler/cobia/actions/workflows/fork.yml)
[![Node.js 24+](https://img.shields.io/badge/Node.js-24%2B-339933.svg?logo=node.js&logoColor=white)](package.json)
[![License: PolyForm Noncommercial](https://img.shields.io/badge/license-PolyForm%20Noncommercial-2563eb.svg)](LICENSE.md)

[Try Cobia](https://getcobia.com) ·
[AI Season evidence](https://getcobia.com/buildx) ·
[Confirmed outcomes](https://getcobia.com/network) ·
[Developer docs](https://getcobia.com/docs) ·
[Competition brief](docs/SUBMISSION.md)

![Current Cobia V4 intent workspace with a registered TSLAx acquisition example](apps/web/public/media/cobia-v4-xstocks-intent-2026-08-25.jpg)

Cobia is a non-custodial intent and transaction-program verifier for X Layer.
A user describes an outcome and signs exact limits. Independent solvers can then
research and propose programs, but they never receive the user's key or
execution authority. Cobia verifies identities, policy bounds, calldata, state
changes, and a fresh fork replay before the owner wallet is offered the exact
transactions.

The core design choice is an authority split: **AI can propose; only the
verifier can attest; only the owner wallet can execute.**

## Review Cobia in three minutes

1. Open the [live product](https://getcobia.com/intents/new) and select the
   registered TSLAx example.
2. Inspect the [AI Season evidence page](https://getcobia.com/buildx), including
   deployments, protocol support, solver activity, and limitations.
3. Verify the public [TSLAx program](https://getcobia.com/programs/3ceb168b-3a54-4560-ad9a-c1614401d6db)
   and its [X Layer transaction](https://web3.okx.com/explorer/x-layer/evm/tx/0xd8381e286f7dadde6a5ab363223b264b51f5aac4cc04cc3a41bfa979f67fcc4f).
4. Verify the separate [V4 standard-token program](https://getcobia.com/programs/4d1ccd00-1b2d-485a-9f57-6e4416959126)
   and its [X Layer transaction](https://web3.okx.com/explorer/x-layer/evm/tx/0x573cf9e9e0c21e4cf1585cc4a4ec36a56d4063c779bb3de4e8bf514c56e2543f).
5. Read the [security model](docs/architecture/security-model.md), then reproduce
   the automated checks below.

## Mainnet evidence

Public evidence is the product claim boundary. Screenshots and demos explain the
flow; programs, receipts, and chain transactions establish what actually ran.

| Evidence | What it establishes |
| --- | --- |
| [TSLAx acquisition program](https://getcobia.com/programs/3ceb168b-3a54-4560-ad9a-c1614401d6db) | Registered TSLAx acquisition through V4, with exact identity and eligibility checks, independent evidence, receipt, and owner-wallet execution |
| [TSLAx transaction](https://web3.okx.com/explorer/x-layer/evm/tx/0xd8381e286f7dadde6a5ab363223b264b51f5aac4cc04cc3a41bfa979f67fcc4f) | `0.002841620235604251 TSLAx` reached the owner wallet on X Layer mainnet |
| [Full-balance TSLAx sale](https://getcobia.com/programs/88b29eb4-0e30-4108-be11-30f157fa1e70) | A separate verified program sold `0.016001666911378385 TSLAx` into `5.618001 USDG` |
| [TSLAx sale transaction](https://web3.okx.com/explorer/xlayer/tx/0x7fc3f00d7951fdea18cd890690cd322869d113043bf2ec9fa1d362a06348e7ad) | Confirms the reverse xStocks-to-stablecoin direction and terminal balance changes |
| [V4 standard-token program](https://getcobia.com/programs/4d1ccd00-1b2d-485a-9f57-6e4416959126) | A second wallet used the public V4 path for a bounded OKB-to-USDG swap |
| [V4 transaction](https://web3.okx.com/explorer/x-layer/evm/tx/0x573cf9e9e0c21e4cf1585cc4a4ec36a56d4063c779bb3de4e8bf514c56e2543f) | `0.01 OKB` became `1.169308 USDG` on X Layer mainnet |
| [Cobia Network](https://getcobia.com/network) | Verifier-derived results across solver programs, each linked to its public evidence |
| [Production deployment evidence](https://getcobia.com/buildx#evidence) | X Layer contracts, builder attribution, source, testnet rehearsal, and current product links |

Snapshot note: the Network API reported **35 confirmed outcomes and four
winning solvers on 25 August 2026**. Use the live Network page for the
current count.

## How it works

```mermaid
flowchart LR
    W["Owner wallet"] -->|signs limits| I["Intent + pinned evidence"]
    I --> S["Independent solvers"]
    S -->|unsigned programs| V["Deterministic verifier"]
    V --> R["Disposable X Layer fork replay"]
    R -->|accepted attestation| W
    W -->|explicit confirmations| X["X Layer mainnet"]
    X --> P["Public receipt + postconditions"]
```

1. **Bound the outcome.** The policy commits owner, chain, assets, spend and
   result limits, allowed capabilities, deadline, freshness, and nonce.
2. **Let solvers compete.** Deterministic services, isolated coding agents, and
   independent solver processes can research routes or abstain.
3. **Verify independently.** Cobia re-resolves registered deployments and asset
   identities, checks every call and approval, and replays accepted programs on
   disposable X Layer fork state.
4. **Keep the authority.** A passing replay is evidence, not execution. The
   browser rebuilds the attested transactions and the owner wallet decides
   whether to submit them.
5. **Prove the result.** Canonical receipts, events, balance changes, program
   commitments, and transaction links remain inspectable after execution.

## Current product boundary

| Surface | Current state |
| --- | --- |
| Plain-language, wallet-signed intents | Live on X Layer chain `196` |
| Solver exchange | Signed intake, solver profiles, immutable revisions, abstention, ranking, and replay protection |
| General Asset V4 | Live for independently verified standard ERC-20 swaps through the public same-chain X Layer OKX lane |
| Registered xStocks | Live mainnet proof for TSLAx acquisition; every asset still requires exact registration, routing, and eligibility evidence |
| Semantic DeFi capabilities | Registered Aave V3 supply and Curve/Uniswap exact-input routes, including bounded composition and fork rehearsal |
| Commerce | Exactly pinned x402 resources with product, network, price, payee, payer, deadline, and settlement evidence |
| Execution | Owner-authenticated, one stage at a time, with current preflight and durable receipt verification |
| AI authority | Proposal generation only; model-authored output never becomes calldata authority or gains a production send path |

Explicit non-capabilities matter. Cobia does not present LI.FI, bridging,
Ethereum runtime, recurring authority, arbitrary token behavior, universal
xStocks liquidity, or LP exit/rebalancing as live. APY, fees, and future value
are forecasts rather than enforceable outcomes. See the full
[intent compatibility boundary](docs/architecture/intent-compatibility.md).

## AI and verification implementation

- The in-process coding-agent lane runs route-search code inside an ephemeral
  Node 24 sandbox with bounded tools, egress, runtime, and provenance capture.
- The [open solver](examples/open-solver) runs independently, consumes public
  signed intents, and submits typed capability or exact wallet-call programs.
- Verifier-owned modules recompile known capabilities. Open wallet-call programs
  must additionally prove target code, selectors, approvals, asset and event
  coverage, state deltas, and a fresh replay.
- The [replay service](apps/replay-service) accepts only authenticated,
  deterministically pre-checked material, caps concurrency, starts a loopback-only
  Anvil fork, records evidence, and destroys the fork.
- The V4 executor, registry, risk manager, and validation contracts enforce
  owner, target, selector, principal, deadline, and final-balance bounds onchain.

The detailed guarantees, threats, and failure behavior are in the
[security model](docs/architecture/security-model.md).

## Repository map

| Path | Responsibility |
| --- | --- |
| [`apps/web`](apps/web) | Next.js product, public APIs, intent orchestration, verification, persistence, and wallet execution |
| [`apps/replay-service`](apps/replay-service) | Authenticated replay API and disposable Anvil lifecycle |
| [`examples/open-solver`](examples/open-solver) | Independently deployable reference solver |
| [`packages/domain`](packages/domain) | Canonical policies, programs, commitments, scoring, evidence, and verdicts |
| [`packages/solvers`](packages/solvers) | Deterministic, coding-agent, capability, and general-asset solver machinery |
| [`contracts`](contracts) | Foundry-tested executor, registry, risk manager, static guard, and V4 validation contracts |
| [`docs`](docs) | Architecture, deployment evidence, runbooks, research, and competition documentation |

Production uses Vercel for the web product and Route Handlers, plus a Hetzner
VPS for PostgreSQL, the independent solver, authenticated replay service,
disposable Anvil forks, and Caddy. The exact boundary is documented in the
[production runbook](docs/deployments/hetzner-production-runbook.md).

## Run locally

Requirements: Node.js 24+, pnpm 11.20.0, PostgreSQL 16+, and a
Docker-compatible runtime for database integration and fork tests.

```bash
pnpm install
pnpm env:dev
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE \
  pnpm --filter @cobia/web db:migrate
pnpm dev
```

`pnpm env:dev` creates an ignored owner-readable development environment and
never overwrites or prints secrets. Live OKX paths require real credentials;
missing dependencies fail visibly instead of substituting mock product data.

## Reproduce the checks

```bash
pnpm docs:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @cobia/web test:integration
pnpm --filter @cobia/web test:fork
pnpm contracts:test
```

- **CI** runs documentation checks, lint, type checks, unit tests, production
  builds, isolated PostgreSQL integration tests, contract tests, and Compose
  validation on pull requests and `main`.
- **Mainnet fork** runs the digest-pinned X Layer rehearsal nightly and on demand.
- **Security** audits production dependencies and runs CodeQL on every change;
  scheduled container builds are scanned for fixed high and critical issues.

## Roadmap

- Publish a new judge demo covering V4, registered xStocks, and composed
  many-to-one, one-to-many, and many-to-many wallet programs with linked receipts.
- Grow independently operated solvers and attributable external-wallet usage.
- Add an independent security review and a funded disclosure or bounty process.
- Expand assets, protocols, and chains only through explicit identity,
  capability, replay, execution, and postcondition gates.

Roadmap items are goals, not claims of current support. The competition-specific
scorecard and evidence gaps live in the
[X Layer AI Season brief](docs/SUBMISSION.md).

## Security and license

Report vulnerabilities privately through the process in
[`SECURITY.md`](SECURITY.md); never publish exploit details or secrets in an
issue. Cobia is source-available under the
[PolyForm Noncommercial License 1.0.0](LICENSE.md). Commercial use requires a
separate license from Sebastian Böhler.
