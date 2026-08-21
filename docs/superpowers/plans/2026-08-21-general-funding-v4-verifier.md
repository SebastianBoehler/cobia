# General Program V4 Verifier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Independently verify, replay, project, and attest general native/ERC-20 call programs without semantic capability allowlists.

**Architecture:** Separate structural authority, code/asset identity, conservative flow, fresh-fork replay, and attestation. The verifier consumes raw solver output but creates the only executable V4 projection.

**Tech Stack:** TypeScript 6, Zod 4, viem 2, Vitest 4, Anvil/Foundry, Vercel Sandbox

**Spec:** `docs/superpowers/specs/2026-08-21-general-funding-executor-v4-design.md`

## Global Constraints

- Complete the V4 types and contract plans first.
- Never accept solver-authored executable commitments, signatures, wallet providers, or production send methods.
- Verify exact target/proxy identity, calldata, value, gas, approvals, touched assets/accounts, predicates, and outcomes.
- General calls are admitted by complete evidence, not semantic adapter registration.
- A fresh pinned-fork replay is mandatory before attestation.
- Keep each source file below 300 lines.

---

### Task 1: Structural and identity verifier

**Files:**
- Create: `packages/solvers/src/general/rejection-v4.ts`
- Create: `packages/solvers/src/general/identity-v4.ts`
- Create: `packages/solvers/src/general/verifier-v4.ts`
- Test: `packages/solvers/test/general-verifier-v4.test.ts`

**Interfaces:**
- Consumes: `GeneralIntentPolicyV3`, `GeneralProgramV4`, `GeneralProgramEvidenceV4`, pinned-block reader.
- Produces: `verifyGeneralProgramV4(input): Promise<GeneralVerificationV4>` with stable sorted rejection codes and no signature.

- [ ] **Step 1: Write failing structural rejection tests**

```ts
for (const [mutate, code] of [
  [(p: Program) => ({ ...p, owner: OTHER }), "POLICY_MISMATCH"],
  [(p: Program) => ({ ...p, calls: [{ ...p.calls[0]!, valueAtomic: "2" }] }), "NATIVE_VALUE_INVALID"],
  [(p: Program) => ({ ...p, calls: [{ ...p.calls[0]!, runtimeCodeHash: OTHER_HASH }] }), "TARGET_CODE_MISMATCH"],
] as const) {
  expect((await verifyGeneralProgramV4(fixture(mutate(program)))).errorCodes).toContain(code);
}
```

Cover schema/chain/policy/anchor/deadline/funding/limit/forbidden-set mismatch, EOA-vs-contract target kind, proxy identity, stale evidence, unknown touched asset/account, and evidence cardinality.

- [ ] **Step 2: Run the focused verifier test and verify RED**

Run: `pnpm --filter @cobia/solvers exec vitest run test/general-verifier-v4.test.ts`

Expected: FAIL because the V4 verifier does not exist.

- [ ] **Step 3: Implement fail-closed phases and stable codes**

```ts
export interface GeneralVerificationV4 {
  accepted: boolean;
  errorCodes: GeneralProgramV4RejectionCode[];
  program?: GeneralProgramV4;
  evidence?: GeneralProgramEvidenceV4;
  replay?: GeneralReplayResultV4;
}
```

Parse raw values before dereferencing. Compare canonical commitments, confirm the pinned hash, independently read every current runtime/implementation code hash, require exact declared target kind, and stop before replay when any prior error exists.

- [ ] **Step 4: Run structural verifier tests**

Run: `pnpm --filter @cobia/solvers exec vitest run test/general-verifier-v4.test.ts`

Expected: PASS with deterministic sorted codes.

- [ ] **Step 5: Commit the structural checkpoint**

```bash
git add packages/solvers/src/general/rejection-v4.ts packages/solvers/src/general/identity-v4.ts packages/solvers/src/general/verifier-v4.ts packages/solvers/test/general-verifier-v4.test.ts
git commit -m "feat(verifier): validate general programs v4"
```

### Task 2: Whole-program authority and asset conservation

**Files:**
- Create: `packages/solvers/src/general/authority-v4.ts`
- Create: `packages/solvers/src/general/asset-flow-v4.ts`
- Test: `packages/solvers/test/general-authority-v4.test.ts`
- Test: `packages/solvers/test/general-asset-flow-v4.test.ts`

**Interfaces:**
- Consumes: policy funding authority, calls, evidence balance/allowance/native deltas.
- Produces: `verifyGeneralAuthorityV4()` and `verifyGeneralAssetFlowV4()` with exact debit, cleanup, recipient, residue, and non-regression results.

- [ ] **Step 1: Write hidden-loss and approval-theft tests**

```ts
expect(verifyGeneralAssetFlowV4(hiddenSecondAssetDebit).errorCodes)
  .toContain("UNDECLARED_WALLET_DEBIT");
expect(verifyGeneralAuthorityV4(favorableOutputWithLingeringApproval).errorCodes)
  .toContain("APPROVAL_NOT_CLEARED");
expect(verifyGeneralAssetFlowV4(nativeResidue).errorCodes)
  .toContain("EXECUTOR_RESIDUE");
```

Test maximum debit/minimum credit, transfer tax bounds, rebase/callback evidence, intermediate assets, named recipients, native value allocation, funding refund, pre-existing executor residue, absolute/increase constraints, and favorable outcome plus hidden loss.

- [ ] **Step 2: Run authority/flow tests and verify RED**

Run: `pnpm --filter @cobia/solvers exec vitest run test/general-authority-v4.test.ts test/general-asset-flow-v4.test.ts`

Expected: FAIL because whole-program V4 analysis is absent.

- [ ] **Step 3: Implement ledger-based conservation**

```ts
type LedgerKey = `${"native" | "erc20"}:${string}:${Address}`;
interface FlowLedgerEntry { before: bigint; after: bigint; authorizedDebit: bigint; requiredMinimum: bigint }

export function verifyGeneralAssetFlowV4(input: FlowInputV4): FlowResultV4 {
  const ledger = buildObservedLedger(input.evidence);
  requireFundingDebitWithinBounds(ledger, input.policy.funding);
  requireNoUndeclaredWalletDebits(ledger, input.program);
  requireDeclaredRecipientsAndZeroExecutorResidue(ledger, input.program);
  return resultFromErrors(errors);
}
```

Do not infer safety from call names. Compare observed state deltas and allowances against the exact signed/touched sets. Require every approval pair to end at zero even if it existed in multiple calls.

- [ ] **Step 4: Run whole-program tests**

Run: `pnpm --filter @cobia/solvers exec vitest run test/general-authority-v4.test.ts test/general-asset-flow-v4.test.ts test/general-verifier-v4.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the conservation checkpoint**

```bash
git add packages/solvers/src/general/authority-v4.ts packages/solvers/src/general/asset-flow-v4.ts packages/solvers/test/general-authority-v4.test.ts packages/solvers/test/general-asset-flow-v4.test.ts
git commit -m "feat(verifier): prove general program conservation"
```

### Task 3: Native/ERC-20 fresh-fork replay

**Files:**
- Create: `apps/web/lib/coding-agent-sandbox/general-fork-funding-v4.ts`
- Create: `apps/web/lib/coding-agent-sandbox/general-fork-replay-v4.ts`
- Test: `apps/web/lib/coding-agent-sandbox/general-fork-replay-v4.test.ts`
- Test: `apps/web/lib/coding-agent-sandbox/general-program-v4.fork.test.ts`

**Interfaces:**
- Consumes: canonical V4 program/evidence, disposable Anvil client, deployed V4 addresses.
- Produces: `replayGeneralProgramV4()` returning exact trace/state/events/balance/allowance/native/predicate/gas evidence.

- [ ] **Step 1: Write failing replay-isolation tests**

```ts
await replayGeneralProgramV4(nativeInput);
expect(rpc.methods).toContain("anvil_setBalance");
expect(rpc.methods).not.toContain("wallet_sendTransaction");
expect(productionRpc.methods).not.toContain("eth_sendRawTransaction");
expect(fork.stop).toHaveBeenCalledTimes(1);
```

Test exact pinned block/hash, native owner funding plus gas reserve, ERC-20 storage funding only on the disposable fork, impersonation stop, fork stop in `finally`, timeout, trace mismatch, reorg, call revert, and post-state evidence capture.

- [ ] **Step 2: Run replay unit tests and verify RED**

Run: `pnpm --filter @cobia/web exec vitest run lib/coding-agent-sandbox/general-fork-replay-v4.test.ts`

Expected: FAIL because replay V4 does not exist.

- [ ] **Step 3: Implement fork-only funding and execution**

```ts
export async function replayGeneralProgramV4(input: GeneralReplayInputV4) {
  const fork = await input.startFork(input.snapshot);
  try {
    await fundForkOwnerV4(fork, input.program.funding, input.gasReserve);
    const receipt = await fork.executeV4(input.encodedCall);
    return await collectGeneralEvidenceV4(fork, input.program, receipt);
  } finally {
    await fork.stop();
  }
}
```

The public RPC remains read-only. Only the disposable fork may impersonate, mutate balances/storage, deploy test V4 contracts, or send execution transactions.

- [ ] **Step 4: Run unit and opt-in real-fork tests**

Run: `pnpm --filter @cobia/web exec vitest run lib/coding-agent-sandbox/general-fork-replay-v4.test.ts`

Run when `XLAYER_RPC_URL` is configured: `pnpm --filter @cobia/web exec vitest run --config vitest.fork.config.mts lib/coding-agent-sandbox/general-program-v4.fork.test.ts`

Expected: both PASS; no production send method occurs.

- [ ] **Step 5: Commit the replay checkpoint**

```bash
git add apps/web/lib/coding-agent-sandbox/general-fork-funding-v4.ts apps/web/lib/coding-agent-sandbox/general-fork-replay-v4.ts apps/web/lib/coding-agent-sandbox/general-fork-replay-v4.test.ts apps/web/lib/coding-agent-sandbox/general-program-v4.fork.test.ts
git commit -m "feat(verifier): replay general programs v4"
```

### Task 4: Projection, attestation, and adversarial verifier gate

**Files:**
- Create: `apps/web/lib/atomic-execution/project-general-program-v4.ts`
- Create: `apps/web/lib/coding-agent-sandbox/general-attestation-v4.ts`
- Test: `apps/web/lib/atomic-execution/project-general-program-v4.test.ts`
- Test: `apps/web/lib/coding-agent-sandbox/general-attestation-v4.test.ts`
- Create: `packages/solvers/test/general-verifier-v4-adversarial.test.ts`

**Interfaces:**
- Consumes: accepted verification with exact replay.
- Produces: `projectGeneralProgramV4()`, signed `createGeneralAttestationV4()`, browser-ready payable transaction.

- [ ] **Step 1: Write failing projection/attestation tests**

```ts
expect(() => projectGeneralProgramV4({ ...input, verification: rejected })).toThrow();
expect(() => projectGeneralProgramV4({ ...input, verification: { ...accepted, replay: undefined } })).toThrow();
expect((await createGeneralAttestationV4(nativeInput)).call.value).toBe(nativeProgram.funding.debitAmount);
```

Mutate every policy/program/evidence/authorization field after acceptance; require projection or signature verification to reject before encoding.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm --filter @cobia/web exec vitest run lib/atomic-execution/project-general-program-v4.test.ts lib/coding-agent-sandbox/general-attestation-v4.test.ts`

Expected: FAIL because V4 projection/attestation is absent.

- [ ] **Step 3: Implement accepted-only projection and signing**

```ts
export function projectGeneralProgramV4(input: ProjectionInputV4): AtomicExecutionProgramV4 {
  if (!input.verification.accepted || input.verification.errorCodes.length || !input.verification.replay) {
    throw new Error("V4 projection requires accepted independent replay");
  }
  const projected = mapCanonicalProgramToAtomicV4(input.program, input.evidence);
  assertAtomicExecutionProgramV4(projected);
  return projected;
}
```

Build EIP-712 authorization only from the projected program. Independently compare the browser transaction's `to`, `data`, and `value` to the attested call.

- [ ] **Step 4: Run verifier phase gate**

Run: `pnpm --filter @cobia/solvers test && pnpm --filter @cobia/web exec vitest run lib/atomic-execution/project-general-program-v4.test.ts lib/coding-agent-sandbox/general-attestation-v4.test.ts && pnpm --filter @cobia/solvers typecheck && pnpm --filter @cobia/web typecheck`

Expected: PASS.

- [ ] **Step 5: Commit the verifier-ready checkpoint**

```bash
git add apps/web/lib/atomic-execution/project-general-program-v4.ts apps/web/lib/coding-agent-sandbox/general-attestation-v4.ts apps/web/lib/atomic-execution/project-general-program-v4.test.ts apps/web/lib/coding-agent-sandbox/general-attestation-v4.test.ts packages/solvers/test/general-verifier-v4-adversarial.test.ts
git commit -m "feat(verifier): attest general programs v4"
```
