# Open Verifier-Authoritative Solver Design

Date: 2026-08-24 · Status: approved in chat; implementation checkpoint pending

## Goal

Cobia must search every route shape its signed V3 and V4 policies can express.
Plugins provide fast typed access but never decide program admissibility.
The independent verifier is the sole authority for presenting exact calls to a
wallet or authorizing an executor program.

The reference solver may still fail operationally when no honest quote,
calldata, evidence, or replay can be obtained before the signed deadline. It
must not abstain merely because a token, target, selector, protocol, or route is
absent from a curated strategy.

## Superseded boundaries

This extends the prior layered-open, general-asset V4, and solver-plugin designs.
The open lane covers V3 and V4; missing semantic registration is not a verifier
rejection; plugins are construction metadata, not execution authority.

Existing signatures, policies, deployments and governance are not migrated.

## Execution-generation boundary

The deployed V3 executor has an immutable registry gate. It cannot become an
open arbitrary-call executor through an application update. V3 therefore uses
two verified execution surfaces:

- registered atomic capability programs continue through Executor V3; and
- every other admissible route uses the exact verified wallet-transaction
  stages already represented by `TransactionProgramV1`.

This keeps the V3 solver open without pretending an unregistered call has
Executor V3 authority. The wallet still sees and confirms every exact approval
and transaction in the open lane.

V4 has not reached public launch and must be corrected before its canary. Its
current contract requires an active adapter/target/selector registry entry and
always transfers an ERC-20 input. That contradicts verifier-only admission and
native-gas support. The corrected V4 contract is a new deployment; existing V4
addresses and unsigned configuration are not silently reused.

## Product boundary

Generation is open-world; authority is signed and deterministic.

- The solver may research public contracts and ABIs, query providers, read
  pinned state, build arbitrary calldata, compose stages, and simulate.
- Plugins expose fast builders, quoters, decoders, and semantic proof helpers.
- No source, plugin, provider, model, or capability grants authority.
- The verifier accepts only exact independently proven programs.

Unknown protocol identity is not a rejection. Unproven identity or effects are.

## Asset coverage

V3 and V4 support every policy-bound combination of:

- eligible ERC-20 inputs and outputs;
- the native gas asset of a supported chain, including OKB on X Layer and ETH
  on Ethereum;
- native-to-token, token-to-native, token-to-token, and canonical wrap or
  unwrap routes;
- single-stage and multi-stage same-chain routes; and
- V4 Ethereum-to-X-Layer and X-Layer-to-Ethereum staged delivery.

"Every ERC-20" means every exact contract the solver may attempt. A verifier
may reject a fee-on-transfer, rebasing, callback-bearing, blacklistable,
unbounded, stale, illiquid, or otherwise unproven token. That is verifier
policy, not a solver allowlist.

Asset evidence becomes a compatible discriminated model:

- `plain-erc20@1` retains runtime, proxy, implementation, decimals, transfer,
  allowance, and cleanup evidence.
- `native-gas@1` binds chain identity, the canonical native sentinel, decimals,
  pinned block, value and balance accounting, with no token bytecode, proxy, or
  approval fiction.

## Open candidate model

Add one untrusted `OpenRouteCandidateV1` between discovery and generation-
specific programs. It contains:

- signed request and policy commitments;
- ordered stages and dependencies;
- chain, owner, payer, recipient, input and output assets;
- exact call target, calldata, native value, gas estimate, and deadline;
- bounded approvals, permits, delegations, and cleanup expectations;
- expected minimum balance or state outcomes;
- provider artifacts, public sources, code identities, quotes and anchors; and
- optional semantic annotations from plugins.

The candidate is not executable and does not carry a safety verdict. V3 and V4
compilers translate it into their canonical program shapes only after schema
validation. The independent verifier re-derives all executable facts rather
than trusting the candidate compiler.

## Solver architecture

### Concurrent planners

Every solver run starts these lanes concurrently within the signed competition
window:

1. deterministic plugin planners for known high-confidence routes;
2. provider route planners such as OKX and LI.FI;
3. generic onchain search over pinned RPC state, public ABI or source evidence,
   and arbitrary exact-call construction; and
4. bounded composition over complete candidates to satisfy multi-stage or
   multi-output policies.

A slow generic lane cannot block a deterministic candidate. Each complete
candidate is verified and may be submitted as a new revision immediately. The
run continues until the deadline or configured resource budget, allowing a
better later revision.

### Plugin contract

`SolverPluginV1` exposes typed operations such as discover, quote, build,
decode, and explain. It returns untrusted candidate material and provenance.
Plugins never return `accepted`, mutate policy, sign, broadcast, or hide raw
calldata from the verifier.

The initial accelerators remain OKX, LI.FI, Aave V3, Curve StableSwap NG,
Uniswap V3, WOKB, and registered instruments. Removing every semantic plugin
must reduce speed and explanation quality, not close the generic exact-call
lane.

### Run lifecycle

Persist phase and reason separately:

`accepted -> searching -> constructing -> verifying -> submitted`

A run may publish multiple revisions. `completed` records a finished search,
`abstained` means no complete candidate was evidenced before the deadline, and
`failed` is reserved for worker, persistence, or verifier infrastructure.

`NO_SUPPORTED_REFERENCE_ROUTE` is removed as a terminal reason. Operational
reasons identify quote absence, evidence absence, replay failure, budget
exhaustion, or deadline expiry. The UI must not label a timeout as proof that no
route exists.

## V3 compilation and verification

V3 accepts open X Layer transaction programs within the exact signed limits.
The compiler supports native and ERC-20 inputs, optional approvals, exact
native value, arbitrary target and calldata, stage dependencies, and all signed
minimum outcomes.

Provider-specific verification remains available when an artifact is known.
Otherwise the generic verifier must:

1. pin target, proxy, implementation, and created-contract code identities;
2. decode the complete external and internal call graph;
3. reproduce the program on the signed fork anchor;
4. account for owner and executor native, token, allowance, NFT, debt,
   collateral, and relevant storage effects;
5. reject undeclared decreases, recipients, subcalls, value, permissions, or
   residue; and
6. enforce every policy input ceiling, output floor, gas, loss, slippage,
   deadline, forbidden asset and forbidden target bound.

Native input uses exact transaction value and no approval. ERC-20 input uses
only the exact verifier-committed permission required by the program.

## V4 compilation and verification

V4 uses the same open candidate model and supports all
`GeneralAssetPolicyV1` stage graphs: same-chain, multi-stage, multiple outputs,
and asynchronous cross-chain delivery.

The current one-stage same-chain OKX builder becomes one plugin, not the
production solver boundary. V4 adds:

- native-gas identity, valuation, flow and replay evidence;
- optional approvals and exact native value per call;
- same-chain predecessor continuation without inventing bridge delivery;
- generic exact-call stages whose target and code evidence are candidate-bound;
- LI.FI source and delivery stages plus fresh destination reconstruction;
- independent verification and wallet confirmation for every chain stage; and
- exact final output and refund reconciliation across the complete program.

Semantic adapter registration adds stronger protocol-specific findings. The
generic verifier may accept an unknown protocol only when it proves the full
bounded effect set. The onchain executor receives only a verifier-attested
program and continues enforcing nonce, deadline, value, exposure, call,
approval, output, refund, and pause controls.

### Corrected Executor V4 call authority

Each V4 call commits its target runtime code hash in addition to target,
calldata, value, gas and approvals. The executor checks current `extcodehash`
immediately before the call. The verifier signature binds the complete call
array and evidence. The adapter registry no longer decides whether a call is
active; its IDs remain semantic metadata and reviewed plugin configuration.

Native input is represented explicitly, not by calling ERC-20 methods on a
sentinel address. The executor distinguishes native and ERC-20 funding:

- ERC-20 input uses exact `transferFrom` and bounded temporary approvals;
- native input is supplied by exact `msg.value`, requires no approval, and may
  fund only verifier-committed call value;
- unused native input is refunded and executor pre-existing balance is
  preserved; and
- native output is measured as executor-received value during the program and
  transferred to the owner under an exact minimum, avoiding owner gas-cost
  distortion in balance-delta checks.

These changes alter V4 execution types, commitment hashes and runtime bytecode.
They require a new deployment, independent bytecode/config verification and the
normal governance activation delay before a wallet canary.

## Security invariants

- No solver, plugin, provider, browser client, or model signs or broadcasts a
  principal transaction.
- No candidate may enlarge a signed amount, asset, chain, target restriction,
  approval, recipient, deadline, stage, native value, loss, or fee bound.
- No provider response or verified source is trusted without pinned replay.
- Unknown or proxy-upgradeable code must have exact current identity evidence.
- Every internal call and owner-visible negative delta must be explained and
  bounded.
- Native value is input authority, not a fee-shaped escape hatch.
- Executor residue and permissions must be zero or explicitly authorized.
- Cross-chain delivery is asynchronous, finality-gated, and reconstructed on
  the destination from fresh evidence.
- Malformed or incomplete candidates fail before wallet presentation.

The verifier remains conservative. "Verifier-only constraint" does not mean
the verifier accepts effects it cannot observe or prove.

## Error and UX model

The product distinguishes:

- searching with no candidate yet;
- candidate rejected by the verifier with exact findings;
- provider or evidence temporarily unavailable;
- solver resource or competition deadline exhausted; and
- no liquid route observed before the deadline.

Review displays exact assets, chains, calls, value, permissions, delivery,
outcomes, evidence, replay and findings. Plugin labels are explanations, never
trust badges.

## Test strategy

Strict TDD starts with native OKB-to-USDG construction; V3 and V4 native,
ERC-20 and arbitrary-call value/approval binding; distinct native and ERC-20
evidence; same-chain versus bridge graphs; plugin-independent generic calls;
non-blocking concurrent planners; precise run reasons; and adversarial hidden
call, value, approval, proxy, delta, residue, freshness and replay failures.

Verification includes focused package tests, domain and contract tests, solver
integration, pinned X Layer and Ethereum fork replay, deterministic two-chain
delivery replay, full workspace tests, typecheck, lint, build, Docker build,
Compose validation and browser checks that stop before wallet confirmation.

## Implementation slices

1. Repair V3 native routing, artifacts, optional approvals, run reasons and
   concurrent planning.
2. Extract `OpenRouteCandidateV1`, adapt plugins, and add generic V3 replay.
3. Add native-gas evidence and remove V4's ERC-20-only assumptions.
4. Replace V4 registry admission with verifier-bound code identity and native
   semantics, then deploy corrected bytecode.
5. Generalize V4 same-chain stages, LI.FI delivery and generic exact calls.
6. Complete UX and an independent adversarial review before approved canaries.

Each slice is a coherent `main` checkpoint; production stays on the last slice
that passed its release gate.

## Deployment

Secrets remain outside Git. The replacement authenticated OKX credentials are
upserted only into the ignored Hetzner environment and any required Vercel
secret scope, then affected services are recreated. Verification prints only
presence or lengths, never values.

Deployment requires solver registration, an authenticated read-only OKX quote,
replay health, current source revision and public run lifecycle. Automated
tests never sign or broadcast a wallet transaction.

## Success criteria

- Native OKB to USDG no longer times out because the deterministic solver
  rejects native input.
- V3 exact calls enter generic verification without a semantic plugin;
  unregistered calls use the wallet-transaction lane.
- V4 accepts verifier-proven ERC-20 or native-gas pairs, same-chain stages,
  multiple outputs and bridge graphs.
- Plugin removal never becomes an authorization rejection.
- Corrected V4 bytecode uses verifier-bound code identity and native semantics,
  without an independent registry admission gate or ERC-20 sentinel calls.
- Solver limits, quote absence and verifier findings remain distinct.
- Credentials remain current, uncommitted deployment secrets.
