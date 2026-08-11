# Fork Rehearsal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a buyer-authenticated, inspectable execution of an exact purchased V2 route on a disposable X Layer mainnet fork, and default new retail intents to 100% deployed capital.

**Architecture:** A server-only rehearsal service validates the purchased artifact, starts pinned Anvil state at the snapshot block, funds only the impersonated fork owner, and invokes the existing execution engine. A small repository persists proof replay protection and the trace binding; the purchased-route client renders the trace without ever requesting a wallet transaction.

**Tech Stack:** Next.js 16 route handlers, React 19, TypeScript 6, viem 2, Drizzle/PostgreSQL 16, Testcontainers/Anvil, Vitest/Testing Library.

## Global Constraints
- Payment remains chain 1952; rehearsal and route semantics remain chain 196.
- Rehearsal never calls the injected wallet or public-chain write methods.
- Only V2 purchased artifacts are eligible.
- Every response uses `Cache-Control: no-store` and safe error codes.
- A fork pass is historical execution evidence, not current-state simulation.
- No fake APY, protocol fallback, arbitrary calldata, or unverified deployment.
- Keep every handwritten source/test file at or below 300 LOC.
- Use strict RED-GREEN TDD for every behavior change.

---
### Task 1: Make Retail Exposure Explicit

**Files:**
- Modify: `apps/web/components/request/PolicyForm.tsx`
- Modify: `apps/web/components/request/PolicyForm.test.tsx`
- Modify: `apps/web/components/routes/PurchasedRouteView.tsx`
- Modify: `apps/web/components/routes/PurchasedRouteView.v2.test.tsx`

**Interfaces:**
- Consumes: existing `buildRoutePolicyV2` exact `protocolExposureBps` field.
- Produces: new intents serialize `protocolExposureBps: 10_000` by default; route UI labels retained capital as a user-selected risk buffer.

- [ ] **Step 1: Write the failing retail-default test**

```tsx
renderForm();
await fillRequiredFields();
expect(screen.getByText("10.00 USDG exact")).toBeVisible();
fireEvent.click(screen.getByRole("button", { name: "Open solver market" }));
await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
expect(JSON.parse(String(fetchMock.mock.calls[0]![1].body)).policy)
  .toMatchObject({ principalAtomic: "10000000", protocolExposureBps: 10_000 });
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter @cobia/web exec vitest run components/request/PolicyForm.test.tsx`

Expected: FAIL because the form still serializes `4_000` and displays `4.00 USDG exact`.

- [ ] **Step 3: Implement the minimal default and copy**

```tsx
const [exposure, setExposure] = useState("100");
```

In the V2 purchased-route explanation, render retained capital as “Risk buffer selected in the signed intent” only when `retainedAtomic !== "0"`.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `pnpm --filter @cobia/web exec vitest run components/request/PolicyForm.test.tsx components/routes/PurchasedRouteView.v2.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/request/PolicyForm.tsx apps/web/components/request/PolicyForm.test.tsx apps/web/components/routes/PurchasedRouteView.tsx apps/web/components/routes/PurchasedRouteView.v2.test.tsx
git commit -m "feat(intents): default retail routes to full exposure"
```

### Task 2: Add Rehearsal Proof and Durable Binding

**Files:**
- Create: `apps/web/lib/execution-v2/rehearsal-proof.ts`
- Create: `apps/web/lib/execution-v2/rehearsal-proof.test.ts`
- Create: `apps/web/lib/db/rehearsals.ts`
- Create: `apps/web/lib/db/rehearsals.integration.test.ts`
- Modify: `apps/web/lib/db/schema.ts`
- Create: `apps/web/drizzle/0006_execution_rehearsal.sql`
- Modify: `apps/web/drizzle/meta/_journal.json`
- Create: `apps/web/drizzle/meta/0006_snapshot.json`

**Interfaces:**
- Produces: `ExecutionRehearsalProof`, `executionRehearsalCommitment(proof)`, `verifyExecutionRehearsalProof(proof, signature, nowSec)`, and `createRehearsalRepository(db)`.
- Repository methods: `begin(input)`, `complete(id, trace)`, `fail(id, code)`, and `findPassed(routeId, bundleHash)`.

- [ ] **Step 1: Write proof mutation tests**

```ts
const proof = ExecutionRehearsalProofSchema.parse({
  domain: "cobia.execution.rehearsal.v1", realm: "localhost:3000",
  routeId, bundleHash: routeId, buyer: owner, executionChainId: 196,
  nonce: `0x${"11".repeat(32)}`, expiresAt: nowSec + 240,
});
await expect(verifyExecutionRehearsalProof(proof, signature, nowSec))
  .resolves.toEqual(proof);
await expect(verifyExecutionRehearsalProof({ ...proof, routeId: otherHash }, signature, nowSec))
  .rejects.toThrow("signature");
await expect(verifyExecutionRehearsalProof(proof, signature, proof.expiresAt))
  .rejects.toThrow("expired");
```

- [ ] **Step 2: Run proof test and verify RED**

Run: `pnpm --filter @cobia/web exec vitest run lib/execution-v2/rehearsal-proof.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement canonical proof verification**

Use strict Zod fields, lowercase address normalization, raw commitment signing, `isAddressEqual`, a maximum 300-second window, and `nowSec < expiresAt`.

- [ ] **Step 4: Write disposable-Postgres state tests**

Assert identical `begin` retries return one `running` row; reused nonce/proof hash on another route conflicts; `complete` stores exact registry/block/engine/trace hashes; changed completion conflicts; `failed` cannot overwrite `passed`.

- [ ] **Step 5: Run integration test and verify RED**

Run: `pnpm --filter @cobia/web exec vitest run lib/db/rehearsals.integration.test.ts --config vitest.integration.config.mts`

Expected: FAIL because the table and repository do not exist.

- [ ] **Step 6: Add migration, schema, and repository**

Create `cobia_execution_rehearsals` with states `running | passed | failed`, unique proof hash and nonce, route purchase FK, bundle/registry/snapshot block hashes, engine version, trace hash/JSON, safe failure code, and timestamps. Add a CHECK requiring trace fields only for `passed` and failure code only for `failed`.

- [ ] **Step 7: Run proof/integration/schema gates**

Run:

```bash
pnpm --filter @cobia/web exec vitest run lib/execution-v2/rehearsal-proof.test.ts
pnpm --filter @cobia/web exec vitest run lib/db/rehearsals.integration.test.ts --config vitest.integration.config.mts
DATABASE_URL=postgresql://cobia:cobia@127.0.0.1:5432/cobia pnpm --filter @cobia/web exec drizzle-kit check
```

Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/execution-v2/rehearsal-proof* apps/web/lib/db/rehearsals* apps/web/lib/db/schema.ts apps/web/drizzle
git commit -m "feat(execution): persist fork rehearsal proofs"
```

### Task 3: Extract a Disposable Anvil Rehearsal Service

**Files:**
- Create: `apps/web/lib/execution-v2/anvil-rehearsal.ts`
- Create: `apps/web/lib/execution-v2/rehearsal-trace.ts`
- Create: `apps/web/lib/execution-v2/anvil-rehearsal.test.ts`
- Create: `apps/web/lib/execution-v2/purchased-route.fork.test.ts`
- Modify: `apps/web/lib/execution-v2/execution-mainnet.fork.test.ts`
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: validated `PurchasedRouteArtifact`, `registryHash`, `executeRoutePlanV2`.
- Produces: `runPurchasedRouteRehearsal(artifact): Promise<ExecutionRehearsalTrace>` where all bigint fields are canonical decimal strings.

- [ ] **Step 1: Write runner lifecycle and integrity tests**

Test exact snapshot-block startup, block-hash mismatch rejection, exact principal funding, V2-only rejection, safe timeout, and `container.stop()` on pass/failure.

- [ ] **Step 2: Run test and verify RED**

Run: `pnpm --filter @cobia/web exec vitest run lib/execution-v2/anvil-rehearsal.test.ts`

Expected: FAIL because the runner does not exist.

- [ ] **Step 3: Implement the injected runtime boundary**

```ts
export interface RehearsalRuntime {
  start(input: { blockNumber: bigint }): Promise<{
    rpcUrl: string;
    stop(): Promise<void>;
  }>;
}

export async function runPurchasedRouteRehearsal(
  artifact: PurchasedRouteArtifact,
  runtime: RehearsalRuntime = testcontainersRehearsalRuntime,
): Promise<ExecutionRehearsalTrace> { /* validate, fund fork, execute, finally stop */ }
```

Move `testcontainers` from devDependencies to dependencies because the Node route imports it at runtime. Keep the image digest already pinned by the fork test.

- [ ] **Step 4: Refactor the existing fork acceptance test onto the service**

The test must still prove approve → swap → approve → Aave supply with receipt/event/state attribution, then add a direct-Aave purchased-route case.

- [ ] **Step 5: Run fork and unit suites**

Run:

```bash
pnpm --filter @cobia/web exec vitest run lib/execution-v2/anvil-rehearsal.test.ts
pnpm --filter @cobia/web test:fork
```

Expected: unit tests and both fork routes PASS; no Testcontainers resources remain.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/execution-v2 apps/web/package.json pnpm-lock.yaml
git commit -m "feat(execution): run purchased routes on a pinned fork"
```

### Task 4: Expose Rehearsal in the Purchased Route UI

**Files:**
- Create: `apps/web/app/api/routes/[routeId]/execution/rehearsal/route.ts`
- Create: `apps/web/app/api/routes/[routeId]/execution/rehearsal/route.test.ts`
- Create: `apps/web/components/routes/PurchasedRouteExecution.tsx`
- Create: `apps/web/components/routes/PurchasedRouteExecution.test.tsx`
- Modify: `apps/web/components/routes/PurchasedRouteView.tsx`
- Modify: `apps/web/components/routes/PurchasedRouteView.module.css`
- Modify: `apps/web/components/routes/purchased-route.ts`
- Modify: `apps/web/app/api/routes/[routeId]/route.ts`
- Modify: `apps/web/lib/runtime/market.ts`

**Interfaces:**
- Endpoint input: strict `{ proof, signature }`; endpoint output: `{ rehearsalId, state, trace? , failure? }`.
- UI prop: `{ route: PurchasedRouteV2 }`; it signs the rehearsal commitment through `useWallet` and never calls `eth_sendTransaction`.

- [ ] **Step 1: Write route RED tests**

Cover malformed route/proof, wrong signer, wrong buyer, expired proof, replayed nonce, V1 artifact, runner failure, exact retry, and successful no-store trace. Assert runner/repository are untouched for every auth rejection.

- [ ] **Step 2: Run route test and verify RED**

Run: `pnpm --filter @cobia/web exec vitest run 'app/api/routes/[routeId]/execution/rehearsal/route.test.ts'`

Expected: FAIL because the endpoint does not exist.

- [ ] **Step 3: Implement endpoint orchestration**

Load and integrity-check the purchased artifact, atomically begin the rehearsal, run the service, store a passed/failed result, and return only the allowlisted DTO. Include an existing passed rehearsal in the authenticated purchased-route GET so refresh does not rerun Anvil. Map Docker absence to `REHEARSAL_UNAVAILABLE` and protocol failures to `REHEARSAL_REJECTED`.

- [ ] **Step 4: Write component RED tests**

Assert V1 has no execution control; V2 shows `Rehearse on fork`; disconnected/wrong buyer blocks; click requests only `personal_sign`; passed trace lists ordered steps and states “No wallet funds were used”; failure never reveals a mainnet button.

- [ ] **Step 5: Implement the execution ledger panel**

Use a plain vertical ledger with stage, network, exact actions, hashes, blocks, gas estimates, evidence, and one primary action. Do not add dashboard cards or promotional copy.

- [ ] **Step 6: Run focused UI/API tests**

Run: `pnpm --filter @cobia/web exec vitest run 'app/api/routes/[routeId]/execution/rehearsal/route.test.ts' components/routes/PurchasedRouteExecution.test.tsx components/routes/PurchasedRouteView.v2.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add 'apps/web/app/api/routes/[routeId]/execution/rehearsal' apps/web/components/routes apps/web/lib/runtime/market.ts
git commit -m "feat(routes): add purchased-route fork rehearsal"
```

### Task 5: Verify and Document the Rehearsal Boundary

**Files:**
- Modify: `README.md`
- Modify: `apps/web/README.md`
- Modify: `docs/architecture/protocol-integrations.md`

- [ ] **Step 1: Run the full release matrix**

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

Expected: all exit 0; default unit discovery excludes integration/fork suites.

- [ ] **Step 2: Perform browser verification**

Unlock a purchased V2 route, run rehearsal, verify ordered transaction evidence, refresh, and verify the passed trace reloads without a second wallet signature or container run. Confirm no `eth_sendTransaction` request occurred.

- [ ] **Step 3: Update truth documentation**

State: product-visible historical fork rehearsal is implemented; wallet/mainnet execution remains disabled until the second plan; payment testnet and execution mainnet remain separate.

- [ ] **Step 4: Commit**

```bash
git add README.md apps/web/README.md docs/architecture/protocol-integrations.md
git commit -m "docs: document product fork rehearsal"
```
