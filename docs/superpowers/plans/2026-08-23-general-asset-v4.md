# General Asset V4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Cobia's token-specific V3 lane with verifier-bound arbitrary ERC-20 input/output execution on Ethereum and X Layer, registered adapters, durable cross-chain stages, and USD-denominated risk limits.

**Architecture:** Extend the unimplemented general-funding V4 foundation with one multi-chain signed policy and chain-local executable stages. Domain schemas bind exact asset/evidence identities; registered adapters and the verifier create executable programs; V4 contracts enforce exact commitments and USD exposure; PostgreSQL reconciles asynchronous stages before the browser presents each wallet transaction.

**Tech Stack:** Node.js 24+, pnpm 11.20.0, TypeScript 6.0.3, Zod 4.4.3, viem 2.55.11, Next.js 16.3.0, React 19.2.8, PostgreSQL/Drizzle 0.45.2, Vitest 4.1.10, Solidity 0.8.30, Foundry, OpenZeppelin 5.6.1

**Spec:** `docs/superpowers/specs/2026-08-23-general-asset-v4-design.md`

## Global Constraints

- The 2026-08-23 spec supersedes conflicting token-admission, adapter-authority, and risk-limit details in the 2026-08-21 V4 plans.
- V1 supports only Ethereum chain `1` and X Layer chain `196`.
- The signed policy binds exact chain/address asset identities before any executable program exists.
- Only registered LI.FI/OKX or semantic adapters may produce executable calls.
- Initial caps are `$1,000` per route, `$5,000` per wallet rolling 24 hours, and `$50,000` protocol rolling 24 hours per chain.
- No token allowlist, per-token atomic cap, or lifetime cumulative cap exists in V4.
- Every chain transaction requires an explicit owner-wallet confirmation; no server or solver may sign or broadcast principal.
- V3 remains live until a separately approved V4 canary and public read-back pass; no mainnet principal transaction is an automated test.
- Use strict TDD, preserve historical policy/program encodings, keep files below the 300 LOC soft limit, and run final gates under Node 24+.

---

### Task 1: Canonical policy, asset evidence, and stage types

**Files:**
- Create: `packages/domain/src/general-asset-evidence.ts`
- Create: `packages/domain/src/general-asset-policy.ts`
- Create: `packages/domain/src/general-asset-program.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/domain/test/general-asset-policy.test.ts`
- Test: `packages/domain/test/general-asset-program.test.ts`

**Interfaces:** Produces `AssetIdentityEvidenceV1Schema`, `AssetValuationEvidenceV1Schema`, `GeneralAssetPolicyV1Schema`, `GeneralAssetProgramV1Schema`, and parsers; preserves existing encodings.

- [ ] **Step 1: Write failing canonical authority tests** that accept exact chain `1 | 196` address identities and reject zero addresses, ambiguous symbols as authority, unsorted adapter/output sets, stale evidence, output substitution, missing predecessor stages, and policies without atomic plus USD maxima.

```ts
expect(GeneralAssetPolicyV1Schema.parse(policy)).toMatchObject({
  sourceChainId: 1, destinationChainId: 196,
  input: { token: WETH, maximumAtomic: "1000000000000000000", maximumUsdE8: "300000000000" },
});
expect(() => GeneralAssetPolicyV1Schema.parse({ ...policy,
  outputs: [{ chainId: 196, token: OTHER }] })).toThrow();
expect(() => GeneralAssetProgramV1Schema.parse({ ...program,
  stages: [program.stages[1]!, program.stages[0]!] })).toThrow();
```

- [ ] **Step 2: Run RED:** `pnpm --filter @cobia/domain exec vitest run test/general-asset-policy.test.ts test/general-asset-program.test.ts`; expect missing schema exports.
- [ ] **Step 3: Implement strict schemas** with canonical sorted/unique sets, exact `chainId + token`, committed identity/valuation hashes, stage IDs, predecessor IDs, finality, delivery, atomic/USD/loss/fee/deadline bounds, and at least one final output constraint.

```ts
export const ChainAssetV1Schema = z.object({ chainId: z.union([z.literal(1), z.literal(196)]), token: AddressSchema }).strict();
export const GeneralAssetPolicyV1Schema = z.object({ version: z.literal(1), kind: z.literal("general-asset"), owner: AddressSchema,
  input: ChainAssetV1Schema.extend({ maximumAtomic: PositiveAtomicAmountSchema, maximumUsdE8: PositiveAtomicAmountSchema }), outputs: z.array(ChainAssetV1Schema).min(1),
  identityEvidenceHash: HashSchema, valuationEvidenceHash: HashSchema, deadline: z.number().int().positive() }).strict();
```
- [ ] **Step 4: Run GREEN:** focused tests plus `pnpm --filter @cobia/domain typecheck`.
- [ ] **Step 5: Commit:** `git commit -m "feat(domain): define general asset v4 authority"` with only Task 1 files.

### Task 2: Dynamic asset identity, behavior, and valuation verification

**Files:**
- Create: `packages/solvers/src/general-assets/identity.ts`
- Create: `packages/solvers/src/general-assets/behavior.ts`
- Create: `packages/solvers/src/general-assets/valuation.ts`
- Create: `packages/solvers/src/general-assets/rejections.ts`
- Modify: `packages/solvers/src/index.ts`
- Test: `packages/solvers/test/general-asset-evidence.test.ts`

**Interfaces:** Consumes pinned-block readers and normalized provider quotes; produces `verifyAssetEvidenceV1(input): Promise<AssetEvidenceVerdictV1>`.

- [ ] **Step 1: Write failing evidence tests** for runtime/proxy drift, false/no-return ERC-20s, fee-on-transfer, rebasing, callbacks, blacklist/admin surfaces, decimals outside `0..36`, stale blocks, shallow quotes, price disagreement, and symbol collisions.

```ts
expect((await verifyAssetEvidenceV1(validFixture())).accepted).toBe(true);
expect((await verifyAssetEvidenceV1(proxyDriftFixture())).errorCodes)
  .toContain("ASSET_IMPLEMENTATION_DRIFT");
expect((await verifyAssetEvidenceV1(shallowQuoteFixture())).errorCodes)
  .toContain("VALUATION_LIQUIDITY_INSUFFICIENT");
```

- [ ] **Step 2: Run RED:** `pnpm --filter @cobia/solvers exec vitest run test/general-asset-evidence.test.ts`; expect missing verifier.
- [ ] **Step 3: Implement plain-ERC20 behavior evidence** and conservative USD-E8 valuation from fresh executable quote depth and trusted reference assets. Source verification is evidence metadata only; any unsupported behavior fails closed.

```ts
export async function verifyAssetEvidenceV1(input: VerifyAssetEvidenceInput): Promise<AssetEvidenceVerdictV1> {
  const identity = await verifyIdentity(input.reader, input.claimedIdentity);
  const behavior = await verifyPlainErc20Behavior(input.fork, identity);
  const valuation = verifyExecutableValuation(input.quotes, input.referenceAssets, input.nowSec);
  return verdict(identity, behavior, valuation);
}
```
- [ ] **Step 4: Run GREEN:** focused test plus `pnpm --filter @cobia/solvers typecheck`.
- [ ] **Step 5: Commit:** `git commit -m "feat(verifier): verify general asset evidence"` with only Task 2 files.

### Task 3: USD-denominated Risk Manager V2

**Files:**
- Create: `contracts/src/CobiaRiskManagerV2.sol`
- Create: `contracts/test/utils/RiskManagerV2TestBase.sol`
- Test: `contracts/test/CobiaRiskManagerV2.t.sol`
- Test: `contracts/test/CobiaRiskManagerV2Invariant.t.sol`

**Interfaces:** Produces `consumeUsd(address wallet,uint128 exposureUsdE8)`, cap reads, governance controls, and verifier rotation; only immutable `CobiaExecutorV4` consumes it.

- [ ] **Step 1: Write failing Foundry tests** proving arbitrary tokens need no registration, only the executor can consume, route/wallet/protocol caps enforce `$1k/$5k/$50k`, 24 hourly buckets expire conservatively, no lifetime counter blocks use, increases wait 48 hours, and reductions/pause/deny are immediate.

```solidity
vm.prank(executor); risk.consumeUsd(alice, 1_000e8);
vm.prank(executor); vm.expectRevert(CobiaRiskManagerV2.RouteCapExceeded.selector);
risk.consumeUsd(alice, 1_000e8 + 1);
vm.warp(block.timestamp + 25 hours);
vm.prank(executor); risk.consumeUsd(alice, 1_000e8);
```

- [ ] **Step 2: Run RED:** `scripts/forge.sh test --match-contract CobiaRiskManagerV2Test -vvv`; expect the contract to be absent.
- [ ] **Step 3: Implement a 24-slot hourly ring** for wallet and protocol exposure, conservative boundary accounting, Safe ownership, delayed cap increases, immediate reductions, and no token mappings.

```solidity
function consumeUsd(address wallet, uint128 usdE8) external {
    if (msg.sender != executor) revert OnlyExecutor(); _requireAccess(wallet);
    if (usdE8 > routeCapUsdE8) revert RouteCapExceeded();
    uint64 hour = uint64(block.timestamp / 1 hours);
    if (_rollingWallet(wallet, hour) + usdE8 > walletWindowCapUsdE8) revert WalletCapExceeded();
    if (_rollingProtocol(hour) + usdE8 > protocolWindowCapUsdE8) revert ProtocolCapExceeded();
    walletHourlyUsdE8[wallet][hour] += usdE8; protocolHourlyUsdE8[hour] += usdE8;
}
```
- [ ] **Step 4: Run GREEN:** `scripts/forge.sh test --match-path 'test/CobiaRiskManagerV2*.t.sol' -vvv` including fuzz/invariant coverage.
- [ ] **Step 5: Commit:** `git commit -m "feat(contracts): add usd risk manager v2"` with only Task 3 files.

### Task 4: Registered-adapter Executor V4 and interop vectors

**Files:**
- Create: `contracts/src/CobiaExecutionTypesV4.sol`
- Create: `contracts/src/CobiaExecutorV4.sol`
- Create: `contracts/test/utils/ExecutorV4TestBase.sol`
- Test: `contracts/test/CobiaExecutorV4.t.sol`
- Test: `contracts/test/CobiaExecutorV4Security.t.sol`
- Create: `apps/web/lib/execution-v4/abi.ts`
- Create: `apps/web/lib/execution-v4/commitment.ts`
- Test: `apps/web/lib/execution-v4/commitment.test.ts`

**Interfaces:** Produces V4 structs, hashes, and matching TypeScript commitments; consumes `CobiaAdapterRegistry` and `CobiaRiskManagerV2.consumeUsd()`.

- [ ] **Step 1: Freeze failing TypeScript/Solidity vectors** for owner, chain, exact input/output tokens, identity/valuation/stage hashes, USD exposure, calls, approvals, refunds, constraints, pinned block, deadline, and nonce.
- [ ] **Step 2: Run RED:** `pnpm --filter @cobia/web exec vitest run lib/execution-v4/commitment.test.ts` and `scripts/forge.sh test --match-contract CobiaExecutorV4Test -vvv`; expect missing V4 implementations.
- [ ] **Step 3: Implement V4** with ordinary `CALL`, active registered adapter keys, exact target/runtime hash, verifier EIP-712 signature, USD consumption, owner-only entry, nonce/reentrancy protection, bounded calls/calldata/gas/approvals/refunds, exact allowance cleanup, residue refunds, and final balance constraints. Expose no delegatecall or creation path.

```solidity
function execute(ExecutionProgramV4 calldata program, VerifierAuthorizationV4 calldata auth, bytes calldata signature)
    external payable nonReentrant {
    _validate(program, auth, signature); nonceUsed[msg.sender][program.nonce] = true;
    riskManager.consumeUsd(msg.sender, program.inputUsdE8); _acquire(program); for (uint256 i; i < program.calls.length; ++i) _registeredCall(program.calls[i]);
    _clearApprovalsAndRefund(program); _assertOutcomes(program);
}
```
- [ ] **Step 4: Add adversarial tests** for forged USD value, altered adapter/target/calldata/order/value, code drift, approval theft, dirty residue, reentrancy, hidden wallet debit, stale authorization, and rollback.
- [ ] **Step 5: Run GREEN:** focused Vitest, all V4 Foundry tests, and `scripts/forge.sh fmt --check`.
- [ ] **Step 6: Commit:** `git commit -m "feat(contracts): add registered adapter executor v4"` with only Task 4 files.

### Task 5: Registered route verification, replay, and attestation

**Files:**
- Create: `packages/solvers/src/general-assets/adapter-manifest.ts`
- Create: `packages/solvers/src/general-assets/program-verifier.ts`
- Create: `packages/solvers/src/general-assets/asset-flow.ts`
- Test: `packages/solvers/test/general-asset-program-verifier.test.ts`
- Create: `apps/web/lib/execution-v4/fork-replay.ts`
- Create: `apps/web/lib/execution-v4/attestation.ts`
- Test: `apps/web/lib/execution-v4/fork-replay.test.ts`
- Test: `apps/web/lib/execution-v4/general-asset-v4.fork.test.ts`

**Interfaces:** Produces `verifyGeneralAssetProgramV1()`, `replayGeneralAssetStageV1()`, and `attestExecutionProgramV4()`; only attestation creates executable authority.

- [ ] **Step 1: Write failing verifier tests** for unregistered provider/adapter, target/selector/code drift, approval/recipient substitution, asset-flow gaps, skipped stages, quote expiry, simulation divergence, and favorable output with hidden loss.
- [ ] **Step 2: Run RED:** focused solver and web tests; expect missing verifier/replay exports.
- [ ] **Step 3: Implement phased verification**: schema/commitments, asset evidence, manifest identity, exact adapter compilation, conservative flow, fresh pinned-fork replay, then attestation. Extend existing LI.FI/OKX normalizers; do not add a generic-router fallback.

```ts
export async function verifyGeneralAssetProgramV1(input: VerificationInput): Promise<GeneralAssetVerdictV1> {
  const parsed = parseAuthority(input); const assets = await verifyAssets(parsed, input.readers); const calls = compileRegisteredAdapters(parsed, input.manifest);
  assertConservativeFlow(parsed, calls, assets);
  const replay = await replayAllStages(parsed, calls, input.forks);
  return replay.matches ? accepted(parsed, calls, replay) : rejected("REPLAY_DIVERGED");
}
```
- [ ] **Step 4: Run GREEN:** focused tests and opt-in Ethereum/X Layer fork tests when both RPCs are configured.
- [ ] **Step 5: Commit:** `git commit -m "feat(verifier): attest registered general asset routes"` with only Task 5 files.

### Task 6: Durable multi-chain coordinator and receipt reconciliation

**Files:**
- Create: `apps/web/drizzle/0022_general_asset_v4.sql`
- Modify: `apps/web/drizzle/meta/_journal.json`
- Create: `apps/web/lib/db/general-asset-executions.ts`
- Create: `apps/web/lib/execution-v4/stage-machine.ts`
- Create: `apps/web/lib/execution-v4/receipt-reconciler.ts`
- Test: `apps/web/lib/db/general-asset-executions.integration.test.ts`
- Test: `apps/web/lib/execution-v4/stage-machine.test.ts`
- Test: `apps/web/lib/execution-v4/receipt-reconciler.test.ts`

**Interfaces:**
- Produces: `prepareStage()`, `armStage()`, `recordSubmission()`, `reconcileStageReceipt()`, and `recordBridgeDelivery()` over states `pending | prepared | broadcasting | submitted | finalized | delivered | confirmed | reconciliation_required | failed`.

- [ ] **Step 1: Write failing state-machine and PostgreSQL tests** for transactional arm-before-send, idempotent retries, predecessor/finality gates, chain/sender/nonce/target/value/calldata/log mismatch, bridge delivery duplication, reorg rollback, and final-output reconciliation.
- [ ] **Step 2: Run RED:** focused unit and integration tests; expect missing migration/repository.
- [ ] **Step 3: Implement normalized program/stage/receipt tables** and row-locked transitions. Persist `broadcasting` before wallet submission; exact mismatches enter `reconciliation_required` and cannot prepare another send.

```ts
export async function armStage(tx: Transaction, programId: string, stageId: string) {
  const stage = await lockStage(tx, programId, stageId);
  if (stage.state !== "prepared" || !await predecessorFinalized(tx, stage)) throw new StageTransitionError();
  return updateStage(tx, stage, { state: "broadcasting", armedAt: new Date() });
}
```
- [ ] **Step 4: Run GREEN:** focused unit tests and `pnpm --filter @cobia/web test:integration -- lib/db/general-asset-executions.integration.test.ts`.
- [ ] **Step 5: Commit:** `git commit -m "feat(execution): persist multi-chain v4 stages"` with only Task 6 files.

### Task 7: Composer, review, APIs, and wallet execution

**Files:**
- Modify: `apps/web/lib/assets/resolve-mentions.ts`
- Modify: `apps/web/app/api/assets/resolve/route.ts`
- Create: `apps/web/lib/intents/general-asset-draft.ts`
- Modify: `apps/web/lib/intents/build-composer-policy.ts`
- Modify: `apps/web/components/intents/IntentComposer.tsx`
- Create: `apps/web/components/intents/GeneralAssetPolicyEditor.tsx`
- Create: `apps/web/components/intents/GeneralAssetExecutionView.tsx`
- Modify: `apps/web/app/api/programs/[submissionId]/execution/route.ts`
- Create: `apps/web/app/api/programs/[submissionId]/stages/[stageId]/route.ts`
- Test: corresponding colocated unit/API/component tests.

**Interfaces:**
- Produces: exact contract selection with `eligible | verification_pending | unsupported`, editable atomic/USD bounds, stage review, explicit chain switching, and exact attested `{ to, data, value, chainId }` submission.

- [ ] **Step 1: Write failing product tests** for random wallet tokens, same-symbol ambiguity, exact address selection, Ethereum/X Layer outputs, unsupported-behavior reasons, USD caps, ordered stage review, chain switch, and refusal to submit a transaction differing from the attestation.
- [ ] **Step 2: Run RED:** focused asset, composer, API, and component tests.
- [ ] **Step 3: Implement deterministic compilation and review.** The model may select only supplied exact identities and registered adapters; server code supplies hashes, owner, nonce, limits, evidence, and executable transactions.

```ts
export type GeneralAssetDraftResult =
  | { status: "review"; policy: GeneralAssetPolicyV1 } | { status: "clarification"; question: string };
export function assertExactStageTransaction(attested: WalletTransaction, proposed: WalletTransaction) {
  if (commitment(attested) !== commitment(proposed)) throw new Error("Wallet transaction does not match attestation");
}
```
- [ ] **Step 4: Implement stage APIs/client** using Task 6 transitions; every stage requires a separate wallet confirmation and post-submit reconciliation.
- [ ] **Step 5: Run GREEN:** focused tests, `pnpm --filter @cobia/web typecheck`, lint, and build.
- [ ] **Step 6: Commit:** `git commit -m "feat(web): add general asset v4 flow"` with only Task 7 files.

### Task 8: Deterministic deployment, migration, and release gates

**Files:**
- Create: `apps/web/lib/deployment/agent-executor-v4-plan.ts`
- Create: `apps/web/lib/deployment/mainnet-v4-state-verifier.ts`
- Create: `apps/web/scripts/prepare-agent-executor-v4-deployment.ts`
- Create: `apps/web/scripts/verify-agent-executor-v4-state.ts`
- Modify: `package.json`
- Create: `docs/deployments/general-asset-v4-runbook.md`
- Test: `apps/web/lib/deployment/agent-executor-v4-plan.test.ts`
- Test: `apps/web/lib/deployment/mainnet-v4-state-verifier.test.ts`

**Interfaces:**
- Produces signer-free `executor:v4:plan` and `executor:v4:verify proposed|canary|open` commands for chains `1` and `196`; never signs, proposes, or broadcasts.

- [ ] **Step 1: Write failing deterministic artifact/read-back tests** for constructor bindings, Safe/verifier/registry identities, bytecode hashes, `$1k/$5k/$50k` caps, pause/access state, adapter permissions, and canonical pinned blocks on both chains.
- [ ] **Step 2: Run RED:** focused deployment tests; expect missing plan/verifier.
- [ ] **Step 3: Implement signer-free planners/verifiers and the runbook** with explicit stop points for deploy, Safe proposal, delayed activation, canary, public opening, and V3 pause.

```ts
export type V4ReleaseMode = "proposed" | "canary" | "open";
export async function verifyMainnetV4State(chainId: 1 | 196, mode: V4ReleaseMode, reader: V4StateReader) {
  const block = await reader.latestCanonicalBlock(); return assertV4BindingsAndCaps(await reader.snapshot(block),
    { chainId, mode, routeUsdE8: 1_000e8, walletUsdE8: 5_000e8, protocolUsdE8: 50_000e8 });
}
```
- [ ] **Step 4: Run GREEN:** deployment tests and both planners against local deterministic inputs; do not create a Safe proposal.
- [ ] **Step 5: Commit:** `git commit -m "feat(deployment): prepare general asset v4 release"` with only Task 8 files.

### Task 9: Full regression and adversarial completion gate

**Files:** Modify only defects introduced by Tasks 1-8; create `docs/evidence/general-asset-v4-readiness.md`.

**Interfaces:** Produces an evidence record distinguishing local, fork, deployment, and separately approved mainnet readiness.

- [ ] **Step 1: Run focused malicious-token, contract invariant, verifier, coordinator, API, and UI suites under Node 24+** and fix only confirmed regressions.
- [ ] **Step 2: Run complete gates:** `pnpm test && pnpm typecheck && pnpm lint && pnpm build && pnpm contracts:test && pnpm --filter @cobia/web test:integration && git diff --check`.
- [ ] **Step 3: Run opt-in pinned forks** for Ethereum and X Layer when canonical RPC configuration is present; report exact skipped gates otherwise.
- [ ] **Step 4: Perform an independent adversarial review** against token behavior, verifier compromise, valuation understatement, target drift, allowance theft, stage replay, bridge mismatch, and dual V3/V4 accounting; add focused regressions for confirmed findings.
- [ ] **Step 5: Write readiness evidence** with exact counts, hashes, caveats, and explicit external-action stop points.
- [ ] **Step 6: Commit:** `git commit -m "test: complete general asset v4 readiness gate"` with only fixes and evidence.

## External action boundary

Implementation and local/fork verification do not authorize Ethereum or X Layer deployment, production migration, Vercel deployment, Safe actions, V4 activation, a real-money canary, or pausing V3. Each remains separately verified and explicitly approved after Task 9.
