# Cobia current competitive ranking

Snapshot: 23 August 2026. This is a product and market assessment, not an audit,
investment recommendation, or prediction of private hackathon judging.

## Bottom line

Cobia is a technically serious live beta, not a concept. Production exposes 25
publicly traceable X Layer outcomes with about $19.89 of verified principal,
three solver identities, exact program evidence, and transaction links. A
sample executor transaction independently returned a successful chain-196
receipt. The deployed revision is the current `main` head and its CI and
security workflows are green.

The same evidence shows why Cobia is not yet an overall category leader: all 25
public outcomes belong to one wallet; the three solver identities are
Cobia-branded and are not publicly attributable to independent organizations;
22 outcomes are stablecoin swaps and three are direct Aave supplies; and no
public outcome proves a composed swap-to-lending route, cross-chain completion,
x402 settlement, or RWA acquisition.

My current rankings are:

- **BuildX public field:** #1 on technical depth and mainnet evidence; #1-3
  overall because the private field and judge weights are unknown.
- **Bounded multi-step lending intent functionality:** approximately #5, behind
  LI.FI Composer, CoW Atomic Bundles, Across embedded actions, and Enso.
- **Overall production intent/execution market:** approximately #7 when breadth,
  independent supply, audits, distribution, and usage are weighted.
- **Verifier-owned replayed agent-program control plane:** potentially #1 in
  architecture, but not yet externally earned as a product category.

## Current evidence

| Evidence | Verified state | Qualification |
| --- | --- | --- |
| Network | [Chain 196 reports live](https://getcobia.com/api/network/status) | Reachability is not execution evidence. |
| Public outcomes | [25 confirmed outcomes and $19.88934291](https://getcobia.com/api/network?window=all&limit=50) | One wallet; 22 swaps, 3 Aave supplies. |
| Solvers | [Three signed profiles and verifier-derived history](https://getcobia.com/api/solvers) | Names are Cobia-branded; external ownership is unproven. |
| Code quality | 1,603 unit tests and workspace typecheck passed locally; [current CI](https://github.com/SebastianBoehler/cobia/actions) is green | Local runtime was Node 23.11.0 while the repo requires Node 24+. |
| V4 breadth | [Foundation verified, public release blocked](../evidence/general-asset-v4-readiness.md) | Six explicit release blockers remain. |
| Security assurance | Strong internal controls, CodeQL, dependency scanning, fork replay, capped executor | No independent Cobia audit or meaningful public bounty was found. |

## Overall competitor ranking

This ranking weights live execution and reliability 25%, breadth 20%, solver
market depth 15%, external security assurance 15%, adoption/distribution 15%,
and policy/provenance rigor 10%.

| Rank | Product | Why it remains ahead |
| ---: | --- | --- |
| 1 | [LI.FI](https://docs.li.fi/lifi-intents/introduction) | Same- and cross-chain marketplace, permissionless solvers, calls on delivery, Composer flows, large first-party distribution claims, audits, and a $1M bounty. |
| 2 | [CoW Protocol](https://docs.cow.fi/cow-protocol/concepts/introduction/fair-combinatorial-auction) | Mature bonded combinatorial solver auctions, measurable surplus, and [Atomic Bundles](https://forum.cow.fi/t/cow-dao-monthly-recap-may-2026/3463) for complex DeFi strategies. |
| 3 | [Across](https://docs.across.to/guides/dev-guides/crosschain-aave-deposit) | Production cross-chain execution, embedded destination actions, a documented Aave flow, audits, bounty, and a long operating history. |
| 4 | [Enso](https://docs.enso.build/pages/build/get-started/bundling-actions) | 15+ action types across 50+ protocols, including lending, leverage, migration, harvest, and bridge composition. |
| 5 | [Relay](https://docs.relay.link/references/api/quickstart) | Broad multichain payment, swap, call-execution, status, and smart-account rails with mature distribution. |
| 6 | [Rhinestone](https://docs.rhinestone.dev/smart-wallet/smart-sessions/overview) | Strong scoped session-key and delegated-wallet automation across contracts, functions, spending, time, and usage. |
| 7 | **Cobia** | Best-in-class provenance concept and unusually transparent mainnet proof, but narrow coverage, one-wallet usage, unproven independent solver supply, and no external audit. |

[UniswapX](https://github.com/Uniswap/UniswapX) and
[OKX DEX Intent](https://web3.okx.com/onchainos/dev-docs/trade/dex-intent-create-order)
are narrower swap competitors, but they are major distribution threats. The
UniswapX repository lists X Layer deployment and independent audits.

## Where Cobia is genuinely better

1. The product makes the authority split visible: a wallet signs semantic
   bounds; solvers propose; the verifier checks exact identity, code, approvals,
   outcomes, and replay; the wallet alone executes.
2. Public program pages connect a human-readable goal to replay, verified calls,
   block commitments, receipt deltas, and a transaction hash.
3. Unsupported or stale work fails closed instead of receiving mock data or an
   opaque router fallback.
4. The code and verification depth are exceptional for the project's age.

These are meaningful advantages. They do not substitute for execution quality,
independent market participation, security review, or distribution.

## Critical weaknesses

### The solver competition is not yet economically proven

The solver endpoint reports zero median revision improvement for established
segments. Three solver identities and distributed wins prove the exchange can
attribute results; they do not prove the market improves price, yield, safety,
or latency relative to one deterministic router. Publicly disclose operator
ownership and benchmark the winning proposal against direct Curve, Uniswap,
OKX, Enso, LI.FI, and CoW baselines.

### Usage is a canary series, not adoption

Twenty-five receipts from one wallet and roughly $19.89 of principal are strong
functional evidence but almost no market evidence. There is no retention,
external-wallet count, paid volume, or integrator usage to rank.

### Product breadth remains narrow

The public outcome set currently proves USDG/USDt0 swaps and direct Aave supply.
It does not prove the broader language on the home page through public receipts.
V4 is correctly blocked until compile/publish support, eligibility, independent
valuation, fresh stage revalidation, bridge delivery, and migration accounting
are complete.

### External assurance is missing

Internal adversarial tests and fail-closed design are strong, but Cobia controls
the implementation, verifier, deployment, explorer projection, and current
operators. A third-party contract/verifier audit, meaningful bounty, external
reproduction, monitoring, and incident runbooks are required before large value.

### Trust-sensitive UX still has semantic mistakes

A live Aave supply proof was headed correctly but labelled `Swap complete` and
`Confirmed swap result`. On an evidence product, semantic copy is part of the
security interface. Capability cards must also distinguish registered,
executable, and publicly demonstrated states.

### Engineering is ahead of product evidence

The repository contains about 55,600 production TypeScript/Solidity lines and
40,400 test lines. Several production files exceed the project's 300-line soft
limit, while GitHub shows no open issues, stars, or forks. The architecture is
substantial enough to need a public operational backlog and deliberate
modularity work, not more parallel feature surfaces.

## What would make #1 defensible

For a narrow-category #1 claim:

1. Publish 50-100 traceable mainnet executions across at least 10 unrelated
   wallets, including several repeated users.
2. Operate at least three genuinely independent solver organizations with
   attributable identities, code revisions, economics, uptime, abstention,
   rejection, and incident metrics.
3. Show statistically honest baseline comparisons where competition improves
   outcome quality or catches a failure that ordinary routing misses.
4. Publish repeatable receipts for direct supply, swap-to-supply composition,
   exit/withdrawal, x402 purchase, and one safely completed staged route.
5. Commission independent audits of contracts, verifier/compiler, backend
   trust boundary, and public evidence projection; launch a serious bounty.
6. Close V4 gates only through the existing canary/read-back process. Do not
   broaden permissions merely for positioning.
7. Ship an integration-grade SDK/widget/MCP path and secure a real X Layer/OKX
   wallet or protocol design partner.

For BuildX first-place confidence, the shortest proof set is smaller: one
external wallet, one externally operated solver, one composed mainnet outcome,
one adversarial rejection, and a 60-75 second judge path connecting the signed
policy to the final receipt. This would remove the main objections without
rushing V4.

## BuildX public-field assessment

Cobia now has the strongest combination of AI relevance, code depth, mainnet
execution, X Layer centrality, and inspectable evidence among the serious public
entries reviewed in the existing
[BuildX assessment](./2026-08-21-buildx-ai-judging-competitors.md). Aura Homes
still has the clearest broad product demo; Clariona has the simplest sponsor/RWA
story; Xot Markets remains visually direct and continues to improve. Cobia's
new network proof surface removes its earlier largest judging weakness.

That makes Cobia my current public-field #1, but not a confident winner. Private
entries, subjective weights, post-deadline treatment, and judge attention are
unknown. A first-place probability should therefore remain a range rather than
a declaration.

## Conditional deployed V4/V5 assessment

This addendum uses the user's explicit counterfactual: the complete BuildX
field is known, Cobia's general-asset V4/V5 release is implemented and deployed,
and only the enforced governance delay remains. LI.FI, Across, and Relay are
treated as integrated execution rails or adjacent infrastructure, not BuildX
entrants.

Under those assumptions, the current overall ranking is:

1. Cobia
2. Aura Homes
3. Clariona
4. Xot Markets

Cobia is then both the technical leader and the strongest overall entry. A
reasonable subjective estimate is 70-85% for first place while the activation
is visibly timelocked, rising to 80-90% after one reproducible public canary
receipt. Top-three confidence is above 95%. These are judgment estimates, not
statistical probabilities.

The delay is a positive security signal if the submission shows the exact Safe
action, canonical state read-back, and activation timestamp and labels the state
as governance-enforced rollout. It becomes a judging weakness only if it looks
like an unexplained pending deployment. After maturity, one short end-to-end
receipt should connect policy, competing proposals, verifier evidence, wallet
confirmation, execution receipt, and asset delta.

This conditional ranking does not replace the operational readiness record in
the repository. The latter remains authoritative for claims about what is
actually deployed and activated at a given commit.
