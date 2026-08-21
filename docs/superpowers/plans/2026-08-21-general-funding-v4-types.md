# General Funding V4 Types Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Define canonical V3 policy, V4 program, evidence, authorization, hashing, and ABI types for one native-OKB or ERC-20 funding asset and general ordered calls.

**Architecture:** Add new versioned schemas beside V2/V3 types; do not mutate persisted historical contracts. Domain types own user authority, solver types own proposed calls/evidence, and web atomic types mirror Solidity byte-for-byte.

**Tech Stack:** TypeScript 6, Zod 4, viem 2, Vitest 4, pnpm 11, Node.js 24+

**Spec:** `docs/superpowers/specs/2026-08-21-general-funding-executor-v4-design.md`

## Global Constraints

- One wallet funding asset: native X Layer OKB or one ERC-20.
- General calls are not restricted by semantic template or capability ID.
- Maximum eight calls, eight predicates, eight balance constraints, sixteen approval pairs, and sixteen refund assets.
- Every value-moving policy requires an enforceable final outcome and explicit conservation/non-regression authority.
- Preserve V2 policy, V2 capability program, and V3 atomic encodings unchanged.
- Keep every created or materially expanded source file below 300 lines.

---

### Task 1: Canonical funding and policy authority

**Files:**
- Create: `packages/domain/src/funding-authorization.ts`
- Modify: `packages/domain/src/general-intent-policy.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/domain/test/general-intent-policy-v3.test.ts`

**Interfaces:**
- Produces: `FundingAuthorizationV1Schema`, `GeneralAssetV1Schema`, `GeneralBalanceConstraintV3Schema`, `GeneralIntentPolicyV3Schema`, `parseGeneralIntentPolicyV3()`.
- Preserves: every existing V2 export and commitment.

- [ ] **Step 1: Write failing canonical-schema tests**

```ts
const native = { kind: "native", chainId: 196 } as const;
const funding = {
  asset: native, maximumDebitAtomic: "10000000000000000",
  minimumCreditAtomic: "10000000000000000", minimumNativeReserveAtomic: "1000000000000000",
};
expect(GeneralIntentPolicyV3Schema.parse({ ...fixture, version: 3, funding }).funding).toEqual(funding);
expect(() => GeneralIntentPolicyV3Schema.parse({ ...fixture, version: 3,
  funding: { ...funding, asset: { kind: "erc20", chainId: 196, token: ZERO_ADDRESS } } })).toThrow();
expect(() => GeneralIntentPolicyV3Schema.parse({ ...fixture, version: 3,
  limits: { ...fixture.limits, maxCalls: 9 } })).toThrow();
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter @cobia/domain exec vitest run test/general-intent-policy-v3.test.ts`

Expected: FAIL because the V3 schemas are not exported.

- [ ] **Step 3: Implement strict discriminated funding schemas**

```ts
export const GeneralAssetV1Schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("native"), chainId: z.literal(196) }).strict(),
  z.object({ kind: z.literal("erc20"), chainId: z.literal(196), token: AddressSchema,
    runtimeCodeHash: HashSchema }).strict(),
]);
export const FundingAuthorizationV1Schema = z.object({
  asset: GeneralAssetV1Schema,
  maximumDebitAtomic: PositiveAtomicAmountSchema,
  minimumCreditAtomic: PositiveAtomicAmountSchema,
  minimumNativeReserveAtomic: PositiveAtomicAmountSchema,
}).strict().refine((value) => BigInt(value.minimumCreditAtomic) <= BigInt(value.maximumDebitAtomic),
  "Minimum credit cannot exceed maximum debit");
```

Add `GeneralIntentPolicyV3Schema` with forbidden targets/assets/recipients/selectors, V4 limits, outcome constraints carrying both `asset` and `account`, predicates, and objective. Require sorted unique sets, deadline ordering, one post-state outcome, and no forbidden constrained asset.

- [ ] **Step 4: Run domain tests**

Run: `pnpm --filter @cobia/domain exec vitest run test/general-intent-policy-v3.test.ts test/general-intent-policy.test.ts`

Expected: PASS with V2 regression coverage unchanged.

- [ ] **Step 5: Commit the policy checkpoint**

```bash
git add packages/domain/src/funding-authorization.ts packages/domain/src/general-intent-policy.ts packages/domain/src/index.ts packages/domain/test/general-intent-policy-v3.test.ts
git commit -m "feat(domain): define general funding policy v3"
```

### Task 2: Canonical V4 call program and evidence

**Files:**
- Create: `packages/solvers/src/general/program-v4.ts`
- Create: `packages/solvers/src/general/evidence-v4.ts`
- Modify: `packages/solvers/src/index.ts`
- Test: `packages/solvers/test/general-program-v4.test.ts`

**Interfaces:**
- Consumes: `GeneralAssetV1Schema`, static predicates, canonical addresses/hashes.
- Produces: `GeneralApprovalV1`, `GeneralCallV1`, `GeneralProgramV4`, `GeneralProgramEvidenceV4`, `generalProgramCommitmentV4()`.

- [ ] **Step 1: Write failing program mutation tests**

```ts
const program = GeneralProgramV4Schema.parse(programFixture);
const original = generalProgramCommitmentV4(program);
for (const changed of [
  { ...program, calls: [{ ...program.calls[0]!, valueAtomic: "1" }] },
  { ...program, calls: [{ ...program.calls[0]!, gasLimit: program.calls[0]!.gasLimit + 1 }] },
  { ...program, funding: { ...program.funding, minimumCreditAtomic: "1" } },
]) expect(generalProgramCommitmentV4(changed)).not.toBe(original);
```

Assert rejection of duplicate call IDs, zero code hash for a contract target, non-empty calldata for an EOA recipient, approval pairs not included in cleanup, unordered refund assets, and totals above V4 limits.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter @cobia/solvers exec vitest run test/general-program-v4.test.ts`

Expected: FAIL because V4 program/evidence modules do not exist.

- [ ] **Step 3: Implement exact call and evidence schemas**

```ts
export const GeneralCallV1Schema = z.object({
  id: StageIdSchema, targetKind: z.enum(["contract", "recipient"]), target: AddressSchema,
  runtimeCodeHash: HashSchema.nullable(), implementation: DeploymentIdentitySchema.optional(),
  data: HexSchema, valueAtomic: AtomicSchema, gasLimit: z.number().int().min(21_000).max(5_000_000),
  approvals: z.array(GeneralApprovalV1Schema).max(16),
  touchedAssets: z.array(GeneralAssetV1Schema).max(16),
  touchedAccounts: z.array(AddressSchema).max(16),
}).strict();
```

Evidence commits block, program hash, trace/state/events hashes, deployments, owner/executor balance deltas, allowance deltas, native deltas, predicate observations, gas used per call, and zero-residue observations.

- [ ] **Step 4: Run solver schema tests**

Run: `pnpm --filter @cobia/solvers exec vitest run test/general-program-v4.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the program checkpoint**

```bash
git add packages/solvers/src/general packages/solvers/src/index.ts packages/solvers/test/general-program-v4.test.ts
git commit -m "feat(solvers): define general call program v4"
```

### Task 3: Byte-exact atomic V4 types and encoder

**Files:**
- Create: `apps/web/lib/atomic-execution/types-v4.ts`
- Create: `apps/web/lib/atomic-execution/encode-v4.ts`
- Create: `apps/web/lib/atomic-execution/authorization-v4.ts`
- Test: `apps/web/lib/atomic-execution/types-v4.test.ts`
- Test: `apps/web/lib/atomic-execution/encode-v4.test.ts`

**Interfaces:**
- Consumes: accepted canonical V4 program fields.
- Produces: `AtomicFundingV4`, `AtomicCallV4`, `AtomicExecutionProgramV4`, `AtomicAuthorizationV4`, `atomicExecutionProgramHashV4()`, `encodeAtomicExecutionCallV4()`.

- [ ] **Step 1: Write failing hash and payable-encoding tests**

```ts
expect(atomicExecutionProgramHashV4(nativeFixture)).toMatch(/^0x[0-9a-f]{64}$/);
expect(encodeAtomicExecutionCallV4({ program: nativeFixture, authorization, signature,
  expectedExecutor }).value).toBe(nativeFixture.funding.debitAmount);
expect(encodeAtomicExecutionCallV4({ program: erc20Fixture, authorization: erc20Auth,
  signature, expectedExecutor }).value).toBe(0n);
```

Mutate funding kind/token/debit/credit, target kind/code hash, call value/order/gas/data, approval spender/amount, refund asset, account constraint, predicate, and authorization fields; require hash or authorization mismatch.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `pnpm --filter @cobia/web exec vitest run lib/atomic-execution/types-v4.test.ts lib/atomic-execution/encode-v4.test.ts`

Expected: FAIL because V4 atomic modules do not exist.

- [ ] **Step 3: Implement ABI-mirrored types and validation**

```ts
export interface AtomicFundingV4 {
  kind: 0 | 1; token: Address; debitAmount: bigint; minimumCredit: bigint;
}
export interface AtomicCallV4 {
  targetKind: 0 | 1; target: Address; runtimeCodeHash: Hash; value: bigint;
  gasLimit: number; approvals: AtomicApprovalV4[]; data: Hex;
}
```

Use zero address only as the native funding/asset sentinel. Require contract targets to have a nonzero code hash, recipient targets to have `0x` calldata and zero code hash, total call value not to exceed native debit, cleanup coverage for every approval/refund asset, and the constants from the spec.

- [ ] **Step 4: Run atomic V4 tests**

Run: `pnpm --filter @cobia/web exec vitest run lib/atomic-execution/types-v4.test.ts lib/atomic-execution/encode-v4.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the ABI checkpoint**

```bash
git add apps/web/lib/atomic-execution/types-v4.ts apps/web/lib/atomic-execution/encode-v4.ts apps/web/lib/atomic-execution/authorization-v4.ts apps/web/lib/atomic-execution/types-v4.test.ts apps/web/lib/atomic-execution/encode-v4.test.ts
git commit -m "feat(execution): encode general programs v4"
```

### Task 4: Freeze TypeScript interoperability vectors

**Files:**
- Create: `apps/web/lib/atomic-execution/v4-test-fixture.ts`
- Create: `apps/web/lib/atomic-execution/v4-vectors.test.ts`
- Create: `contracts/test/fixtures/executor-v4-vectors.json`
- Modify: `package.json`

**Interfaces:**
- Produces: one native and one ERC-20 canonical vector shared by TypeScript and Foundry.
- Consumer: contract plan uses the exact program and authorization hashes.

- [ ] **Step 1: Add failing stable-vector assertions**

```ts
expect(atomicExecutionProgramHashV4(nativeProgramV4Fixture)).toBe(vectors.native.programHash);
expect(atomicAuthorizationPayloadHashV4(nativeAuthorizationV4Fixture)).toBe(vectors.native.authorizationHash);
expect(atomicExecutionProgramHashV4(erc20ProgramV4Fixture)).toBe(vectors.erc20.programHash);
```

- [ ] **Step 2: Generate vectors once and rerun against the checked-in JSON**

Run: `pnpm --filter @cobia/web exec vitest run lib/atomic-execution/v4-vectors.test.ts -u`

Expected: first run creates reviewed values; second run passes without changing the fixture.

- [ ] **Step 3: Add the focused workspace script**

```json
"executor:v4:types:test": "pnpm --filter @cobia/domain test && pnpm --filter @cobia/solvers test && pnpm --filter @cobia/web exec vitest run lib/atomic-execution/types-v4.test.ts lib/atomic-execution/encode-v4.test.ts lib/atomic-execution/v4-vectors.test.ts"
```

- [ ] **Step 4: Run the phase gate**

Run: `pnpm executor:v4:types:test && pnpm --filter @cobia/domain typecheck && pnpm --filter @cobia/solvers typecheck && pnpm --filter @cobia/web typecheck`

Expected: PASS under Node.js 24+.

- [ ] **Step 5: Commit the frozen interface checkpoint**

```bash
git add package.json apps/web/lib/atomic-execution/v4-test-fixture.ts apps/web/lib/atomic-execution/v4-vectors.test.ts contracts/test/fixtures/executor-v4-vectors.json
git commit -m "test(execution): freeze executor v4 vectors"
```
