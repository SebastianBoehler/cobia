# General Asset V4 Design

**Date:** 2026-08-23
**Status:** Approved in chat; release-hardening decisions approved 2026-08-23

## Problem

Cobia's public Executor V3 lane is open to every wallet, but it only accepts
governance-enabled input tokens. USDG and USDt0 are capped independently in
atomic units. The composer, snapshot capture, verifier, and execution builders
also assume a small registered asset set.

That model is safe for the original stablecoin beta, but it rejects users who
hold other tokens and creates a 48-hour governance ceremony for every new
asset. Its monotonically increasing per-token cumulative cap also eventually
halts otherwise valid use.

Cobia should accept an arbitrary eligible ERC-20 as an exact input or output on
Ethereum or X Layer without treating an explorer-verified contract as trusted.
Breadth must still come from independently verified programs, registered
adapters, bounded wallet authority, and exact receipt reconciliation.

## Goals

- Accept arbitrary eligible ERC-20 inputs and outputs on Ethereum and X Layer.
- Bind exact chain-specific token identities before the owner signs.
- Avoid per-token governance onboarding and atomic-unit risk limits.
- Route only through versioned, registered adapters and verified targets.
- Support durable Ethereum-to-X-Layer and X-Layer-to-Ethereum stage graphs.
- Preserve explicit wallet confirmation for every chain transaction.
- Enforce USD-denominated route and rolling exposure limits onchain.
- Reproduce asset identity, calldata, simulation, and receipts independently.
- Replace the public V3 stablecoin lane after a guarded V4 canary.

## Non-goals

- Accepting a token because its source is verified by an explorer.
- Executing through an arbitrary router or unregistered contract.
- Supporting non-EVM chains in V1.
- Making asynchronous cross-chain execution appear atomic.
- Server-side principal signing, relaying, or wallet custody.
- Supporting fee-on-transfer, rebasing, blacklistable, callback-bearing, or
  otherwise unusual assets without a dedicated semantics module.
- Migrating or mutating an already signed V3 policy.
- Removing emergency pause, deny, exposure, deadline, or wallet-review gates.

## Chosen architecture

Add a general-asset policy, evidence model, staged coordinator, and a new
executor generation. Deploy `CobiaExecutorV4` and `CobiaRiskManagerV2` on
Ethereum chain `1` and X Layer chain `196`.

V4 replaces token allowlists with verifier-authorized asset evidence and USD-E8
exposure. It does not replace target/capability registration. A program may use
an arbitrary eligible token only through an adapter whose code identity,
calldata semantics, approvals, asset flow, and receipts are understood by the
independent verifier.

## Signed policy

`GeneralAssetPolicyV1` commits to:

- owner, nonce, creation time, deadline, and competition close;
- exact source and destination chain IDs;
- exact input token address and maximum atomic input;
- maximum input value in USD-E8;
- exact acceptable output token addresses and minimum output rules;
- allowed adapter IDs and versions;
- manifest, asset-evidence, and valuation-evidence commitments;
- maximum stages, actions, approvals, calldata, gas, bridge fees, solver fee,
  price impact, conversion loss, and slippage;
- required finality and bridge-delivery rules;
- forbidden targets, assets, and chains.

"Any token" is a product admission rule, not post-signature authority. Once the
owner signs, a solver cannot substitute another chain, token, adapter, target,
recipient, or route bound.

## Asset identity and behavior evidence

`AssetIdentityEvidenceV1` contains:

- chain ID and token address;
- runtime code hash;
- proxy kind plus implementation, beacon, and admin identities when present;
- implementation runtime hash;
- pinned block number and hash;
- decimals and interface results;
- behavior-module ID and version;
- evidence timestamp and expiry.

Name and symbol are display metadata only. Address and chain identify the
asset. The verifier repeats runtime and proxy reads immediately before wallet
preparation and fails on drift.

The first behavior module admits plain ERC-20 semantics only. It checks return
values, balance deltas, allowance behavior, decimal bounds, transfer replay,
and approval cleanup on a pinned fork. Tokens with transfer fees, rebasing,
callbacks, mutable balance semantics, blacklist controls, or unsupported proxy
behavior fail closed. Later support requires a dedicated versioned behavior
module with its own verifier and adversarial tests.

## Valuation evidence

`AssetValuationEvidenceV1` expresses input exposure in USD-E8. The initial
production authority is the authenticated OKX Market/DEX API already used by
the asset resolver. This is a deliberate single-aggregator launch mode. It
does not allow a solver or browser client to author price or liquidity fields.

The Cobia server normalizes the OKX response and deterministically derives the
conservative input value by rounding `inputAtomic * priceUsdE8 / 10^decimals`
up. It commits the exact request, normalized response, route, targets,
timestamp, expiry, and provider identity. Missing or zero price, missing or
insufficient liquidity, mismatched chain/token/amount, stale response, or an
unregistered target fails closed.

The evidence binds:

- the asset identity commitment;
- executable quotes from registered providers;
- quote depth, fees, price impact, route targets, and expiry;
- trusted reference-asset identities and valuations;
- the deterministic conservative valuation calculation;
- disagreement and liquidity thresholds.

The verifier uses fresh executable depth rather than a ticker symbol or an
unexecutable headline price. It independently recomputes the normalized value
and quote commitment from server-captured OKX evidence. Missing, shallow,
expired, or inconsistent valuation fails closed. The owner signs both an
atomic maximum and a USD maximum; neither can enlarge the other. Supporting a
second authority later requires a new reviewed provider adapter; it is not a
runtime fallback.

## Registered route adapters

V1 permits registered LI.FI, OKX, and semantic protocol adapters. Registration
is versioned and binds provider endpoints, response schemas, target addresses,
selectors, code and proxy identities, approval semantics, asset-flow rules,
and receipt interpretation.

An adapter produces canonical stage IR. It cannot emit a target, selector,
approval, token, native value, fee, or recipient outside the signed policy and
registered manifest. Explorer verification may support identity evidence but
never grants execution authority.

## General asset program

`GeneralAssetProgramV1` contains ordered stages with:

- source and destination chains;
- exact owner and recipient;
- input/output asset identity commitments;
- exact targets, calldata, native value, and approvals;
- expected asset transitions and refund tokens;
- minimum balance increases and final output;
- provider quote and simulation commitments;
- bridge message and delivery constraints;
- finality requirements, deadlines, and predecessor dependencies.

The verifier canonicalizes the complete program, compiles every stage through
its registered adapter, reproduces it on pinned forks, and signs the exact
executable commitment. A source receipt, bridge delivery, or destination
receipt cannot be skipped, reordered, duplicated, or replaced.

## Contracts

### CobiaExecutorV4

V4 accepts an arbitrary nonzero token address only when the verifier
authorization binds the complete program, owner, chains, input and output asset
evidence, valuation, USD exposure, pinned state, deadline, and nonce.

It retains bounded actions, approvals, calldata, predicates, refunds, balance
constraints, nonce replay protection, exact registered permissions, and
post-state checks. It never discovers tokens, prices, or routes onchain.

### CobiaRiskManagerV2

Risk Manager V2 removes token-enabled mappings and token-specific atomic caps.
It consumes the verifier-signed USD-E8 exposure and enforces:

- `$1,000` maximum per route;
- `$5,000` maximum per wallet in a rolling 24-hour window;
- `$50,000` maximum protocol volume per chain in a rolling 24-hour window.

The contract has no monotonically increasing lifetime cap. It retains global
pause, immediate wallet deny, verifier rotation, Safe ownership, delayed cap
increases, immediate cap reductions, and open/allowlist access modes.

Each chain enforces its local exposure. The coordinator also reserves and
accounts for the complete cross-chain program before preparing each stage so a
program cannot exceed aggregate bounds by splitting activity across chains.

## Durable cross-chain state machine

Cross-chain execution is staged, not atomic:

1. prepare the exact source-chain transaction;
2. obtain explicit owner-wallet confirmation;
3. persist broadcasting state before submission;
4. reconcile the exact finalized source receipt;
5. prove bridge message acceptance and destination delivery;
6. revalidate destination asset, target, price, and deadline evidence;
7. prepare the exact destination-chain transaction;
8. obtain explicit owner-wallet confirmation;
9. reconcile the final receipt and output balance.

Transitions are transactional and idempotent. A mismatch in sender, nonce,
chain, target, value, calldata, logs, delivery, code identity, or balances moves
the program to `reconciliation-required`. It cannot prepare another send until
the discrepancy is resolved through verified chain evidence.

## Product behavior

The composer discovers wallet tokens on Ethereum and X Layer and labels each
as `eligible`, `verification pending`, or `unsupported`, with the exact reason.
It never substitutes by symbol.

Review shows exact contract addresses, chains, maximum atomic and USD input,
output contract, ordered stages, adapters, bridge, approvals, fees, loss and
slippage bounds, minimum output, finality, and expiry. Each stage requires a
visible chain switch and wallet confirmation. No server or solver receives a
wallet handle, private key, or production send method.

## Error handling

The system fails closed with stable error codes for unsupported behavior,
identity drift, proxy drift, missing valuation, stale evidence, insufficient
liquidity, quote disagreement, unregistered adapter, target or selector drift,
cap exhaustion, simulation divergence, finality timeout, bridge mismatch,
receipt mismatch, and post-state failure.

There is no fallback to caller-authored calldata, a generic router, a different
token, a different chain, or an unverified provider.

## Verification strategy

Implementation begins with failing tests for:

- canonical policy and authorization signatures;
- chain/address identity and fake-symbol collisions;
- proxy implementation or admin drift;
- false-return, no-return, fee-on-transfer, rebasing, callback, blacklist, and
  malicious token fixtures;
- stale, manipulated, shallow, and disagreeing valuations;
- target, selector, calldata, approval, recipient, and fee substitution;
- route, wallet, and protocol rolling-window boundaries;
- replay, reentrancy, duplicate stages, reorgs, and finality changes;
- skipped, reordered, duplicated, or mismatched bridge delivery;
- refund, approval cleanup, receipt attribution, and final balance constraints;
- pause, wallet deny, verifier rotation, and delayed cap changes.

Run contract tests, domain/verifier tests, PostgreSQL state-machine integration,
pinned Ethereum and X Layer fork suites, deterministic two-chain replay, full
workspace tests, typecheck, lint, build, and diff checks under Node 24. An
independent adversarial review is required before deployment.

## Deployment and migration

1. Keep V3 and the current production application live throughout deployment
   and judging. Deploy V4 and Risk Manager V2 paused on chains `1` and `196`, owned by the
   governance Safe for that chain.
2. Independently reproduce constructor bindings, runtime and proxy hashes, Safe
   ownership, verifier identity, and adapter permissions.
3. Propose the approved caps, adapter identities, and one canary wallet.
4. After the first 48-hour governance delay, activate the canary configuration
   and unpause only for the named canary wallet.
5. Run one separately approved retail-size cross-chain canary and reconcile
   both receipts. No live principal transaction is an automated release test.
6. Reduce V3's remaining stablecoin budgets and configure the V4 protocol cap
   so the sum of maximum remaining V3 consumption and active V4 rolling
   exposure cannot exceed the documented combined migration budget.
7. Propose V4 public access only after the canary reconciles. After the second
   48-hour governance delay, activate public access and verify both chains.
8. Route only V4-eligible general-asset intents to V4. Existing supported V3
   intents continue using V3 during the observation period.
9. Pause V3 only after V4 public read-back, production smoke tests, and stable
   monitoring. Pausing V3 is not part of the judging-period release.

Existing signed policies are never migrated between executor generations.
Rollback means pausing V4 and leaving the already-live V3 route untouched; it
never silently sends a signed V4 program through V3.

## Success criteria

- A wallet can select an eligible non-registered ERC-20 input and output by
  exact contract on Ethereum or X Layer.
- The signed policy and verifier bind the exact assets, stages, adapters, and
  USD exposure before any wallet transaction appears.
- Registered routes reproduce on pinned source and destination forks.
- The contracts reject unauthorized evidence, stale identity, cap bypass,
  replay, target drift, and post-state violations.
- A canary completes with independently reconciled source, delivery, and
  destination receipts.
- Public V4 status is independently readable and V3 is paused only afterward.
- Unsupported or unverifiable assets fail explicitly without fallback.
