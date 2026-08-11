# Guided Mainnet Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a buyer submit a fresh, rehearsed purchased V2 route as durable, guided wallet transactions on X Layer mainnet without duplicate principal movement after reloads.

**Architecture:** The server persists an execution attempt and one exact prepared transaction at a time; the browser independently reconstructs and compares that transaction before asking the injected wallet to send it. Submitted hashes, canonical receipts, protocol evidence, and state postconditions advance a locked repository state machine; an unresolved broadcast enters reconciliation instead of being resent.

**Tech Stack:** Next.js 16, React 19, TypeScript 6, viem 2/EIP-1193, Drizzle/PostgreSQL 16, existing execution-v2 engine, Vitest/Testcontainers.

## Global Constraints

- Real principal execution is chain 196 only; payment remains chain 1952.
- Mainnet actions require a matching passed rehearsal and an unexpired V2 bundle.
- The buyer confirms each approval/swap/supply separately.
- The server never signs or relays wallet transactions.
- The browser rejects any server transaction that differs from its locally rebuilt transaction.
- No unresolved principal-moving step may be sent twice.
- No raw provider/database errors, arbitrary calldata, auto-sequencing, or APY guarantee.
- Keep every handwritten source/test file at or below 300 LOC.
- Follow strict RED-GREEN TDD and commit after each independently green task.

---

### Task 1: Persist Attempts and Ordered Steps

**Files:**
- Modify: `apps/web/lib/db/schema.ts`
- Create: `apps/web/drizzle/0007_execution_attempts.sql`
- Modify: `apps/web/drizzle/meta/_journal.json`
- Create: `apps/web/drizzle/meta/0007_snapshot.json`
- Create: `apps/web/lib/db/execution-records.ts`
- Create: `apps/web/lib/db/executions.ts`
- Create: `apps/web/lib/db/executions.integration.test.ts`

**Interfaces:**
- Produces `createExecutionRepository(db)` with `begin`, `prepareStep`, `bindSubmittedHash`, `confirmStep`, `failStep`, `markReconcile`, `getAttempt`, and `findRecoverable`.
- All bigint fields cross persistence as canonical decimal strings.

- [ ] **Step 1: Write disposable-Postgres RED tests**

```ts
const attempt = await repository.begin(validBeginInput);
expect(attempt).toMatchObject({ state: "prepared", chainId: 196, nextOrdinal: 0 });
await expect(repository.begin(validBeginInput)).resolves.toEqual(attempt);
await expect(repository.begin({ ...validBeginInput, buyer: otherOwner }))
  .rejects.toThrow("conflicts");
```

Also test one live attempt per route/bundle/owner, ordered ordinals, exact prepare retry, conflicting calldata hash, submitted-hash uniqueness, legal transitions, concurrent confirm, activity rollback, and no prepare-next while submitted/reconcile.

- [ ] **Step 2: Run integration test and verify RED**

Run: `pnpm --filter @cobia/web exec vitest run lib/db/executions.integration.test.ts --config vitest.integration.config.mts`

Expected: FAIL because the migration/repository do not exist.

- [ ] **Step 3: Add schema and database checks**

Create `cobia_execution_attempts` with `prepared | active | partial | reconcile | failed | complete`, route purchase/rehearsal FKs, owner, bundle hash, chain 196, proof nonce/hash, and timestamps. Create `cobia_execution_steps` with ordered unique `(attempt_id, ordinal)`, `prepared | submitted | confirmed | reconcile | failed`, exact from/to/value/calldata hash, semantic amount JSON, pre-block/hash, expected nonce, gas estimate, nullable transaction/receipt/evidence/postcondition, and safe failure code.

- [ ] **Step 4: Implement locked transitions**

Every mutator starts a transaction, selects attempt and current step `FOR UPDATE`, exact-compares idempotent retries, writes its activity event in the same transaction, and rejects state skipping. Normalize hashes/addresses before unique comparisons.

- [ ] **Step 5: Run integration/schema gates and verify GREEN**

```bash
pnpm --filter @cobia/web exec vitest run lib/db/executions.integration.test.ts --config vitest.integration.config.mts
DATABASE_URL=postgresql://cobia:cobia@127.0.0.1:5432/cobia pnpm --filter @cobia/web exec drizzle-kit check
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/db apps/web/drizzle
git commit -m "feat(execution): persist guided route attempts"
```

### Task 2: Create Action-Scoped Mainnet Authorization

**Files:**
- Create: `apps/web/lib/execution-v2/mainnet-proof.ts`
- Create: `apps/web/lib/execution-v2/mainnet-proof.test.ts`
- Create: `apps/web/lib/execution-v2/attempt-token.ts`
- Create: `apps/web/lib/execution-v2/attempt-token.test.ts`
- Modify: `apps/web/lib/env.ts`
- Modify: `.env.example`
- Modify: `apps/web/scripts/seed-dev-env.mjs`

**Interfaces:**
- `ExecutionMainnetProofSchema`, `executionMainnetCommitment(proof)`, and `verifyExecutionMainnetProof(proof, signature, nowSec)`.
- `issueAttemptToken({ attemptId, buyer, expiresAt }, secret)` and `verifyAttemptToken(token, expected, secret)` produce/consume an HMAC-bound opaque credential.

- [ ] **Step 1: Write proof/token mutation tests**

Use domain `cobia.execution.mainnet.v1`; bind realm, route ID, bundle hash, buyer, chain 196, rehearsal trace hash, nonce, and expiry. Mutate each field, signer, signature, expiry boundary, token attempt/buyer/expiry, and HMAC; each mutation must reject.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm --filter @cobia/web exec vitest run lib/execution-v2/mainnet-proof.test.ts lib/execution-v2/attempt-token.test.ts`

Expected: FAIL because both modules are absent.

- [ ] **Step 3: Implement strict proof and token primitives**

Use raw commitment recovery, lowercase normalized addresses, a maximum 300-second proof window, Web Crypto HMAC-SHA256, constant-time hash comparison, and a dedicated `EXECUTION_SESSION_SECRET` generated by `env:dev`. The token authorizes attempt metadata only.

- [ ] **Step 4: Run focused tests and verify GREEN**

- [ ] **Step 5: Commit**

```bash
git add .env.example apps/web/lib/env.ts apps/web/scripts/seed-dev-env.mjs apps/web/lib/execution-v2/{mainnet-proof,attempt-token}*
git commit -m "feat(execution): bind mainnet execution sessions"
```

### Task 3: Refactor the Engine into One-Step Guided Operations

**Files:**
- Create: `apps/web/lib/execution-v2/guided-session.ts`
- Create: `apps/web/lib/execution-v2/guided-session.test.ts`
- Create: `apps/web/lib/execution-v2/guided-step.ts`
- Create: `apps/web/lib/execution-v2/guided-step.test.ts`
- Modify: `apps/web/lib/execution-v2/execute-batch.ts`
- Modify: `apps/web/lib/execution-v2/execute-route.ts`
- Modify: `apps/web/lib/execution-v2/engine-types.ts`
- Modify: `apps/web/lib/execution-v2/viem-client.ts`

**Interfaces:**
- `prepareNextGuidedStep(input, confirmed)` returns `{ kind: "prepared", transaction, capturedState, preBlock }` or `{ kind: "complete" }`.
- `submitGuidedStep(input, prepared): Promise<SubmittedOwnerTransactionV2>` sends exactly one matched transaction.
- `resolveGuidedStep(input, submitted)` returns `{ kind: "confirmed", transaction }`, `{ kind: "pending", submitted }`, or `{ kind: "failed", submitted, failure }`.
- `recoverGuidedSubmission(input, prepared): Promise<Hash | undefined>` scans from pre-block and accepts exact owner/nonce/from/to/value/input only.

- [ ] **Step 1: Write one-step and mutation RED tests**

Assert direct routes yield approval then supply; swap routes yield input approval, swap, output approval, supply; each call submits at most one transaction. Mutate bundle, target, data, value, amount, pre-block, deployment, owner, chain, nonce, deadline, and prior receipt evidence; assert zero sends.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm --filter @cobia/web exec vitest run lib/execution-v2/guided-session.test.ts lib/execution-v2/guided-step.test.ts`

Expected: FAIL because guided modules do not exist.

- [ ] **Step 3: Extract single-step primitives from the batch engine**

Reuse transaction builders, deployment pins, state capture, receipt attribution, event validation, and postconditions. Do not duplicate selectors or ABIs. Add `nonce` to `ExecutionTransactionV2` and viem mapping so recovery can exact-match it.

- [ ] **Step 4: Add recovery tests**

Cover hash-known resume, hash-missing exact nonce match, same nonce wrong calldata, multiple matches, reorg, pending, reverted, and already-confirmed state. Wrong or ambiguous matches return reconcile, never a sendable step.

- [ ] **Step 5: Run all execution tests and verify GREEN**

Run: `pnpm --filter @cobia/web exec vitest run lib/execution-v2`

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/execution-v2
git commit -m "refactor(execution): expose verified guided steps"
```

### Task 4: Add Mainnet Attempt and Step APIs

**Files:**
- Create: `apps/web/app/api/routes/[routeId]/executions/route.ts`
- Create: `apps/web/app/api/routes/[routeId]/executions/route.test.ts`
- Create: `apps/web/app/api/routes/[routeId]/executions/[attemptId]/route.ts`
- Create: `apps/web/app/api/routes/[routeId]/executions/[attemptId]/route.test.ts`
- Create: `apps/web/lib/execution-v2/execution-service.ts`
- Create: `apps/web/lib/execution-v2/execution-service.test.ts`
- Create: `apps/web/lib/runtime/solver-registry.ts`
- Create: `apps/web/lib/runtime/solver-registry.test.ts`
- Modify: `apps/web/lib/runtime/market.ts`

**Interfaces:**
- Start `POST`: `{ proof, signature }` → `{ attempt, token, preparedStep }`.
- Poll `GET`: bearer attempt token → allowlisted attempt/step state.
- Advance `POST`: `{ action: "submitted", hash } | { action: "resolve" }` → updated state and optional next prepared step.

- [ ] **Step 1: Write service/route RED tests**

Cover wrong route/buyer/chain, no matching rehearsal, changed trace hash, expired bundle, insufficient token/OKB, registry mismatch, proof replay, prepared retry, wallet hash mismatch, pending receipt, confirmed next step, partial failure, and safe errors. Assert no DB state for auth/preflight failures.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm --filter @cobia/web exec vitest run lib/execution-v2/execution-service.test.ts 'app/api/routes/[routeId]/executions/route.test.ts' 'app/api/routes/[routeId]/executions/[attemptId]/route.test.ts'`

- [ ] **Step 3: Implement orchestration**

Revalidate the purchased artifact and solver against `trustedRouteSolverAddress(solverId)`, create a fresh branded verdict, require passed rehearsal binding, read current chain state, prepare the exact next step, persist it, and issue the scoped token. A fresh valid owner proof returns a new token for the same recoverable attempt after reload. Resolve endpoints use the stored transaction and engine evidence; they never accept caller calldata.

- [ ] **Step 4: Run focused and integration tests**

Run:

```bash
pnpm --filter @cobia/web exec vitest run lib/execution-v2/execution-service.test.ts 'app/api/routes/[routeId]/executions/route.test.ts' 'app/api/routes/[routeId]/executions/[attemptId]/route.test.ts'
pnpm --filter @cobia/web exec vitest run lib/db/executions.integration.test.ts --config vitest.integration.config.mts
```

- [ ] **Step 5: Commit**

```bash
git add 'apps/web/app/api/routes/[routeId]/executions' apps/web/lib/execution-v2/execution-service* apps/web/lib/runtime/{market,solver-registry}*
git commit -m "feat(api): orchestrate guided mainnet execution"
```

### Task 5: Build the Guided Wallet Ledger

**Files:**
- Create: `apps/web/components/routes/MainnetExecutionLedger.tsx`
- Create: `apps/web/components/routes/MainnetExecutionLedger.test.tsx`
- Create: `apps/web/lib/execution-v2/client-transaction.ts`
- Create: `apps/web/lib/execution-v2/client-transaction.test.ts`
- Modify: `apps/web/components/routes/PurchasedRouteExecution.tsx`
- Modify: `apps/web/components/routes/PurchasedRouteView.module.css`

**Interfaces:**
- `assertClientTransactionMatches(prepared, locallyBuilt): OwnerTransactionV2` exact-compares chain/from/to/value/data.
- The ledger creates an execution proof, starts/loads the attempt, locally rebuilds the current step, sends one EIP-1193 transaction, durably binds the returned hash, then polls resolution.

- [ ] **Step 1: Write client boundary RED tests**

Test no mainnet action before rehearsal; expired/wrong-owner/wrong-chain/low-balance blockers; exact transaction display; one send per click; wallet rejection remains prepared; hash persistence precedes polling; refresh resumes submitted/reconcile; complete state links every X Layer explorer hash.

- [ ] **Step 2: Run component tests and verify RED**

Run: `pnpm --filter @cobia/web exec vitest run components/routes/MainnetExecutionLedger.test.tsx lib/execution-v2/client-transaction.test.ts`

- [ ] **Step 3: Implement the restrained ledger**

Render `Fork passed → Mainnet preflight → current guided step → verified position`. Use explicit “Switch to X Layer,” “Confirm exact approval,” “Confirm swap,” and “Confirm Aave supply” labels. Never initiate the next prompt automatically.

- [ ] **Step 4: Run route UI tests and verify GREEN**

Run: `pnpm --filter @cobia/web exec vitest run components/routes lib/execution-v2/client-transaction.test.ts`

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/routes apps/web/lib/execution-v2/client-transaction*
git commit -m "feat(routes): guide mainnet route execution"
```

### Task 6: Release Verification and Capped Manual Canary

**Files:**
- Modify: `README.md`
- Modify: `apps/web/README.md`
- Modify: `docs/architecture/protocol-integrations.md`

- [ ] **Step 1: Run automated gates**

```bash
pnpm test
pnpm --filter @cobia/web test:integration
pnpm --filter @cobia/web test:fork
pnpm typecheck
pnpm lint
pnpm build
pnpm audit --prod --audit-level high
git diff --check
```

- [ ] **Step 2: Run browser E2E with a scripted wallet**

Verify rehearsal binding, chain switch, separate prompts, rejection recovery, refresh recovery, explorer links, and final position evidence. Assert no prompt occurs for any failed preflight.

- [ ] **Step 3: Stop for explicit live-funds authorization**

Report exact registered asset, entered principal cap, expected steps, wallet, chain 196, current balances, and estimated OKB gas. Do not send a public-chain transaction until the user separately approves that exact canary.

- [ ] **Step 4: After approval, run the capped canary**

Use a newly created 10-unit, 100%-exposure route while fresh. Record submitted hashes, canonical receipts, protocol evidence, position delta, and activity persistence; stop on the first mismatch.

- [ ] **Step 5: Update truth docs and commit**

Document guided chain-196 execution narrowly for Aave direct and Uniswap→Aave V2 routes; retain non-atomic prompt/deadline and supported-asset limitations.

```bash
git add README.md apps/web/README.md docs/architecture/protocol-integrations.md
git commit -m "docs: document guided X Layer execution"
```
