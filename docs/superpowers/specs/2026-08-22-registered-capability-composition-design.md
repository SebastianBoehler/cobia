# Registered Capability Composition Design

**Date:** 2026-08-22
**Status:** Approved direction, pending review of this written specification

## Problem

The intent composer currently compiles every onchain goal into one fixed
capability template. That is safe for a direct Aave supply, an exact-input
swap, a round trip, or a registered RWA acquisition, but it cannot represent
an optimization goal whose winning program shape is unknown when the owner
signs.

The concrete failing goal is:

> Use at most 1 USDG to enter the best verified stablecoin-yield route on X
> Layer. Only use Aave V3, Curve or Uniswap. Allow no more than 1% conversion
> loss, require a minimum receipt-token balance, and expire in ten minutes.

Asking the owner to choose one template changes the goal. The owner wants
competition over direct Aave, Curve then Aave, or Uniswap then Aave.

The repository already contains registered capability programs, ordered typed
actions, fresh-fork replay, route capture, and deterministic route economics.
The missing layer combines them with cross-asset objectives in the live product.

## Goals

- Compile valid multi-step goals without forcing a single program template.
- Authorize only registered, versioned, verifier-owned capability modules.
- Let solvers choose one to eight ordered actions and revise their programs.
- Express hard cross-action constraints independently of the winning program
  shape.
- Rank accepted programs with deterministic, verifier-owned objective logic.
- Preserve wallet review and execution authority.
- Reuse the current intent, competition, submission, and execution experience.
- Keep all existing simple intent policies and flows backward-compatible.

## Non-goals

- Arbitrary EVM calls, arbitrary targets, or prose-derived execution authority.
- An unrestricted objective language or LLM-based ranking.
- Pretending unsupported protocols or evidence sources are executable.
- Silent economic defaults that are absent from the policy review.
- Migrating or rewriting already signed policies.

## Considered approaches

### Select one existing template automatically

This is small but incorrect. Selecting Aave supply discards route competition;
selecting a swap or round trip does not produce the requested receipt outcome.

### Restore the disconnected stablecoin V2 request product

The V2 route engine already captures and compares the relevant opportunities,
but its request persistence, quote model, and pages are separate from the live
intent competition. Restoring the old product would create two public intent
systems and would not generalize to other registered capability compositions.

### Add registered capability composition to the live intent product

This is the selected approach. A dedicated policy generalizes the dormant
capability composition boundary, adds typed objective and constraint modules,
and projects verified results into the current competition UI.

## Policy model

Add `CapabilityCompositionPolicyV1` with kind `capability-composition` as a new
signed policy type. Existing `OpenIntentPolicyV3` and
`GeneralIntentPolicyV2` remain valid and unchanged.

`GeneralIntentPolicyV3` is already reserved by the approved Executor V4 design
for general-call funding authority. This design deliberately does not reuse or
extend that type: the owner selected registered capabilities rather than
arbitrary EVM calls, and the two trust boundaries must remain distinguishable
in schemas, APIs, verifier routing, and UI.

The new policy reuses the deployed registered-capability Executor V3. It does
not require an Executor V4 contract deployment. Before sandboxing, server code
derives the narrower `GeneralIntentPolicyV2` authority already consumed by the
capability compiler and verifier. The new cross-action constraints and typed
objective remain committed extensions and are checked around that existing
whole-program verification path.

The policy commits to:

- owner, nonce, creation time, competition close, and execution deadline;
- one maximum input budget on X Layer in V1;
- the exact capability manifest hash;
- a sorted allowlist of capability ID and version pairs;
- allowed assets plus forbidden assets and targets;
- action, approval, transaction, calldata, gas, native-value, and solver-fee
  bounds;
- a list of typed constraints;
- exactly one typed objective.

The first constraint library contains:

- existing minimum final and minimum increase balance constraints;
- `maximum-conversion-loss`, expressed in basis points against pinned input
  value and enforced across all swap actions;
- `minimum-registered-receipt-value`, expressed in basis points or atomic USD
  value against a registered receipt identity;
- existing before/after static predicates.

The first objective library contains:

- `satisfy`, for policies whose valid programs are equivalent;
- existing numeric `maximize` and `minimize` static reads;
- `maximize-final-value`, normalized through committed asset valuations;
- `maximize-net-yield`, with a signed comparison horizon and an exact set of
  eligible registered receipt capabilities.

Typed constraint and objective schemas are discriminated unions. Adding a new
kind requires domain validation, evidence capture, deterministic evaluation,
and verifier tests; the compiler cannot invent kinds.

## Concrete goal semantics

The failing goal compiles to a composed draft with:

- maximum input: 1 USDG;
- allowed capabilities: Aave V3 supply, Curve StableSwap NG exact input, and
  Uniswap V3 exact input;
- maximum aggregate conversion loss: 100 basis points;
- minimum registered receipt value: 99% of the input's pinned USD value,
  explicitly derived from the user's 1% loss ceiling;
- objective: maximize net yield;
- comparison horizon: a visible, editable 30-day product default;
- competition close: five minutes after signing;
- execution deadline: ten minutes after signing.

The eligible initial shapes are direct Aave supply, Curve then Aave, and
Uniswap then Aave. Uniswap LP entry is not eligible for this goal because the
goal explicitly requires a registered receipt-token balance.

“At most” remains a maximum budget. It is not rewritten as exact spend. The
receipt constraint makes zero-action and economically empty programs invalid.

## Compiler and review contract

The compiler response becomes a strict discriminated union:

- `simple`, containing the existing editable fixed-template receipt; or
- `composed`, containing typed inputs, capability references, constraints,
  objective, and timing values.

The model only maps prose to registered identifiers and typed fields. Server
code resolves addresses, versions, deployments, receipt identities, default
provenance, and policy commitments.

Derived values are permitted only when their rule is deterministic and visible
in review. The review identifies the source of each derived value. The 99%
receipt-value floor is derived from the explicit 1% loss ceiling. The 30-day
horizon is labeled as a Cobia default and remains editable before signing.

Clarification is reserved for missing authority or contradictions: no input
asset or budget, mutually exclusive constraints, an unregistered capability,
or an objective for which no verifier-owned evaluator exists. A valid composed
goal is never asked to choose one fixed template.

The policy review shows:

- maximum inputs;
- permitted capabilities and versions;
- allowed and forbidden protocols/assets;
- conversion-loss and receipt-value constraints;
- objective and horizon;
- competition close and execution expiry;
- composition and fee limits.

No funds or approvals move during compilation or policy signing.

## Evidence snapshot

Add a composed-intent snapshot version that commits to:

- one canonical block anchor per execution chain;
- the capability manifest hash and deployment code identities;
- registered input, output, and receipt-token identities;
- token valuations and their provider/timestamp;
- protocol-specific opportunities such as Aave supply rate/liquidity and
  Curve/Uniswap exact-input quotes;
- native gas price and valuation evidence required for net calculations.

Snapshot capture fails closed when a required source is stale, missing, on the
wrong chain, or inconsistent with the registered deployment. The snapshot is
immutable and shared by all solvers for a competition revision window.

## Solver contract

Solvers receive only the signed policy, committed snapshot, registered
capability manifest, portfolio bounds, and typed read/quote tools. They return
a capability program containing one to eight ordered actions.

A solver cannot add capabilities, targets, assets, approvals, or value outside
the signed policy. It may abstain when no valid positive-value composition
exists. It may publish improved revisions until the signed close time.

For the first objective module, server-owned tools expose eligible direct and
swap-then-supply primitives from the shared snapshot. Solvers choose or compose
from those primitives; they do not manufacture quotes or deployment data.

## Verification and ranking

Verification has four independent layers:

1. Schema and commitment verification binds policy, snapshot, manifest,
   program, solver identity, and revision.
2. Capability verification compiles each action through its registered module
   and enforces targets, selectors, parameters, approvals, asset flow, and all
   policy limits.
3. Fresh-fork replay verifies exact execution, state deltas, events, approval
   cleanup, receipt attribution, and post-state constraints at the pinned block.
4. Objective evaluation recomputes the comparable measurement solely from
   committed evidence and replay results.

For a solver-chosen receipt asset, verification also projects an exact receipt
token and atomic floor into the selected executable program. Executor V3
enforces that concrete post-state bound onchain. The verifier proves that the
projected bound satisfies the signed cross-asset receipt-value constraint, and
the wallet confirmation shows the concrete bound before execution.

For `maximize-net-yield`, the evaluator normalizes values using pinned prices
and computes projected terminal value over the signed horizon, subtracting
conversion loss, expected gas, and solver fee. Headline APY alone never ranks a
program. The exact arithmetic and rounding rules live in the domain package.

The verifier emits an objective artifact with direction, atomic measurement,
unit, horizon, evidence commitment, and evaluator version. Submission ranking
uses this artifact and a deterministic tie-breaker. The LLM never ranks
programs.

Rejected, expired, and superseded revisions remain auditable. Only a fresh,
accepted, verifier-attested program can be selected and executed.

## API, persistence, and UI

The intent publish API accepts the new policy union member and verifies its
owner signature. The existing intent table stores it without rewriting older
rows. Snapshot and artifact schemas gain explicit composed-intent versions.

The decision intake accepts capability programs for the new policy and routes
them through the composed verifier. Existing transaction-program and open
capability verification paths remain unchanged.

The competition page renders composed policies through the same current
program/revision model. Accepted program cards display the ordered action
summary, hard-constraint evidence, comparable objective value, validity, and
solver identity. Execution continues through the existing attested atomic
executor and wallet confirmation flow.

## Failure behavior

- Unsupported capabilities or objectives return a named clarification before
  signing.
- Missing/stale evidence prevents publication or verification; it is never
  replaced with mock data.
- A solver with no valid program abstains.
- Capability, policy, replay, or objective disagreement rejects the revision
  with an auditable code.
- An expired competition rejects new revisions; an expired execution policy
  cannot be selected or executed.
- Existing simple intents continue through their current paths.

## Verification strategy

- Compiler regression for the exact failing goal and paraphrases.
- Compiler tests for contradictions, unsupported capabilities, prompt
  injection, and derived-value provenance.
- Domain tests for canonicalization, widening attempts, timing, constraints,
  objective schemas, units, arithmetic, and rounding.
- Property tests for cross-asset normalization and net-yield ordering.
- Solver tests for direct Aave, Curve-to-Aave, Uniswap-to-Aave, abstention,
  unknown candidates, and revisions.
- Verifier tamper tests for capability, target, selector, asset, quote, rate,
  valuation, gas, receipt identity, action order, approvals, and objective
  substitution.
- API and persistence tests for the new union member and unchanged legacy
  policies.
- UI tests for composed review and competition evidence.
- Pinned X Layer fork replay for each eligible program shape.
- Browser smoke from the exact goal through policy review and publication.

A real wallet-signed mainnet execution is a separate, explicitly reported
verification step because it moves funds and requires user confirmation.

## Rollout

Ship behind server recognition of the new strict compiler result rather than a
loose feature flag. Deploy domain and verifier support before enabling compiler
emission. Existing workers must advertise the composed-policy version before
the compiler may return it. If no compatible solver is active, the review
screen names the availability error before signing.

Monitor clarification rate, abstentions, verifier rejection codes, replay
latency, objective disagreements, and execution receipts. Do not broaden the
capability or objective libraries until each added module has production
evidence and adversarial verification coverage.
