# General Funding V4 Product Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose general native/ERC-20 intents in the product and execute exact payable V4 calls from the owner wallet.

**Architecture:** The compiler creates signed authority and outcomes, not transaction calls. Asset resolution binds symbols to exact chain identities; solvers/verifier produce programs; the browser compares and submits the exact attested V4 transaction. Deployment remains paused until separate governance and canary approval.

**Tech Stack:** Next.js 16, React 19, TypeScript 6, Zod 4, viem 2, Vitest 4, PostgreSQL/Drizzle, Vercel, Safe Transaction Builder

**Spec:** `docs/superpowers/specs/2026-08-21-general-funding-executor-v4-design.md`

## Global Constraints

- Complete the V4 types, contracts, and verifier plans first.
- The compiler must not use product templates or a fixed token list as execution allowlists.
- Every symbol resolves to exact chain/address identity; ambiguity produces clarification.
- Policy signing and principal execution remain separate wallet confirmations.
- Browser submission must match attested `to`, `data`, and `value` exactly.
- Production env mutation, deployment, Safe proposal, activation, and canary spend require separate action-time approval.
- Keep each source file below 300 lines.

---

### Task 1: General asset resolution and policy compilation

**Files:**
- Modify: `apps/web/lib/assets/resolve-mentions.ts`
- Modify: `apps/web/app/api/assets/resolve/route.ts`
- Create: `apps/web/lib/intents/general-policy-v3.ts`
- Create: `apps/web/lib/intents/intent-compiler-v3.ts`
- Modify: `apps/web/app/api/intents/compile/route.ts`
- Test: `apps/web/lib/assets/resolve-mentions.test.ts`
- Test: `apps/web/lib/intents/intent-compiler-v3.test.ts`
- Test: `apps/web/app/api/intents/compile/route.test.ts`

**Interfaces:**
- Consumes: exact native/ERC-20 identities and user goal.
- Produces: clarification or editable `GeneralIntentPolicyV3` draft; never executable calls.

- [ ] **Step 1: Write failing OKB and arbitrary-token compiler tests**

```ts
expect(await compiler.compile("Use 0.01 @OKB to acquire at least 1 @USDG", context))
  .toMatchObject({ status: "review", policy: { funding: { asset: { kind: "native", chainId: 196 } } } });
expect(await compiler.compile("Use 5 @ABC", ambiguousContext))
  .toEqual({ status: "clarification", question: expect.stringContaining("address") });
expect(JSON.stringify(openAiRequest)).not.toContain("allowedCapabilities");
```

Test address mentions, duplicate symbols, chain mismatch, missing amount/outcome, native gas reserve, ERC-20 code hash, unsupported evidence, and prompt-injection text treated as data.

- [ ] **Step 2: Run focused compiler tests and verify RED**

Run: `pnpm --filter @cobia/web exec vitest run lib/assets/resolve-mentions.test.ts lib/intents/intent-compiler-v3.test.ts app/api/intents/compile/route.test.ts`

Expected: FAIL because the current compiler enumerates USDG/USDt0 templates.

- [ ] **Step 3: Implement identity-bound general compilation**

```ts
export interface IntentCompilerContextV3 {
  owner: Address;
  resolvedAssets: ResolvedAssetMentionV1[];
  nativeBalanceAtomic: string;
  minimumGasReserveAtomic: string;
  nowSec: number;
}
export type IntentCompilationV3 =
  | { status: "review"; policy: GeneralIntentPolicyV3 }
  | { status: "clarification"; question: string };
```

The structured model output chooses only among supplied exact identities and emits funding bounds plus outcomes/forbidden sets/limits. Deterministic code constructs and validates the canonical V3 policy; the model never supplies hashes, nonce, owner, chain, deadlines, or executable calls.

- [ ] **Step 4: Run compiler/API tests**

Run: `pnpm --filter @cobia/web exec vitest run lib/assets/resolve-mentions.test.ts lib/intents/intent-compiler-v3.test.ts app/api/intents/compile/route.test.ts`

Expected: PASS; `OKB` compiles as native funding, not an ERC-20 or swap-only template.

- [ ] **Step 5: Commit the compiler checkpoint**

```bash
git add apps/web/lib/assets/resolve-mentions.ts apps/web/app/api/assets/resolve/route.ts apps/web/lib/intents/general-policy-v3.ts apps/web/lib/intents/intent-compiler-v3.ts apps/web/app/api/intents/compile/route.ts apps/web/lib/assets/resolve-mentions.test.ts apps/web/lib/intents/intent-compiler-v3.test.ts apps/web/app/api/intents/compile/route.test.ts
git commit -m "feat(intents): compile general funding policies"
```

### Task 2: Review receipt, persistence, and competition compatibility

**Files:**
- Create: `apps/web/components/intents/GeneralPolicyReceiptV3.tsx`
- Modify: `apps/web/components/intents/IntentComposer.tsx`
- Modify: `apps/web/components/intents/PolicyReceiptEditor.tsx`
- Modify: `apps/web/app/api/intents/route.ts`
- Modify: `apps/web/lib/db/intents.ts`
- Test: `apps/web/components/intents/IntentComposer.test.tsx`
- Test: `apps/web/app/api/intents/route.test.ts`
- Test: `apps/web/lib/db/general-competitions.integration.test.ts`

**Interfaces:**
- Consumes: editable V3 policy draft.
- Produces: owner-signed persisted V3 intent and unchanged solver competition lifecycle.

- [ ] **Step 1: Write failing receipt and persistence tests**

```tsx
expect(screen.getByText("Native OKB")).toBeVisible();
expect(screen.getByText("Maximum wallet debit")).toHaveTextContent("0.01 OKB");
expect(screen.getByText("Gas reserve remains in wallet")).toBeVisible();
expect(screen.queryByText(/swap-only|unsupported token/i)).not.toBeInTheDocument();
```

Assert the signature commitment changes for funding kind/identity/debit/credit/reserve, outcome, forbidden set, deadline, and limits. Persist and reload V2 and V3 policies without coercion or migration loss.

- [ ] **Step 2: Run UI/API/integration tests and verify RED**

Run: `pnpm --filter @cobia/web exec vitest run components/intents/IntentComposer.test.tsx app/api/intents/route.test.ts`

Run with test database: `pnpm --filter @cobia/web exec vitest run --config vitest.integration.config.mts lib/db/general-competitions.integration.test.ts`

Expected: FAIL because the composer/route accepts only the current receipt model.

- [ ] **Step 3: Implement the focused V3 receipt**

```tsx
<dl className="policy-receipt">
  <div><dt>Funding</dt><dd>{fundingLabel(policy.funding.asset)}</dd></div>
  <div><dt>Maximum wallet debit</dt><dd>{formatAtomic(policy.funding.maximumDebitAtomic, asset)}</dd></div>
  <div><dt>Minimum credited</dt><dd>{formatAtomic(policy.funding.minimumCreditAtomic, asset)}</dd></div>
  <div><dt>Gas reserve</dt><dd>{formatNative(policy.funding.minimumNativeReserveAtomic)}</dd></div>
</dl>
```

Split display helpers from the component. Retain legacy V2 rendering for historical intents. Store canonical JSON and version; do not flatten general calls into product templates.

- [ ] **Step 4: Run receipt, API, and persistence tests**

Run the commands from Step 2.

Expected: PASS for both historical V2 and new V3 intents.

- [ ] **Step 5: Commit the product-policy checkpoint**

```bash
git add apps/web/components/intents/GeneralPolicyReceiptV3.tsx apps/web/components/intents/IntentComposer.tsx apps/web/components/intents/PolicyReceiptEditor.tsx apps/web/app/api/intents/route.ts apps/web/lib/db/intents.ts apps/web/components/intents/IntentComposer.test.tsx apps/web/app/api/intents/route.test.ts apps/web/lib/db/general-competitions.integration.test.ts
git commit -m "feat(web): review and publish general funding intents"
```

### Task 3: Exact wallet preflight and payable V4 submission

**Files:**
- Create: `apps/web/lib/execution-v4/wallet-preflight.ts`
- Create: `apps/web/lib/execution-v4/wallet-submit.ts`
- Create: `apps/web/components/intents/GeneralExecutionV4.tsx`
- Modify: `apps/web/components/intents/IntentCompetitionView.tsx`
- Test: `apps/web/lib/execution-v4/wallet-preflight.test.ts`
- Test: `apps/web/lib/execution-v4/wallet-submit.test.ts`
- Test: `apps/web/components/intents/GeneralExecutionV4.test.tsx`

**Interfaces:**
- Consumes: accepted attested V4 call, live wallet/account/chain/balances/nonce/gas estimate.
- Produces: one exact EIP-1193 `eth_sendTransaction` only after explicit confirmation.

- [ ] **Step 1: Write failing balance/gas/exact-call tests**

```ts
expect(preflightNative({ balance: 11n, value: 10n, maximumGasCost: 2n })).toEqual({
  ready: false, code: "INSUFFICIENT_NATIVE_GAS_RESERVE", shortfall: 1n,
});
await submitAttestedV4({ call, wallet });
expect(wallet.request).toHaveBeenCalledWith({ method: "eth_sendTransaction", params: [{
  from: owner, to: call.to, data: call.data, value: toHex(call.value),
}] });
```

Test wrong owner/chain/executor, changed calldata/value, stale block/evidence, code drift, nonce change, insufficient ERC-20 debit, insufficient native value plus worst-case gas, gas-estimation revert, duplicate send, rejected signature, and pending receipt recovery.

- [ ] **Step 2: Run focused execution tests and verify RED**

Run: `pnpm --filter @cobia/web exec vitest run lib/execution-v4 components/intents/GeneralExecutionV4.test.tsx`

Expected: FAIL because the V4 wallet path does not exist.

- [ ] **Step 3: Implement compare-before-send submission**

```ts
export async function submitAttestedV4(input: SubmitV4Input): Promise<Hash> {
  const current = await input.preflight();
  if (!current.ready) throw new WalletPreflightV4Error(current.code, current.shortfall);
  assertExactAttestedCall(input.call, current.expectedCall);
  return input.wallet.request({ method: "eth_sendTransaction", params: [{
    from: input.owner, to: input.call.to, data: input.call.data,
    value: toHex(input.call.value),
  }] }) as Promise<Hash>;
}
```

Render funding, every call, approvals, recipients, value, outcome, refund rules, evidence block, expiry, and worst-case gas before enabling the explicit confirmation button.

- [ ] **Step 4: Run execution tests and browser-shaped build**

Run: `pnpm --filter @cobia/web exec vitest run lib/execution-v4 components/intents/GeneralExecutionV4.test.tsx && pnpm --filter @cobia/web typecheck && pnpm --filter @cobia/web build`

Expected: PASS; no test uses a live wallet or production send method.

- [ ] **Step 5: Commit the wallet-execution checkpoint**

```bash
git add apps/web/lib/execution-v4 apps/web/components/intents/GeneralExecutionV4.tsx apps/web/components/intents/GeneralExecutionV4.test.tsx apps/web/components/intents/IntentCompetitionView.tsx
git commit -m "feat(web): submit attested executor v4 calls"
```
