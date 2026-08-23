# General Asset V4 Release Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the six V4 public-release blockers while V3 stays live, then produce verified dark-deployment and Safe activation artifacts for Ethereum and X Layer.

**Architecture:** OKX is the sole server-side valuation authority for the first release, while asset identity, target code, execution replay, receipts, and delivery remain independently verified from pinned chain state. General-asset policies become a first-class public intent family; every wallet preparation revalidates committed evidence. V3 and V4 run in parallel under a partitioned migration budget until V4 completes both 48-hour governance windows and canary monitoring.

**Tech Stack:** Node.js 24+, pnpm 11.20.0, TypeScript 6.0.3, Zod 4.4.3, viem 2.55.11, Next.js 16.3.0, PostgreSQL/Drizzle 0.45.2, Vitest 4.1.10, Solidity 0.8.30, Foundry

**Spec:** `docs/superpowers/specs/2026-08-23-general-asset-v4-design.md`

## Global Constraints

- V3 remains publicly available throughout implementation, dark deployment, both governance delays, canary execution, and initial V4 monitoring.
- V1 supports only Ethereum chain `1` and X Layer chain `196`.
- OKX is the single approved valuation authority; no solver-authored USD or liquidity value and no provider fallback is accepted.
- Runtime code, proxy identity, token behavior, registered targets, replay, receipts, and bridge delivery are verified independently from pinned chain state.
- An arbitrary token is discoverable without a static allowlist but executable only when every required evidence gate passes.
- Initial combined caps remain `$1,000` per route, `$5,000` per wallet, and `$50,000` protocol exposure per chain.
- Every production transaction remains owner-confirmed; server code never signs or broadcasts principal.
- Use strict red-green TDD, keep new files below the 300 LOC soft limit, and run final gates under Node.js 24.18.0 or newer.

---

### Task 1: Server-owned OKX valuation and production asset eligibility

**Files:**
- Create: `apps/replay-service/src/asset-evidence.ts`
- Test: `apps/replay-service/src/asset-evidence.test.ts`
- Modify: `apps/replay-service/src/index.ts`
- Modify: `apps/web/lib/replay/remote-client.ts`
- Test: `apps/web/lib/replay/remote-client.test.ts`
- Create: `apps/web/lib/assets/okx-general-asset-eligibility.ts`
- Test: `apps/web/lib/assets/okx-general-asset-eligibility.test.ts`
- Create: `apps/web/lib/assets/general-asset-chain-reader.ts`
- Test: `apps/web/lib/assets/general-asset-chain-reader.test.ts`
- Modify: `apps/web/lib/assets/resolve-mentions.ts`
- Test: `apps/web/lib/assets/resolve-mentions.test.ts`
- Modify: `apps/web/lib/okx/client.ts`
- Test: `apps/web/lib/okx/client.test.ts`
- Modify: `apps/web/lib/env.ts`
- Modify: `packages/solvers/src/general-assets/valuation.ts`
- Test: `packages/solvers/test/general-asset-evidence.test.ts`
- Modify: `apps/web/app/api/assets/resolve/route.ts`
- Test: `apps/web/app/api/assets/resolve/route.test.ts`

**Interfaces:**
- Consumes: authenticated OKX token evidence and exact-in DEX quotes, canonical RPC reads, and the authenticated Anvil replay service for plain-ERC20 behavior replay.
- Produces: `createOkxGeneralAssetEligibilityV2(deps)` with `eligibility(asset): Promise<GeneralAssetEligibilityV2>` and normalized evidence whose USD value is computed server-side.

- [x] **Step 1: Write a failing valuation test** proving a provider/solver-supplied `referenceValueUsdE8` cannot understate `ceil(inputAtomic * priceUsdE8 / 10^decimals)` and that zero or stale price/liquidity fails closed.
- [x] **Step 2: Run RED:** `pnpm --filter @cobia/solvers exec vitest run test/general-asset-evidence.test.ts`; expect the understated fixture to be accepted by the current implementation.
- [x] **Step 3: Change the normalized quote boundary** to carry canonical `priceUsdE8`, asset decimals, provider request/response commitment, and executable liquidity. Recompute `referenceValueUsdE8` internally with round-up arithmetic; never read that value from the caller.
- [x] **Step 4: Run GREEN:** rerun the focused solver test and `pnpm --filter @cobia/solvers typecheck`.
- [x] **Step 5: Write failing eligibility tests** proving exact chain/address identity, proxy/runtime drift, unsupported token behavior, stale OKX evidence, and insufficient liquidity return explicit non-eligible states.
- [x] **Step 6: Run RED:** `pnpm --filter @cobia/web exec vitest run lib/assets/okx-general-asset-eligibility.test.ts app/api/assets/resolve/route.test.ts`; expect the production route to return `verification_pending` because it supplies no verifier.
- [x] **Step 7: Add `/v1/replays/asset-evidence`** to the existing authenticated replay service and `replayAssetEvidenceRemotely()` to the web client. The service owns the disposable pinned Anvil process; Vercel receives only bounded evidence and never an RPC handle.
- [x] **Step 8: Implement `createOkxGeneralAssetEligibilityV2`** and inject it from the production route using canonical RPC configuration, authenticated OKX credentials, and the remote replay client. Cache only complete evidence until its committed expiry.
- [x] **Step 9: Run GREEN:** rerun replay-service and web tests, both typechecks, and focused ESLint.
- [x] **Step 10: Commit:** stage only Task 1 files and commit `feat(assets): verify arbitrary tokens with okx evidence`.

### Task 2: Public GeneralAssetPolicy publication and execution context

**Files:**
- Modify: `apps/web/app/api/intents/compile/route.ts`
- Test: `apps/web/app/api/intents/compile/route.test.ts`
- Modify: `apps/web/app/api/intents/route.ts`
- Test: `apps/web/app/api/intents/route.test.ts`
- Modify: `apps/web/lib/runtime/market.ts`
- Create: `apps/web/lib/runtime/general-asset-publication.ts`
- Test: `apps/web/lib/runtime/general-asset-publication.test.ts`
- Create: `apps/web/lib/intents/compile-general-asset-request.ts`
- Test: `apps/web/lib/intents/compile-general-asset-request.test.ts`
- Modify: `apps/web/lib/db/intents.ts`
- Modify: `apps/web/lib/db/solver-submissions.ts`
- Create: `apps/web/lib/db/general-asset-intents.integration.test.ts`
- Modify: `packages/domain/src/general-asset-policy.ts`
- Modify: `packages/solvers/src/general-assets/program-verifier.ts`
- Create: `apps/web/drizzle/0023_general_asset_intents.sql`

**Interfaces:**
- Consumes: `GeneralAssetPolicyV1Schema`, exact eligible selector results, wallet session owner, and committed identity/valuation hashes from Task 1.
- Produces: `publishGeneralAssetIntent({ policy, ownerSignature })` and a V4 execution context parsed as `GeneralAssetPolicyV1` plus `GeneralAssetProgramV1`.

- [x] **Step 1: Write failing API tests** that compile and publish an exact-address general-asset policy and reject symbol substitution, missing valuation evidence, a changed owner signature, or an unsupported token.
- [x] **Step 2: Run RED:** run the two focused route tests; expect schema rejection because public publication accepts only open-intent and capability-composition policies.
- [x] **Step 3: Extend compilation and publication** with a discriminated general-asset branch. Server code supplies exact assets, evidence hashes, manifest hash, nonce, limits, and timestamps; the model supplies no executable address or hash.
- [x] **Step 4: Write a failing repository integration test** that persists a V4 policy/program/artifact set and reads it back through `getExecutionContext()` without legacy-schema parsing.
- [x] **Step 5: Run RED:** run the focused general-asset persistence integration test; expect legacy snapshot parsing to reject `general-asset`.
- [x] **Step 6: Add the V4 repository/runtime branch** while preserving V3 encodings and list behavior. Public discovery may omit V4 until a safe V4 snapshot projection exists, but direct intent/program APIs must remain complete.
- [x] **Step 7: Run GREEN:** focused API/unit/integration tests, web typecheck, and focused ESLint.
- [x] **Step 8: Commit:** stage only Task 2 files and commit `feat(intents): publish general asset policies`.

### Task 3: Fresh evidence gate before every wallet interaction

**Files:**
- Create: `apps/web/lib/execution-v4/revalidate-stage-evidence.ts`
- Test: `apps/web/lib/execution-v4/revalidate-stage-evidence.test.ts`
- Modify: `apps/web/lib/execution-v4/prepare-review.ts`
- Modify: `apps/web/app/api/programs/[submissionId]/execution/route.ts`
- Modify: `apps/web/app/api/programs/[submissionId]/stages/[stageId]/route.ts`
- Test: corresponding execution and stage route tests

**Interfaces:**
- Consumes: committed identity and valuation evidence, the exact stage, canonical source/destination readers, OKX authority, and current time.
- Produces: `revalidateStageEvidenceV4(input): Promise<{ pinnedBlockNumber; pinnedBlockHash; identityHash; valuationHash }>` or a stable fail-closed error.

- [x] **Step 1: Write failing tests** for token runtime/proxy drift, target runtime drift, OKX price/expiry drift, input above recomputed USD cap, changed chain block hash, and destination-stage revalidation.
- [x] **Step 2: Run RED:** run the focused revalidation and route tests; expect preparation to return the stored artifact without fresh reads.
- [x] **Step 3: Implement the revalidator** using the same evidence primitives as Task 1. Require a canonical pinned block, recompute commitments, and reject any mismatch before returning transaction data.
- [x] **Step 4: Call the gate from initial review and every `arm` action** after predecessor/finality checks but before persisting `broadcasting`. Never silently refresh a signed commitment; drift requires a new policy/program.
- [x] **Step 5: Run GREEN:** focused tests, web typecheck, and focused ESLint.
- [x] **Step 6: Commit:** stage only Task 3 files and commit `fix(execution): revalidate v4 evidence before signing`.

### Task 4: Verified bridge delivery progression

**Files:**
- Create: `apps/web/lib/execution-v4/bridge-delivery-verifier.ts`
- Test: `apps/web/lib/execution-v4/bridge-delivery-verifier.test.ts`
- Modify: `apps/web/lib/execution-v4/live-stage-reconciliation.ts`
- Test: `apps/web/lib/execution-v4/live-stage-reconciliation.test.ts`
- Modify: `apps/web/app/api/programs/[submissionId]/stages/[stageId]/route.ts`
- Test: corresponding stage route test

**Interfaces:**
- Consumes: finalized source receipt, registered adapter delivery semantics, destination-chain canonical logs/balance evidence, exact recipient/token/minimum, and predecessor stage record.
- Produces: `verifyBridgeDeliveryV4(input): Promise<BridgeDeliveryProofV4>` accepted by `recordBridgeDelivery()` only after exact destination delivery.

- [x] **Step 1: Write failing tests** for missing delivery, wrong recipient/token/chain/amount/message, duplicate delivery, source reorg, destination reorg, and one exact valid delivery.
- [x] **Step 2: Run RED:** run the focused bridge and reconciliation tests; expect a finalized bridge stage never to enter `delivered`.
- [x] **Step 3: Implement registered delivery verification** from canonical chain evidence. Provider status is advisory only; exact logs and balance changes must satisfy the committed delivery rule.
- [x] **Step 4: Extend live reconciliation** so polling a finalized bridge source verifies delivery and calls `recordBridgeDelivery()` idempotently; only `delivered` unlocks the destination stage.
- [x] **Step 5: Run GREEN:** focused tests plus the general-asset PostgreSQL integration suite.
- [x] **Step 6: Commit:** stage only Task 4 files and commit `feat(execution): verify v4 bridge delivery`.

### Task 5: Partitioned V3/V4 migration exposure

**Files:**
- Create: `apps/web/lib/deployment/v4-migration-budget.ts`
- Test: `apps/web/lib/deployment/v4-migration-budget.test.ts`
- Modify: `apps/web/lib/deployment/agent-executor-v4-plan.ts`
- Modify: `apps/web/lib/deployment/mainnet-v4-state-verifier.ts`
- Test: corresponding deployment tests
- Modify: `docs/deployments/general-asset-v4-runbook.md`

**Interfaces:**
- Consumes: chain-specific remaining V3 stablecoin caps valued at USD-E8, proposed V4 rolling cap, and the fixed `$50,000` combined protocol budget.
- Produces: `assertPartitionedMigrationBudgetV4(input)` and deployment/read-back evidence that `remainingV3UsdE8 + v4ProtocolCapUsdE8 <= 5_000_000_000_000n`.

- [ ] **Step 1: Write failing tests** proving a V4 open plan is rejected when maximum remaining V3 consumption plus V4 exposure exceeds `$50,000`, including two independently capped V3 stablecoins.
- [ ] **Step 2: Run RED:** run focused deployment tests; expect the current plan to ignore V3 exposure.
- [ ] **Step 3: Implement exact partition arithmetic** with no price lookup: only migration assets explicitly fixed at `$1.00` in the reviewed state spec may contribute V3 atomic remaining caps. Reject any other V3 asset or decimals mismatch.
- [ ] **Step 4: Require the partition in open-mode planning and read-back.** Cap reductions remain separate immediate Safe actions; V4 cap increases and public access retain their delays.
- [ ] **Step 5: Run GREEN:** focused deployment tests, web typecheck, and both signer-free chain planners using reviewed fixture inputs.
- [ ] **Step 6: Update the runbook** with the exact cap partition, V3-continuity rule, two governance windows, rollback, and explicit prohibition on pausing V3 during judging.
- [ ] **Step 7: Commit:** stage only Task 5 files and commit `feat(deployment): partition v3 and v4 migration risk`.

### Task 6: Adversarial release gate and dark-deployment artifacts

**Files:**
- Modify: `docs/evidence/general-asset-v4-readiness.md`
- Modify only confirmed defects in Tasks 1-5 files

**Interfaces:**
- Consumes: completed Tasks 1-5, canonical Ethereum/X Layer RPCs, reviewed production adapter manifests, exact Safe/verifier/registry identities, and deterministic contract artifacts.
- Produces: a readiness record plus unsigned per-chain deployment, canary proposal, and later public-opening transactions; it does not broadcast or sign.

- [ ] **Step 1: Run focused malicious-token, valuation-forgery, publication, freshness, bridge, migration-budget, contract invariant, API, and PostgreSQL suites under Node.js 24.18.0 or newer.**
- [ ] **Step 2: Run complete local gates:** `pnpm test && pnpm typecheck && pnpm lint && pnpm build`, `pnpm contracts:test`, `pnpm --filter @cobia/web test:integration`, and `git diff --check`.
- [ ] **Step 3: Run canonical pinned Ethereum and X Layer fork suites** with explicit RPC configuration; a missing RPC is a release blocker rather than a skipped production claim.
- [ ] **Step 4: Freeze reviewed production adapter manifests** by exact chain, target, selector, runtime code hash, approval spender, and provider family. Reject the shape-only example file.
- [ ] **Step 5: Generate and independently inspect signer-free plans** for both chains, then update readiness evidence with artifact hashes, predicted addresses, caps, Safe inputs, exact test counts, and remaining external stop points.
- [ ] **Step 6: Commit:** stage only Task 6 evidence/fixes and commit `test: close general asset v4 release blockers`.
- [ ] **Step 7: Stop for action-time approval** before any deploy transaction, Safe proposal, V4 activation, canary principal transaction, public opening, or V3 cap reduction.
