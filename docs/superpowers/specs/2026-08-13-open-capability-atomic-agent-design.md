# Open-Capability Atomic Agent Design

## Goal

Cobia accepts a signed X Layer intent, lets a coding agent author a novel
transaction program in a disposable laboratory, independently verifies and
replays that program, then lets only the intent owner execute the exact
authorized program atomically from their browser wallet.

The architecture is protocol-neutral. Curve, Uniswap, and Aave are the first
production capability modules, not cases embedded in the core program format.
New intents have no deterministic, legacy-route, or raw-calldata fallback.
Historical route records remain readable for attribution and reconciliation.

## Trust boundary

Generation is open-world; authorization is closed-world.

- The sandbox may research, install tools, write code, and simulate any public
  X Layer protocol through a credential-free read broker and disposable fork.
- The sandbox receives a wallet address and public state, never a private key,
  wallet handle, signing method, credential-bearing RPC URL, verifier key, or
  production transaction-send method.
- The agent emits a canonical typed program. Agent-provided calldata is not an
  executable input.
- A production capability module validates typed parameters, reconstructs
  calldata, derives asset flows and final constraints, identifies deployments,
  and checks trace/event/state evidence.
- Unknown or inactive capabilities may retain research evidence but cannot
  receive an execution authorization.
- The trusted coordinator signs only a non-principal EIP-712 authorization
  after independent verification and a fresh pinned-fork replay.
- The connected owner wallet signs the exact approval and executor call. Cobia
  never signs or broadcasts a principal transaction.

## Canonical program

`CapabilityProgramV1` commits to:

- version, request ID, chain ID `196`, policy hash, owner, executor, manifest
  hash, pinned block number/hash, deadline, and nonce;
- one input token and exact maximum input amount;
- one to eight ordered actions containing `capabilityId`, `capabilityVersion`,
  and canonical JSON parameters;
- one to eight owner/account balance constraints;
- zero native value.

The core does not enumerate protocol names. It parses canonical JSON, enforces
size and numeric limits, resolves the module key, and commits to the complete
program. Modules return `CompiledCapabilityActionV1` values containing exact
target, selector, calldata, spend token/maximum, required deployment identities,
asset-flow claims, and evidence predicates.

Exact-input actions use explicit conservative amounts. A module that needs a
dynamic output can target a separately reviewed adapter which reads executor
balances. The executor core never patches arbitrary calldata or delegates to
agent code.

## Capability modules

Each trusted module implements one interface:

```ts
interface CapabilityModuleV1<T> {
  readonly id: string;
  readonly version: number;
  parseParameters(input: unknown): T;
  compile(input: CapabilityCompileInputV1<T>): CompiledCapabilityActionV1;
  verifyEvidence(input: CapabilityEvidenceInputV1<T>): CapabilityFindingV1[];
}
```

The initial registry activates:

- Uniswap V3 exact-input swap;
- Curve StableSwap NG exact-input swap; and
- Aave V3 supply.

These modules enforce exact registered targets and code/proxy identities,
selectors, tokens, recipients, amounts, fees/indices, deadlines, allowances,
events, and post-state deltas. Composition is checked by a protocol-neutral
asset-flow verifier: an action cannot spend more of an asset than the exact
input plus conservatively guaranteed earlier outputs.

LP, staking, other lending, flash-loan, and future modules use the same
interface. Flash loans additionally prove atomic repayment and the signed
minimum final profit. Bridges are research-only because asynchronous completion
cannot share the executor's atomic guarantee. Future APY, LP fees, and
impermanent loss are forecasts, never enforced outcomes.

## Independent verification

Verification is deterministic and fail-closed:

1. Parse the policy, program, manifest, and evidence strictly.
2. Match owner, request, chain, executor, policy/manifest commitments, deadline,
   and pinned block hash.
3. Resolve every capability module and compile every action independently.
4. Match target, selector, runtime/proxy implementation code, tokens, amounts,
   recipients, approvals, and zero value.
5. Prove asset conservation and derive final balance constraints from the
   signed policy and compiled actions.
6. Reject stale evidence, a changed canonical block, unsupported capabilities,
   extra calls, missing events, or mutable evidence.
7. Replay the compiled program on a new Anvil fork at the same block and require
   exact deployment, trace, state-diff, event, and balance commitments.
8. Project the verified program into the atomic route and sign its EIP-712
   authorization outside the sandbox.

Rejection produces stable codes. A passing simulation is necessary but never
sufficient by itself.

## Atomic execution and governance

`CobiaExecutorV2` remains protocol-neutral. It pulls at most the authorized
input, invokes one to eight registry-approved target/selector/code-hash steps,
checks all final balance increases, clears approvals, refunds every known token,
and emits the program/simulation commitments. Any failure reverts the route.

A Safe-owned `CobiaRiskManagerV1` controls:

- allowlist or open-access mode, per-wallet allow and immediate deny;
- enabled input/refund tokens;
- per-token route, wallet/day, and cumulative input caps;
- verifier signer rotation and global pause.

Risk-increasing changes—open access, token activation, cap increases, or signer
rotation—require a 48-hour proposal delay. Pause, wallet deny, token disable,
permission revocation, and cap reductions take effect immediately. The existing
adapter registry applies the same delayed target/selector/code-hash activation
and immediate revocation. The agent controls none of this state.

Immutable executor invariants include owner equals caller, chain-bound
authorization, nonce replay protection, no native value, at most eight steps
and constraints, no unknown tokens, cleared allowances, residual refunds,
reentrancy protection, and final-balance enforcement.

The browser may first request an exact ERC-20 approval for the executor. It
never requests an unlimited approval. If execution fails after approval, the UI
offers an exact revocation transaction and reports that the approval remains.

## Product and persistence

New V2 intent submission starts one coding-agent job instead of invoking the
deterministic and candidate-selector solvers. The coordinator persists job
state, canonical program, provenance, independent verdict, replay evidence,
atomic projection, attestation, and rejection codes. Existing purchase,
owner-proof, receipt attribution, and reconciliation records stay intact.

The private route page distinguishes agent-authored, independently verified,
fork-reproduced, and on-chain enforced facts. It exposes the execution controls
only when the configured executor/risk/registry identities match chain `196`,
the authorization is fresh, the wallet is the policy owner, and all governance
limits currently permit the route.

No public endpoint accepts arbitrary shell commands, RPC methods, calldata, or
verifier signatures. Sandbox jobs are authenticated, rate-limited, bounded by
time/CPU/files/output/network policy, and store hashes rather than secrets.

## Release boundary

Code, migrations, tests, production orchestration, and wallet UI may ship while
the executor stays paused. Mainnet deployment requires the exact Safe address,
verifier public address, token/permission manifest, deployment evidence, and a
separate explicit transaction approval. The first unpause and 10 USD-equivalent
canary likewise require an exact approval sheet. Automated tests never broadcast
a mainnet principal transaction.

## Verification gates

- Red-first unit and adversarial tests for schemas, modules, asset flow,
  evidence, authorization, governance delays, and executor invariants.
- PostgreSQL integration tests for immutable job/evidence/attestation binding.
- Browser tests for owner-only exact approval/execute/revoke behavior.
- Contract unit, fuzz, invariant, and fork interoperability tests.
- A real opt-in pinned X Layer fork reproducing a generated swap-to-Aave
  program and its atomic executor outcome.
- Workspace tests, typechecks, lint, build, audit, migration validation, diff
  checks, and production smoke checks before activation.
