# General On-Chain Intent Static Guards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a protocol-neutral signed intent policy, arbitrary code-bound primitive reads, independent verification, and Executor V3 atomic pre/post guards while preserving typed write capabilities and owner-only execution.

**Architecture:** New domain schemas define exact objectives and constraints without stablecoin semantics. Capability Program V2 carries typed module actions and exact reads; an independent verifier recompiles actions and reproduces observations on a fresh pinned fork. Executor V3 accepts only the exact verifier-attested projection and evaluates bounded `staticcall` predicates around registry-approved writes.

**Tech Stack:** TypeScript 5, Zod, viem, Vitest, Solidity 0.8.30, OpenZeppelin, Foundry, Anvil/testcontainers, pnpm workspace.

**Spec:** `docs/superpowers/specs/2026-08-18-general-onchain-intent-static-guards-design.md`

## Global Constraints

- X Layer mainnet is chain `196`; testnet is `1952` and must not be mislabeled.
- The sandbox receives no principal key, browser wallet, credential-bearing RPC URL, or production send/sign method.
- Agent output is typed input only; trusted modules compile every executable write call.
- One bounded ERC-20 funding asset, zero native value, at most eight actions, predicates, and balance constraints.
- Every policy has at least one post-state predicate or balance constraint.
- Files stay below the 300 LOC soft limit; split by responsibility rather than widening existing files.
- Existing Capability Program V1 and Executor V2 behavior remains intact; general policies have no legacy fallback.
- Production deployment, unpause, and mainnet principal transactions remain outside this code release.

## File map

- `packages/domain/src/onchain-read.ts`: primitive read and predicate schemas.
- `packages/domain/src/general-intent-policy.ts`: policy, objective, limits, and balance constraints.
- `packages/solvers/src/capabilities/program-v2.ts`: canonical agent program.
- `packages/solvers/src/capabilities/evidence-v2.ts`: immutable observation and replay evidence.
- `packages/solvers/src/capabilities/static-read.ts`: code-bound call, decode, and comparison logic.
- `packages/solvers/src/capabilities/verifier-v2.ts`: policy/module/evidence/replay verifier.
- `packages/solvers/src/capabilities/sandbox-runner-v2.ts`: V2 sandbox task and provenance collection.
- `contracts/src/CobiaStaticGuard.sol`: bounded assembly `staticcall` and primitive comparison.
- `contracts/src/CobiaExecutorV3.sol`: owner-only atomic program execution.
- `apps/web/lib/atomic-execution/*-v3.ts`: projection, hashing, authorization, and call encoding.
- `apps/web/lib/coding-agent-sandbox/capability-fork-replay-v2.ts`: fresh fork reproduction with reads.

---

### Task 1: Canonical General Intent Policy

**Files:**
- Create: `packages/domain/src/onchain-read.ts`
- Create: `packages/domain/src/general-intent-policy.ts`
- Create: `packages/domain/test/general-intent-policy.test.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**
- Produces: `StaticReadV1Schema`, `StaticPredicateV1Schema`, `GeneralIntentPolicyV1Schema`, `GeneralIntentSnapshotV1Schema`, `parseGeneralIntentPolicyV1(input, nowSec)`.

- [ ] **Step 1: Write failing policy tests**

Cover a valid `maximize` policy and reject unsorted capabilities, duplicate predicates, dirty address/bool comparisons, non-numeric optimization reads, expired deadlines, input `0`, native value, mismatched owner constraints, and policies with no post-state outcome.

```ts
expect(GeneralIntentPolicyV1Schema.parse(validPolicy).objective.kind).toBe("maximize");
expect(() => GeneralIntentPolicyV1Schema.parse({
  ...validPolicy, predicates: [], balanceConstraints: [],
})).toThrow(/post-state outcome/i);
```

- [ ] **Step 2: Run the tests and confirm red**

Run: `pnpm --filter @cobia/domain test -- general-intent-policy.test.ts`

Expected: FAIL because the new exports do not exist.

- [ ] **Step 3: Implement strict schemas**

Use lowercase address/hash transforms, decimal atomic strings, sorted unique arrays, literal chain `196`, and these discriminants:

```ts
type StaticReadV1 = {
  target: Address; runtimeCodeHash: Hash; data: Hex; returnWordIndex: number;
  decodeType: "uint256" | "int256" | "address" | "bool" | "bytes32";
  gasLimit: number; label: string;
};
type StaticPredicateV1 = StaticReadV1 & {
  phase: "before" | "after"; comparator: "eq" | "gte" | "lte"; bound: string;
};
```

Policy capability IDs are exact `{ id, version }` entries. Objectives are `satisfy`, `maximize`, or `minimize`; optimization reads accept only `uint256` or `int256`.

- [ ] **Step 4: Run domain tests and typecheck**

Run: `pnpm --filter @cobia/domain test -- general-intent-policy.test.ts && pnpm --filter @cobia/domain typecheck`

Expected: PASS.

- [ ] **Step 5: Commit the domain boundary**

```bash
git add packages/domain
git commit -m "feat(domain): add general onchain intent policy"
```

### Task 2: Program V2, Evidence, and Static Read Evaluation

**Files:**
- Create: `packages/solvers/src/capabilities/program-v2.ts`
- Create: `packages/solvers/src/capabilities/evidence-v2.ts`
- Create: `packages/solvers/src/capabilities/static-read.ts`
- Create: `packages/solvers/test/capability-program-v2.test.ts`
- Create: `packages/solvers/test/static-read.test.ts`
- Modify: `packages/solvers/src/capabilities/program.ts`
- Modify: `packages/solvers/src/capabilities/module.ts`
- Modify: `packages/solvers/src/capabilities/asset-flow.ts`
- Modify: `packages/solvers/src/index.ts`

**Interfaces:**
- Consumes: Task 1 schemas.
- Produces: `CapabilityProgramV2Schema`, `CapabilityProgramEvidenceV2Schema`, `capabilityProgramCommitmentV2`, `evaluateStaticReadV1`, `evaluateStaticPredicateV1`, `verifyCapabilityAssetFlowV2`.

- [ ] **Step 1: Write failing canonical program and evaluator tests**

Require exact policy reads, input at or below the policy maximum, typed actions only, exact observation hashes, code identity, return length <= 4096 bytes, and canonical primitive decoding. Include signed min/max, dirty address, bool `2`, revert, code drift, short return, oversized return, false comparator, and gas-cap failures.

```ts
await expect(evaluateStaticPredicateV1(predicate, {
  getCodeHash: async () => predicate.runtimeCodeHash,
  call: async () => ({ success: true, returnData: padHex("0x0b", { size: 32 }) }),
})).resolves.toMatchObject({ decodedValue: "11", satisfied: true });
```

- [ ] **Step 2: Run the tests and confirm red**

Run: `pnpm --filter @cobia/solvers test -- capability-program-v2.test.ts static-read.test.ts`

Expected: FAIL on missing modules.

- [ ] **Step 3: Generalize module context without changing V1 behavior**

Replace the concrete V1 program dependency with the minimal context modules already use:

```ts
interface CapabilityProgramContextV1 {
  owner: Address; executor: Address; manifestHash: Hash;
}
```

Keep V1 public signatures working. `verifyCapabilityAssetFlowV2` checks action identity/spend conservation and only claims static guarantees for `minimumIncrease` constraints; absolute constraints require simulation evidence.

- [ ] **Step 4: Implement schemas and bounded evaluation**

Compute `readHash = commitment(StaticReadV1Schema.parse(read))`. Check `getCodeHash(target)` before calling, reject missing code, pass the exact gas cap, bound returned bytes before selecting the 32-byte word, validate primitive canonical form, and compare with type-compatible semantics.

- [ ] **Step 5: Run solver tests and typecheck**

Run: `pnpm --filter @cobia/solvers test -- capability-program-v2.test.ts static-read.test.ts capability-program.test.ts capability-asset-flow.test.ts && pnpm --filter @cobia/solvers typecheck`

Expected: PASS, including unchanged V1 tests.

- [ ] **Step 6: Commit program primitives**

```bash
git add packages/solvers
git commit -m "feat(solvers): add general capability program primitives"
```

### Task 3: Independent General Verifier and Sandbox Runner

**Files:**
- Create: `packages/solvers/src/capabilities/verifier-v2.ts`
- Create: `packages/solvers/src/capabilities/sandbox-runner-v2.ts`
- Create: `packages/solvers/test/capability-verifier-v2.test.ts`
- Create: `packages/solvers/test/capability-sandbox-runner-v2.test.ts`
- Modify: `packages/solvers/src/index.ts`

**Interfaces:**
- Consumes: `CapabilityProgramV2`, trusted `CapabilityRegistryV1`, V2 evidence.
- Produces: `verifyCapabilityProgramV2(input)`, `runCapabilitySandboxV2(input)`, stable `CapabilityProgramV2RejectionCode` values, and replay observations.

- [ ] **Step 1: Write failing verifier security tests**

Test policy/program owner, chain, nonce, manifest, deadline, snapshot, capabilities, limits, forbidden assets/targets, exact predicates/objective, module compilation, asset flow, balance evidence, code/proxy identities, observations, and replay commitments. Mutate one field per test and assert the specific code, including `STATIC_CALL_CODE_MISMATCH`, `STATIC_CALL_FAILED`, `STATIC_RETURN_INVALID`, `PREDICATE_FALSE`, `OBJECTIVE_MISMATCH`, `STALE_EVIDENCE`, and `REPLAY_MISMATCH`. Add V2 harness regressions for path traversal, symlink artifacts, timeout propagation, command-count mismatches, source/dependency mutation, and guaranteed sandbox shutdown.

- [ ] **Step 2: Run verifier tests and confirm red**

Run: `pnpm --filter @cobia/solvers test -- capability-verifier-v2.test.ts capability-sandbox-runner-v2.test.ts`

Expected: FAIL on missing V2 functions.

- [ ] **Step 3: Implement fail-closed verification**

Parse every artifact before reading fields. Recompile every action, compare the exact allowed capability set and limits, evaluate pinned preconditions independently, require evidence for postconditions/objective, and call replay only when no prior rejection exists. Compare replay via canonical commitments, never object identity or labels.

- [ ] **Step 4: Implement the V2 sandbox task**

Write `in/task.json` containing the general policy, address-only wallet, public portfolio, manifest, executor, pinned block, and brokered read-only RPC declaration. Parse only `out/program.json`, `out/evidence.json`, and the existing provenance manifest; retain traversal, symlink, timeout, and `finally` stop behavior.

- [ ] **Step 5: Run V2 and V1 regression suites**

Run: `pnpm --filter @cobia/solvers test -- capability-verifier-v2.test.ts capability-sandbox-runner-v2.test.ts capability-verifier.test.ts capability-sandbox-runner.test.ts coding-agent-rpc-broker.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit verifier and harness**

```bash
git add packages/solvers
git commit -m "feat(solvers): verify general sandbox programs"
```

### Task 4: Executor V3 Atomic Static Guards

**Files:**
- Create: `contracts/src/CobiaStaticGuard.sol`
- Create: `contracts/src/CobiaExecutorV3.sol`
- Create: `contracts/test/utils/ExecutorV3TestBase.sol`
- Create: `contracts/test/utils/StaticGuardTarget.sol`
- Create: `contracts/test/CobiaExecutorV3.t.sol`
- Create: `contracts/test/CobiaExecutorV3Security.t.sol`
- Create: `contracts/test/CobiaExecutorV3Invariant.t.sol`

**Interfaces:**
- Produces: `CobiaExecutorV3.execute`, `executionProgramHash`, `authorizationDigest`, and EIP-712 `VerifierAuthorizationV3`.

- [ ] **Step 1: Write failing Foundry tests**

Cover before/after timing, absolute/increase balances, all primitive decoders, signed comparisons, target code drift, revert, gas exhaustion, short/oversized return data, dirty address/bool words, false predicate, duplicate predicate, aggregate limits, wrong caller/chain/signer/commitment, replayed nonce, inactive action, failure rollback, allowance clearing, residual refunds, and reentrancy.

- [ ] **Step 2: Run V3 tests and confirm red**

Run: `scripts/forge.sh test --match-path 'test/CobiaExecutorV3*.t.sol' -vv`

Expected: FAIL because V3 contracts do not exist.

- [ ] **Step 3: Implement the static guard library**

Use assembly `staticcall` so returndata is not copied wholesale. Reject zero-code targets, mismatched `codehash`, return size outside `32..4096`, and word offsets beyond returndata. Copy only one word. Enforce per-read `gasLimit <= 250_000`, total predicate gas `<= 1_000_000`, total calldata `<= 4_096`, and at most eight predicates.

- [ ] **Step 4: Implement Executor V3**

Preserve V2 registry, risk-manager, nonce, refund, approval-clearing, and EIP-712 rules. Run before predicates before balance capture/input pull and after predicates after refunds and balance checks. Permit zero balance constraints only when an after predicate exists. Emit a predicate-results commitment with the existing program/simulation commitments.

- [ ] **Step 5: Run V3 plus V2 contract suites**

Run: `scripts/forge.sh test --match-path 'test/CobiaExecutorV3*.t.sol' -vv && scripts/forge.sh test --match-path 'test/CobiaExecutorV2*.t.sol'`

Expected: PASS.

- [ ] **Step 6: Commit atomic enforcement**

```bash
git add contracts
git commit -m "feat(contracts): enforce general static guards"
```

### Task 5: Web Projection, Authorization, and Encoding

**Files:**
- Create: `apps/web/lib/atomic-execution/types-v3.ts`
- Create: `apps/web/lib/atomic-execution/types-v3.test.ts`
- Create: `apps/web/lib/atomic-execution/project-capability-program-v3.ts`
- Create: `apps/web/lib/atomic-execution/project-capability-program-v3.test.ts`
- Create: `apps/web/lib/atomic-execution/authorization-v3.ts`
- Create: `apps/web/lib/atomic-execution/authorization-v3.test.ts`
- Create: `apps/web/lib/atomic-execution/encode-v3.ts`
- Create: `apps/web/lib/atomic-execution/encode-v3.test.ts`

**Interfaces:**
- Consumes: accepted V2 verifier output and evidence.
- Produces: `AtomicExecutionProgramV3`, `projectCapabilityProgramV3`, `buildAtomicAuthorizationV3`, `signAtomicAuthorizationV3`, `encodeAtomicExecutionCallV3`.

- [ ] **Step 1: Write failing projection and tamper tests**

Assert exact enum mapping, compiled action coverage, refund-token closure, absolute/increase constraints, read code hash/calldata/word/type/comparator/bound/gas, policy/program/evidence commitments, and 65-byte signature. Mutate every committed field and require rejection before signing or encoding.

- [ ] **Step 2: Run tests and confirm red**

Run: `pnpm --filter @cobia/web test -- types-v3.test.ts project-capability-program-v3.test.ts authorization-v3.test.ts encode-v3.test.ts`

Expected: FAIL on missing modules.

- [ ] **Step 3: Implement the exact ABI model and projection**

Mirror Solidity structs byte-for-byte in `parseAbiParameters`. Omit descriptive labels from execution while retaining target, code hash, calldata, word index, primitive, phase, comparator, bound, and gas. Derive the execution commitment from ABI encoding and EIP-712 domain `CobiaCapabilityExecutor`, version `3`, chain `196`.

- [ ] **Step 4: Run web atomic tests and typecheck**

Run: `pnpm --filter @cobia/web test -- types-v3.test.ts project-capability-program-v3.test.ts authorization-v3.test.ts encode-v3.test.ts project-capability-program.test.ts authorization-v2.test.ts encode-v2.test.ts && pnpm --filter @cobia/web typecheck`

Expected: PASS with unchanged V2 behavior.

- [ ] **Step 5: Commit the browser-wallet projection**

```bash
git add apps/web/lib/atomic-execution
git commit -m "feat(web): project verified general programs"
```

### Task 6: Fresh Fork Reproduction and End-to-End Proof

**Files:**
- Create: `apps/web/lib/coding-agent-sandbox/capability-fork-replay-v2.ts`
- Create: `apps/web/lib/coding-agent-sandbox/capability-fork-replay-v2.test.ts`
- Create: `apps/web/lib/coding-agent-sandbox/capability-program-v2.fork.test.ts`
- Modify: `apps/web/lib/coding-agent-sandbox/vercel-anvil-fork.ts`

**Interfaces:**
- Consumes: verifier-compiled actions, V2 program, exact pinned block.
- Produces: replay evidence with deployments, balances, events, pre/post observations, objective value, trace hash, and state-diff hash.

- [ ] **Step 1: Write failing replay tests**

Mock a program with one before predicate and one after predicate. Assert reads occur in the declared phase, objective is measured after refunds, and chain/anchor/code/return/receipt mismatches fail. Assert only disposable fork RPC receives `eth_sendTransaction` and no `wallet_*` method is called.

- [ ] **Step 2: Run tests and confirm red**

Run: `pnpm --filter @cobia/web test -- capability-fork-replay-v2.test.ts`

Expected: FAIL because replay V2 is missing.

- [ ] **Step 3: Implement fork replay**

Reuse V1 action execution and deployment resolution, but capture exact static observations before actions and after refunds. Include observations and objective value in trace/state commitments. Always stop impersonation and the fork in `finally`.

- [ ] **Step 4: Add the opt-in real X Layer fork proof**

Use production manifest USDG/Aave addresses at the audited pinned block. Fund the disposable owner from the fork only, compile a real Aave supply, require owner USDG balance before, require aToken `balanceOf(owner)` after, and maximize the same numeric read. No production RPC send method is used.

- [ ] **Step 5: Run unit and real fork gates**

Run: `pnpm --filter @cobia/web test -- capability-fork-replay-v2.test.ts`

Opt-in run: `pnpm --filter @cobia/web test:fork -- capability-program-v2.fork.test.ts`

Expected: both PASS when Docker and the configured X Layer RPC are available; otherwise report the exact external prerequisite without weakening the test.

- [ ] **Step 6: Commit the vertical slice**

```bash
git add apps/web/lib/coding-agent-sandbox
git commit -m "test(web): reproduce general programs on an X Layer fork"
```

### Task 7: Threat Model, Full Verification, and Release Checkpoint

**Files:**
- Create: `docs/security/general-onchain-intent-threat-model.md`
- Modify only if required by implemented exports: package entrypoints and existing architecture documentation.

**Interfaces:**
- Produces: evidence-backed release boundary and residual limitations.

- [ ] **Step 1: Document implemented trust boundaries**

Record assets, actors, entry points, guarantees, rejection modes, proxy limitation, sandbox isolation, fork freshness, wallet authority, and x402/UCP non-atomic separation. Explicitly state that V3 is not deployed or activated by this code release.

- [ ] **Step 2: Run narrow and full gates**

```bash
pnpm --filter @cobia/domain test
pnpm --filter @cobia/solvers test
scripts/forge.sh test
pnpm --filter @cobia/web test
pnpm typecheck
pnpm lint
pnpm build
pnpm audit --audit-level high
git diff --check
```

- [ ] **Step 3: Inspect every tracked and untracked change**

Run: `git status --short`, `git diff`, `git diff --cached`, and `git log --oneline --decorate -12`. Preserve concurrent changes and group any remaining work into logical conventional commits.

- [ ] **Step 4: Commit documentation**

```bash
git add docs/security/general-onchain-intent-threat-model.md
git commit -m "docs(security): model general intent execution threats"
```

- [ ] **Step 5: Rebase safely, rerun release gates, push main, and verify production**

Fetch and integrate current `origin/main` without force or destructive reset. Rerun affected tests after any overlap, push `main`, verify the Vercel production build and live existing UI/API, and report that V3 activation still requires separately approved testnet/mainnet deployment transactions and configured identities.
