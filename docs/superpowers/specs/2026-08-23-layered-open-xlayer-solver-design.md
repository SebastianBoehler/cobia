# Layered Open X Layer Solver Design

Date: 2026-08-23
Status: approved design checkpoint

## Goal

Cobia should accept a much wider range of common X Layer intents without making
protocol plugins the ceiling of solver behavior. A solver may construct an
arbitrary X Layer transaction program from installed plugins, live web research,
read-only chain data, ABI or source discovery, and local fork simulation. Cobia
ranks or executes the proposal only after its independent verifier proves that
the exact program stays inside the signed policy.

The first release is X Layer-only and atomic after narrowly scoped wallet setup.
Cross-chain delivery remains a separate lifecycle.

## Decisions

- Use a layered open-solver architecture.
- Admit novel calls through generic effect verification; semantic protocol
  modules add stronger proofs and explanations but are not admission gates.
- Keep protocol plugins and advertise them as operator-declared solver
  capabilities. These claims support discovery and routing, not authorization.
- Prioritize full DeFi position lifecycles rather than adding many shallow
  integrations.
- Use exact wallet setup permissions followed by one atomic executor run.
- Preserve objective ranking. Plugin use or semantic recognition does not grant
  a better rank by itself.

## Current Gap

The current production authority exposes only three semantic capabilities:
Aave V3 supply, Curve StableSwap NG exact-input, and Uniswap V3 exact-input.
The reference strategy also limits swaps to the two registered Aave underlying
assets. An unknown protocol or output asset therefore causes an abstention even
when a valid transaction route may exist.

The in-progress general-asset authority is the correct foundation because a
program stage already commits target, calldata, native value, code hash, bounded
input, outputs, approvals, and refunds. Its current stage transition requires
every non-final stage to bridge, so it cannot yet represent a same-chain atomic
multi-call program. That shape must be corrected before it becomes canonical.

## Architecture

### General solver module

The general solver is a bounded, non-interactive agent runtime. It receives the
signed intent and immutable snapshot and may use:

- operator-installed protocol skills and tools;
- live public web search and source or ABI discovery;
- read-only X Layer RPC access;
- quote and call-construction tools;
- disposable pinned-fork simulation.

It never receives wallet or solver signing keys, transaction broadcasting
methods, or authority to weaken the policy. Its output is a canonical program
and evidence, or a precise abstention.

Known deterministic plugin planners run first because they are faster. If they
do not produce a candidate, the general solver starts with research access in
its first turn. The harness must not instruct the first turn to abstain and only
permit research in a later turn.

### Solver capability profile

Registration continues to use signed operator declarations. Recommended
capability families are:

- `general.evm-program@1`
- `aave-v3.positions@1`
- `curve-stableswap-ng.liquidity@1`
- `uniswap-v3.swaps@1`
- `uniswap-v3.positions@1`
- `xlayer.native-okb@1`
- `okx.dex-routing@1`

These strings mean that the operator claims the corresponding tooling is
available. Cobia must label them as declarations. Verified submissions and
performance history demonstrate competence; the declaration alone does not.

### Program interface

The general-asset program becomes the canonical proposal interface. For the
first release, all actions use chain ID 196 and execute in one atomic program.
The schema must support a same-chain continuation between actions while keeping
the existing predecessor commitment. Cross-chain delivery is not overloaded
onto this transition.

Every action commits:

- target and target runtime code hash;
- proxy or implementation identity when applicable;
- calldata and native value;
- maximum token inputs;
- minimum token, NFT, receipt, or position outputs;
- exact approvals or delegations consumed by the action;
- refund tokens and final recipient;
- gas and deadline bounds.

Known semantic metadata may decorate an action, but the calldata and observed
effects remain authoritative.

### Generic verifier module

The generic verifier is the primary security boundary. It must independently:

1. parse and commit the policy, snapshot, manifest, and program;
2. confirm the pinned block and target, proxy, and implementation code;
3. reject forbidden targets, assets, opcodes, and unbounded native value;
4. replay the complete external and internal call graph on the pinned fork;
5. compare token, native, allowance, NFT, debt, collateral, and storage effects;
6. enforce input ceilings, output floors, gas, slippage, loss, and deadline
   limits;
7. bind all owner, payer, recipient, token ID, and on-behalf-of fields;
8. prove that exact setup permissions were consumed or safely cleared;
9. prove that the executor retains no unintended assets, NFTs, permissions, or
   protocol position after the run;
10. produce objective evidence and explicit findings.

Unknown protocol identity is not a rejection by itself. Missing code identity,
an unexplained subcall, an unsafe state mutation, or an unbounded effect is.

Generic verification attests the observed bounded program at its pinned state;
it does not claim protocol-level meaning that was not proven.

### Semantic protocol modules

Semantic modules are deep implementations behind a small common interface. A
module may recognize calldata, build or quote an action, verify protocol events
and state, add risk predicates, and explain the action to the wallet UI.

The first full-position families are:

#### Aave V3

- supply and withdraw;
- variable-rate borrow and repay;
- repay with aTokens;
- collateral enable or disable;
- eMode selection.

Proof includes reserve identity, aToken and debt-token deltas, exact owner or
on-behalf-of binding, liquidity, value limits, and a signed post-action health
factor floor. Borrow uses exact credit delegation. Withdraw uses a narrowly
approved exit path and may not leave owner assets in executor custody.

Owner-only collateral or eMode controls are exact wallet setup actions. A pure
control intent may complete with that verified wallet action without inventing
an executor call.

#### Curve StableSwap NG

- exact-input exchange;
- balanced and imbalanced liquidity addition;
- proportional liquidity removal;
- single-coin liquidity removal.

Proof includes factory, pool, and implementation identity; coin indices; LP
mint or burn bounds; receiver binding; per-token minimums; and bounded price
impact.

#### Uniswap V3 swaps

- exact-input and exact-output;
- single-pool and multi-hop paths.

Proof includes factory-derived pool identity, fee tiers and path, exact payer
and recipient, maximum input, minimum output, deadline, and price limits.

#### Uniswap V3 positions

- mint and increase liquidity;
- decrease liquidity and collect;
- burn an empty position.

Proof includes NFT ownership, exact token-ID permission, tick and fee-tier
bounds, liquidity deltas, token minima, fee recipient, and intentional return or
burn of the NFT.

#### Native OKB and OKX routing

The native module supports canonical WOKB wrap and unwrap plus bounded native
OKB delivery. It proves wrapper code, exact native value, owner receipt, and
zero unintended executor residue.

The OKX DEX plugin supplies quote and transaction-construction ergonomics. Its
provider response is normalized as evidence, but the generic verifier still
proves the resulting onchain program. Provider authorship is not verifier trust.

Flash loans and liquidations remain available to the general solver. They are
not advertised as semantic capabilities until callback, repayment, profit, and
position-risk invariants have dedicated modules.

## Authorization and Execution

The wallet grants only the exact setup permissions named by the verified
program: token allowance, NFT token-ID approval, or credit delegation. Unlimited
approvals are rejected. The permission amount and spender are bound into the
program and wallet review.

Before execution, Cobia rechecks current code identity, owner state, balances,
liquidity, health factor, permission amounts, and expiry, then performs a fresh
fork replay when state sensitivity requires it. One attested executor call runs
the protocol actions atomically. A revert leaves no partial route.

Confirmed receipts, events, balances, NFTs, debt, collateral, and residual
permissions are recorded after execution. Setup failures never silently advance
the lifecycle.

## Run Lifecycle and Observability

The host owns the run ledger and records:

`accepted -> researching -> constructing -> replaying -> submitted | abstained | failed`

The first record is published before agent work begins. Heartbeats, turn and
token budgets, and the competition deadline bound every phase. Public events
exclude prompts, secrets, raw chain credentials, and private reasoning.

The OpenAI Skills API provides immutable skill versions, and container creation
accepts explicit versioned skill inputs. These are useful runtime inputs, but
Cobia does not rely on an undocumented lifecycle-hook attestation. Its wrapper
emits and persists the authoritative solver lifecycle events.

## Failure Model

The solver abstains only when it cannot construct a complete admissible program
before the deadline. Verifier findings use precise categories, including:

- code or proxy identity unproven;
- unexpected or forbidden subcall;
- input, native value, gas, loss, or slippage bound exceeded;
- output floor missed;
- residual asset, NFT, approval, or delegation;
- stale quote, replay, or owner state;
- health-factor or position-risk floor breached;
- exact owner setup action required;
- no liquid route found before the deadline.

Unknown protocol is not itself a failure category.

## Verification and Rollout

1. Finish the general-asset authority and same-chain transition.
2. Add adversarial generic verifier tests for hidden subcalls, proxy changes,
   approvals, callbacks, storage effects, native value, and cleanup.
3. Open the solver harness to first-turn research and persist the full lifecycle.
4. Ship WOKB/native output, Aave exit, and OKX or Uniswap route construction.
5. Pass pinned-fork regressions for `aXlrUSDG -> USDG`, `aXlrUSDG -> OKB`,
   `USDG -> aXlrUSDG`, and `USDG -> OKB`.
6. Add Aave debt/collateral, Curve LP, and Uniswap V3 NFT position lifecycles.
7. Add capability declarations and semantic assurance details to the product UI.
8. Deploy only after narrow unit and property tests, pinned X Layer fork replay,
   production preflight, and capped wallet canaries pass.

Passing a local replay proves the verification path at one state. Cobia may call
an action production-supported only after the exact wallet execution path passes
a capped live canary.
