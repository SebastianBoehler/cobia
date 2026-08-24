# V3 Native Open Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make native OKB and ERC-20 X Layer pairs reach deterministic verified V3 transaction programs instead of timing out in unsupported-route research, then restore authenticated production routing.

**Architecture:** Extend the existing OKX transaction artifact, stage builder, verifier and fork replay to treat native input as exact call value with no approval while retaining bounded ERC-20 approvals. Route every single-pair X Layer conversion through that builder before agentic research; operational errors produce precise abstentions and never claim that no route exists.

**Tech Stack:** TypeScript 6, Zod 4, viem 2, Vitest 4, pnpm 11, Node 24, Docker Compose, Hetzner.

**Spec:** `docs/superpowers/specs/2026-08-24-open-verifier-authoritative-solver-design.md`

## Global Constraints

- Plugins accelerate construction but never decide admissibility.
- Native OKB uses the canonical `0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee` identity.
- Native input has exact transaction value and no ERC-20 approval.
- ERC-20 input retains an exact bounded approval and zero transaction value.
- The verifier independently binds quote, response, calldata, owner, value, approval, output floor and replay.
- No credentials enter Git, tests, logs or final output.
- No automated test signs or broadcasts a wallet transaction.
- Modified production files remain below the repository's 300-line soft limit.

---

### Task 1: Native-aware OKX artifact and stage

**Files:**
- Modify: `packages/solvers/src/okx/wire.ts`
- Modify: `examples/open-solver/src/okx-route.ts`
- Test: `examples/open-solver/test/okx-route.test.ts`

**Interfaces:**
- Consumes: `isNativeAssetAddress(address)` from `@cobia/domain`.
- Produces: `buildOkxRouteStage(...)` returning a wallet stage whose `approval` is absent and whose `transaction.valueAtomic` equals `inputAtomic` for native input.

- [ ] **Step 1: Write the failing native-input stage test**

Add a native OKB-to-USDG artifact with `tx.value: "100"`, then assert:

```ts
expect(buildOkxRouteStage({ artifact: nativeArtifact, owner,
  inputToken: NATIVE_ASSET_ADDRESS, outputToken: inputToken,
  inputAtomic: "100", minimumOutputAtomic: "2" }).stage).toMatchObject({
  input: { token: NATIVE_ASSET_ADDRESS, atomic: "100" },
  transaction: { valueAtomic: "100" },
});
expect("approval" in nativeStage).toBe(false);
```

The mutation caught is the current native-input rejection and hardcoded zero value.

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
pnpm --filter @cobia/example-open-solver test -- test/okx-route.test.ts
```

Expected: FAIL with `OKX route builder currently requires ERC-20 input`.

- [ ] **Step 3: Implement native artifact semantics**

Keep `approveTransaction: false` in `OkxSwapRequestV1`. In `buildOkxRouteStage`, derive:

```ts
const nativeInput = isNativeAssetAddress(inputToken);
const expectedValue = nativeInput ? raw.inputAtomic : "0";
if (tx.value !== expectedValue) throw new Error("OKX swap value mismatch");
```

Build the common stage with `transaction.valueAtomic: expectedValue` and spread
the approval only for ERC-20 input:

```ts
...(nativeInput ? {} : { approval: { token: inputToken,
  spender: XLAYER_OKX_MANIFEST_V1.approval.address,
  maximumAtomic: raw.inputAtomic } })
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the command from Step 2. Expected: all `okx-route` tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/solvers/src/okx/wire.ts examples/open-solver/src/okx-route.ts \
  examples/open-solver/test/okx-route.test.ts
git commit -m "feat(solver): compile native OKB swap artifacts"
```

### Task 2: Native-aware OKX authorization and verification

**Files:**
- Modify: `packages/solvers/src/okx/verifier.ts`
- Test: `packages/solvers/test/okx-swap-verifier.test.ts`
- Test: `apps/web/lib/open-exchange/transaction-verifier-okx.test.ts`

**Interfaces:**
- Consumes: native-aware `OkxSwapArtifactV1` and `TransactionStageV1`.
- Produces: `authorizeOkxSwapStageV1` calls containing only the exact swap with native value for native input, or bounded approval/reset plus swap for ERC-20 input.

- [ ] **Step 1: Write failing authorization tests**

Add a native stage/artifact fixture and assert:

```ts
expect(authorizeOkxSwapStageV1({ stage: nativeStage, artifact: nativeArtifact,
  manifest: XLAYER_OKX_MANIFEST_V1, nowSec: 101,
  currentAllowanceAtomic: "0" })).toEqual({ accepted: true,
  calls: [{ to: router, data: attributedData, value: "0x64" }] });
```

Also mutate `tx.value` and an unexpected native approval; each must yield
`OKX_VALUE_MISMATCH` or `OKX_APPROVAL_MISMATCH`.

- [ ] **Step 2: Run verifier tests and verify RED**

```bash
pnpm --filter @cobia/solvers test -- test/okx-swap-verifier.test.ts
```

Expected: native fixture is rejected because the verifier requires approval and zero value.

- [ ] **Step 3: Implement conditional authorization**

Derive `nativeInput`. Require `tx.value === stage.input.atomic`, absent approval,
and ignore allowance only for native input. Emit:

```ts
[{ to: tx.to, data: finalData, value: toHex(BigInt(tx.value)) }]
```

Retain the existing approval/reset/swap sequence unchanged for ERC-20 input.
Skip approval-spender code checks only when the accepted stage has no approval.

- [ ] **Step 4: Run solver and web verifier tests**

```bash
pnpm --filter @cobia/solvers test -- test/okx-swap-verifier.test.ts
pnpm --filter @cobia/web test -- lib/open-exchange/transaction-verifier-okx.test.ts
```

Expected: both files pass.

- [ ] **Step 5: Commit**

```bash
git add packages/solvers/src/okx/verifier.ts packages/solvers/test/okx-swap-verifier.test.ts \
  apps/web/lib/open-exchange/transaction-verifier-okx.test.ts
git commit -m "feat(verifier): authorize exact native OKB swaps"
```

### Task 3: Route native OKB through the deterministic transaction strategy

**Files:**
- Modify: `examples/open-solver/src/transaction-strategy.ts`
- Test: `examples/open-solver/test/transaction-strategy.test.ts`
- Test: `examples/open-solver/test/strategy.test.ts`

**Interfaces:**
- Consumes: native-aware `fetchOkxRouteArtifact` and `buildOkxRouteStage`.
- Produces: `solveTransactionIntent(intent)` returning a canonical submission or precise `NO_VERIFIED_OKX_ROUTE`, never `undefined` solely because input is native.

- [ ] **Step 1: Write the failing OKB-to-USDG test**

Construct the exact one-stage policy shape from the reported intent and assert
that the strategy requests OKX using native OKB and finalizes one stage:

```ts
await solveTransactionIntent(intent(NATIVE_ASSET_ADDRESS, usdg, "1126231"), deps);
expect(fetchOkxArtifact).toHaveBeenCalledWith(expect.objectContaining({
  inputToken: NATIVE_ASSET_ADDRESS, outputToken: usdg,
}));
expect(finalize).toHaveBeenCalledWith(expect.objectContaining({
  stages: [expect.objectContaining({ transaction: { valueAtomic: "100" } })],
}));
```

- [ ] **Step 2: Run and verify RED**

```bash
pnpm --filter @cobia/example-open-solver test -- test/transaction-strategy.test.ts
```

Expected: fetch/finalize are not called because of `if (isNativeAssetAddress(input.token)) return`.

- [ ] **Step 3: Remove the solver-side native exclusion**

Delete the generic native-input early return. Preserve only the optimized WOKB
wrap/unwrap special case. Let the ordinary exact-input OKX path handle every
other native or ERC-20 pair.

- [ ] **Step 4: Verify strategy and route tests**

```bash
pnpm --filter @cobia/example-open-solver test -- \
  test/transaction-strategy.test.ts test/strategy.test.ts test/okx-route.test.ts
```

Expected: all focused tests pass and OKB-to-USDG produces a candidate.

- [ ] **Step 5: Commit**

```bash
git add examples/open-solver/src/transaction-strategy.ts \
  examples/open-solver/test/transaction-strategy.test.ts examples/open-solver/test/strategy.test.ts
git commit -m "fix(solver): route native OKB through OKX"
```

### Task 4: Verification and production recovery

**Files:**
- Modify outside Git: `deploy/hetzner/.env` on the production host.
- Verify: `deploy/hetzner/compose.yaml`, `deploy/hetzner/config.production.toml`.

**Interfaces:**
- Consumes: verified Git commits and user-supplied OKX credentials.
- Produces: a healthy registered solver with authenticated read-only X Layer quote access.

- [ ] **Step 1: Run repository verification**

```bash
pnpm --filter @cobia/solvers test
pnpm --filter @cobia/example-open-solver test
pnpm --filter @cobia/web test -- lib/open-exchange/transaction-verifier-okx.test.ts \
  lib/open-exchange/transaction-fork-replay.test.ts
pnpm typecheck
pnpm build
git diff --check
```

Expected: zero failures and clean diff checks.

- [ ] **Step 2: Push verified checkpoints**

```bash
git push origin main
```

Expected: `origin/main` advances to the verified local commit.

- [ ] **Step 3: Restore narrow production access if required**

Resolve the current operator IPv4 and update only the Hetzner TCP/22 source.
Do not change TCP/80, TCP/443 or TCP/15432. Confirm SSH before continuing.

- [ ] **Step 4: Upsert credentials without output**

Update only `OKX_API_KEY`, `OKX_SECRET_KEY`, and `OKX_PASSPHRASE` in the ignored
remote `/opt/cobia/deploy/hetzner/.env`. Print only presence and lengths. Never
place secret values in shell history, Git, logs, patches, or command output.

- [ ] **Step 5: Deploy and verify**

```bash
cd /opt/cobia/deploy/hetzner
git pull --ff-only origin main
docker compose build solver
docker compose up -d --no-deps solver
docker compose ps solver
docker compose logs --tail=100 solver
```

Run one authenticated read-only OKX X Layer native-OKB-to-USDG quote inside the
solver container. Assert only HTTP status, OKX code, route count, input token,
output token and nonzero minimum output. Do not print headers or full payload.

- [ ] **Step 6: Verify public boundaries**

```bash
curl --fail https://api.getcobia.com/healthz
curl --fail https://getcobia.com/api/network/status
```

Expected: replay health is true, solver registration is current and X Layer is live.
