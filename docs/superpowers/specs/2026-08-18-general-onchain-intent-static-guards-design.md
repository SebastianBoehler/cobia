# General On-Chain Intent and Atomic Static Guards

## Status

Approved direction for the first protocol-neutral intent increment. This design
extends the existing capability sandbox and executor; it does not replace the
closed-world authorization boundary with arbitrary write calldata.

## Goal

Cobia accepts a canonical policy describing an objective and concrete risk
bounds, lets one or more isolated coding agents search for programs, verifies
each proposal independently, and lets only the owner execute the exact accepted
program. The core policy is not limited to swaps, yield, or named protocols.

The first slice adds arbitrary, code-bound EVM `staticcall` reads as objective
metrics and atomic pre/postconditions. Actions remain typed capability-module
requests. The sandbox may be creative; the verifier and executor remain
deterministic and fail closed.

## Non-goals for this slice

- arbitrary agent-provided write calldata, `delegatecall`, contract creation,
  native value, NFTs, or multiple funding assets;
- asynchronous bridges or atomic claims about off-chain fulfillment;
- unattended principal signing or a sandbox-held wallet key;
- proving global optimality, future APY, future LP fees, impermanent loss, or
  physical delivery; and
- shipping Compete Mode persistence or a public community solver SDK.

One bounded ERC-20 funding input remains the initial execution primitive. Later
policy versions may add other resource authorization models without changing
the sandbox/verifier separation.

## Trust boundary

Generation is open-world; authorization is closed-world.

- A sandbox receives a policy, wallet address, public state, trusted manifest,
  and pinned X Layer block. It receives no private key, signer, browser wallet,
  credential-bearing RPC URL, or production send method.
- The agent may write code, install bounded dependencies, inspect public docs,
  and transact only on its disposable fork.
- The agent emits typed action parameters, reads, predicates, and provenance.
  Its simulation and safety claims have no authority.
- Trusted modules independently compile write calldata and enumerate asset
  flows, approvals, deployments, events, and evidence requirements.
- The verifier independently evaluates reads, checks identities, replays the
  program on a fresh fork, and attests only to the exact execution commitment.
- The owner wallet remains the only principal signer and broadcaster.

## Canonical general policy

`GeneralIntentPolicyV1` is strict, canonical JSON and commits to:

- version, request ID, chain ID `196`, owner, nonce, creation time, deadline,
  maximum evidence age, and manifest hash;
- one ERC-20 funding token and a maximum atomic spend;
- an exact non-empty set of allowed capability ID/version pairs;
- maximum actions, approvals, action calldata bytes, and verifier-estimated gas;
- zero native value and explicit forbidden targets/assets;
- zero to eight required balance constraints;
- zero to eight exact pre/post `StaticPredicateV1` values; and
- one machine objective: satisfy all bounds, maximize a numeric `StaticReadV1`,
  or minimize a numeric `StaticReadV1`.

Every policy requires at least one enforceable post-state outcome: an `after`
predicate or a balance constraint. A precondition alone cannot authorize value
movement.

A human description may be committed for attribution, but has no authorization
semantics. UX labels such as Conservative, Balanced, or Aggressive are presets
only. Before signature, the UI expands them into the concrete fields above and
shows the spend cap, capabilities, targets, predicates, and expiry.

Balance constraints support both:

- `minimumFinal`: the owner's final token balance is at least an absolute
  amount; and
- `minimumIncrease`: the owner's final balance exceeds its pre-execution
  balance by at least an amount.

The agent may choose an input amount below the signed maximum. It may not widen
the capability set, omit a required predicate, change its metric, or weaken a
balance constraint. Optimality is a market-ranking claim, never an on-chain
safety claim.

## Static reads and predicates

`StaticReadV1` commits to:

- target address and expected runtime code hash;
- exact calldata with a non-zero four-byte selector;
- return word index;
- primitive decode type: `uint256`, `int256`, `address`, `bool`, or `bytes32`;
- per-call gas limit; and
- an evidence label that is descriptive only.

`StaticPredicateV1` adds:

- phase: `before` or `after`;
- comparator: `eq`, `gte`, or `lte`; and
- a canonical literal bound compatible with the decode type.

Array order is canonical and preserved; duplicate exact predicates are
rejected. Addresses must have zero high bytes and booleans must be exactly zero
or one. Numeric comparison is signed only for `int256`. `gte` and `lte` are
invalid for address, boolean, and `bytes32` reads.

The executor requires non-empty deployed code whose current `EXTCODEHASH`
matches the commitment. It performs the call with an explicit gas cap, bounds
total predicate gas and calldata, rejects oversized or too-short return data,
and copies only the requested 32-byte word. A revert, out-of-gas call,
malformed primitive, code change, or false comparison reverts the program.

An ABI name or documentation label is not semantic trust evidence. A predicate
only proves that the exact code-bound call returned a primitive satisfying the
literal comparison. The policy author chooses the metric and required calls;
the agent cannot invent a favorable success definition.

Proxy implementation identity is still resolved and committed in verifier
evidence. Because generic EVM code cannot read another contract's storage, the
executor can atomically pin the proxy runtime hash but cannot generically prove
an EIP-1967 implementation slot. A mutable proxy read is executable only when:

1. a verifier-owned capability supplies an on-chain implementation identity
   probe, or
2. the policy explicitly accepts fresh verifier evidence plus its short
   execution deadline.

The UI and evidence distinguish these identity modes. There is no claim that a
runtime hash alone pins an upgradeable implementation.

## Canonical program and evidence

`CapabilityProgramV2` references `GeneralIntentPolicyV1` and commits to:

- request, owner, executor, policy/manifest hashes, pinned block number/hash,
  deadline, nonce, and zero native value;
- one exact ERC-20 input amount not exceeding the policy maximum;
- one to eight ordered typed capability actions;
- the policy's exact balance constraints, predicates, and objective read; and
- no raw executable calldata supplied by the agent.

Modules compile actions to the existing protocol-neutral execution form. The
canonical program commitment covers the typed agent output. A separate
execution commitment covers compiled action identities, exact approvals,
calldata, refund tokens, reads, predicates, and all simulation commitments.

Evidence additionally commits to dependency versions, fetched artifact hashes,
generated files, commands, stdout/stderr hashes, fork transactions, deployment
and proxy identities, read return bytes, decoded values, trace/events/state
diffs, balance deltas, block reference, and replay hashes. Stored evidence is
immutable; redacted displays are derived views, not alternate evidence.

## Executor V3

`CobiaExecutorV3` preserves V2 invariants and adds static reads and absolute
balance constraints. Its sequence is:

1. validate the complete program and verifier authorization;
2. mark the nonce and consume the risk-manager budget (both roll back on any
   later revert);
3. execute all `before` predicates;
4. capture balance baselines and executor refund-token balances;
5. pull the exact input and execute registry-approved actions;
6. clear action approvals and refund every known residual token;
7. enforce absolute and increase balance constraints;
8. execute all `after` predicates; and
9. emit the exact program, simulation, and predicate-result commitments.

Hard limits are verifier- and contract-owned: at most eight actions, eight
predicates, eight balance constraints, sixteen approvals/refund tokens, bounded
aggregate action/predicate calldata, and bounded aggregate predicate gas.
Values are constants in V3, not agent configuration.

V2 remains readable and governed independently. General policies have no V2 or
deterministic execution fallback.

## Independent verification

The V2 general verifier fails closed in this order:

1. Strictly parse and canonicalize policy, program, manifest, and evidence.
2. Match owner, chain, request, nonce, executor, hashes, deadline, limits,
   funding asset/amount, allowed capabilities, forbidden sets, and exact reads.
3. Confirm the pinned block is canonical, final enough, and fresh.
4. Resolve modules and independently compile every write action.
5. Validate targets, selectors, code/proxy identities, values, approvals,
   owners/recipients, deadlines, assets, events, and state deltas.
6. Prove conservative asset flow and all balance constraints.
7. Independently execute every static read and require exact return bytes,
   decoded values, and predicate results.
8. Re-run the compiled program on a fresh fork at the same block and require
   exact trace, events, state diff, balances, deployments, reads, and objective.
9. Produce an EIP-712 verifier authorization for only the exact V3 commitment.

Stable rejection codes include schema/policy/chain/anchor mismatches, stale or
reorganized blocks, forbidden or unsupported capabilities, deployment/proxy
identity changes, invalid asset flow, approval/recipient/value expansion,
static-call code/revert/gas/return/decode/comparison failures, missing evidence,
and replay mismatches. Errors are not collapsed into a generic unsafe result.

## Solver harness and future market

The sandbox profile controls isolation and resources; the signed intent policy
controls financial and execution authority. These are separate commitments.

In a future Compete Mode, deterministic, first-party agent, and community
solvers run in separate ephemeral sessions. A solver may abstain and may replace
its active proposal until the request window closes. Only fresh, independently
verified proposals are ranked. The policy objective value ranks first; expected
gas and canonical program hash provide deterministic tie-breaks. Replaced and
expired proposals are retained only as clearly labeled historical results.

This design does not require Compete Mode persistence to prove V3. The first
slice exposes the types and verifier result required by that future market.

## Commerce and x402 extension boundary

x402 and Shopify UCP fit as later non-atomic mandate types that reuse the
canonical policy and sandbox concepts, not `CobiaExecutorV3` semantics.

- API/digital mandates bind resource, merchant/payee, asset, maximum price,
  expiry, and response commitment.
- Ecommerce mandates bind merchant, SKU/cart, maximum total, shipping-address
  hash, and fulfillment/refund terms.
- Subscription mandates bind payee, asset, per-charge and aggregate caps,
  cadence, expiry, and revocation.

Each payment uses a per-payment owner confirmation or a separately reviewed,
narrow smart-account delegation. The agent never receives the principal key.
HTTP payment settlement, digital response delivery, and physical fulfillment
are separate events with receipts and reconciliation. Cobia must not label them
an atomic final outcome.

## First vertical slice

The proof uses a real registered X Layer capability program on a pinned fork:

- a small bounded USDG-funded action sequence from the production manifest;
- at least one generic code-bound precondition;
- a postcondition expressed through `StaticPredicateV1` against a real deployed
  view function; and
- an objective value independently measured and replayed.

The same proposal must either receive a complete verifier authorization or
stable rejection codes. No test broadcasts a principal X Layer transaction.
Mainnet contracts remain paused until deployment, registry/risk configuration,
fork evidence, and a separate explicit owner approval are complete.

## TDD and release gates

Implementation begins with red tests for:

- policy/program/read/predicate canonicalization and type compatibility;
- changed target, code hash, selector, calldata, word index, bound, phase, gas,
  owner, recipient, value, approval, chain, block, or evidence;
- static-call revert, gas exhaustion, oversized/short return data, dirty
  address/bool encoding, signed edge cases, and false comparisons;
- stale/reorganized anchors, proxy changes, mutable evidence, spoofed replay,
  and objective-result substitution;
- executor atomic rollback, nonce rollback, allowance clearing, residual
  refunds, balance constraints, reentrancy, and user-only execution; and
- sandbox RPC/credential/path/network/process/time/resource escape attempts.

Required gates are narrow unit suites, Foundry unit/fuzz/invariant tests,
package and workspace typechecks, lint, build, audit, migration/diff checks,
full relevant tests, and an opt-in real pinned X Layer Anvil fork. Production
activation additionally requires exact deployed identities, Safe governance
configuration, live read-only verification, and browser-wallet confirmation;
automated release tests do not send a mainnet principal transaction.
