# Registered Capability Composition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accept, verify, rank, and execute registered multi-step capability intents, including the exact Aave/Curve/Uniswap yield prompt that currently asks for one template.

**Architecture:** Add a strict `CapabilityCompositionPolicyV1` and snapshot while reusing `CapabilityProgramV2`, Executor V3, registered modules, route capture, and the current competition tables. A wrapper derives the exact legacy verifier authority from each proposed program, then independently enforces the signed cross-asset constraints and deterministic net-yield objective.

**Tech Stack:** TypeScript 6, Zod 4, Vitest 4, Next.js 16, React 19, viem 2, Drizzle/PostgreSQL, Anvil.

**Spec:** `docs/superpowers/specs/2026-08-22-registered-capability-composition-design.md`

## Global Constraints

- Registered capability modules only; never authorize arbitrary EVM calls.
- One X Layer input budget and one to eight ordered actions in V1.
- Existing signed policy types and simple intent behavior remain unchanged.
- Missing or stale chain, price, quote, rate, gas, or deployment evidence fails closed.
- The LLM maps prose to strict fields but never supplies addresses, versions, deployments, ranking, or executable calls.
- Compiler emission stays disabled unless the publish, worker, and verifier path supports the policy kind.
- No mocks or fallback data in production paths; no file should exceed the repository's 300 LOC soft limit.

---

### Task 1: Composition policy and snapshot schemas

**Files:**
- Create: `packages/domain/src/capability-composition.ts`
- Create: `packages/domain/test/capability-composition.test.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**
- Produces: `CapabilityCompositionPolicyV1Schema`, `CapabilityCompositionSnapshotV1Schema`, `CapabilityCompositionConstraintV1`, `CapabilityCompositionObjectiveV1`, and parse helpers.
- Consumes: existing address/hash primitives, `RouteSnapshotV2Schema`, and general policy limit shapes.

- [ ] **Step 1: Write failing schema tests** for canonical allowed capabilities/assets, one input, 100 bps conversion loss, 9,900 bps receipt floor, 30-day net-yield objective, ten-minute deadline, snapshot identity, and rejection of unsorted/widened/empty authority.

```ts
expect(CapabilityCompositionPolicyV1Schema.parse(fixture).objective).toEqual({
  kind: "maximize-net-yield", horizonDays: 30,
  receiptCapabilities: ["aave-v3.supply@1"],
});
expect(() => CapabilityCompositionPolicyV1Schema.parse({
  ...fixture, allowedCapabilities: [...fixture.allowedCapabilities].reverse(),
})).toThrow(/sorted/i);
```

- [ ] **Step 2: Run red** with `pnpm --filter @cobia/domain test -- capability-composition.test.ts`; expect missing exports.
- [ ] **Step 3: Implement strict schemas** with `kind: "capability-composition"`, version 1, one X Layer input, exact manifest hash, capability/asset allowlists, typed constraints, objective, limits, and a snapshot wrapping `RouteSnapshotV2` plus gas/native-price evidence.
- [ ] **Step 4: Run green** with the same domain test command, then `pnpm --filter @cobia/domain typecheck`.
- [ ] **Step 5: Commit** `feat(domain): define registered composition intents`.

### Task 2: Policy builder and legacy verifier authority

**Files:**
- Create: `apps/web/lib/intents/composition-policy.ts`
- Create: `apps/web/lib/intents/composition-policy.test.ts`
- Create: `apps/web/lib/open-exchange/composition-authority.ts`
- Create: `apps/web/lib/open-exchange/composition-authority.test.ts`

**Interfaces:**
- Produces: `buildCapabilityCompositionPolicyV1(input)` and `deriveCompositionAuthorityV1(policy, snapshot, program)`.
- Consumes: `CapabilityCompositionPolicyV1`, `CapabilityCompositionSnapshotV1`, `CapabilityProgramV2`, production manifest, protocol registry.

- [ ] **Step 1: Write failing tests** proving the exact prompt fields build a ten-minute signed policy and that a direct or swap→Aave program derives a `GeneralIntentPolicyV2` whose balance constraint is the selected registered aToken floor.
- [ ] **Step 2: Run red** with `pnpm --filter @cobia/web test -- composition-policy.test.ts composition-authority.test.ts`; expect missing modules.
- [ ] **Step 3: Implement the builder** with explicit deadline/horizon/loss/receipt fields and sorted registered identifiers.
- [ ] **Step 4: Implement authority derivation** that rejects unallowed capabilities/assets, non-terminal Aave supply, more than two initial yield actions, a receipt token not registered to the final supplied underlying, and a receipt value below the signed floor; return `{ policy: GeneralIntentPolicyV2, snapshot: GeneralIntentSnapshotV1, manifest }` for the existing verifier.
- [ ] **Step 5: Run green** with the focused tests and `pnpm --filter @cobia/web typecheck`.
- [ ] **Step 6: Commit** `feat(intents): build registered composition authority`.

### Task 3: Compiler union and exact-prompt regression

**Files:**
- Create: `apps/web/lib/intents/composition-draft.ts`
- Create: `apps/web/lib/intents/composition-draft.test.ts`
- Modify: `apps/web/lib/intents/intent-compiler.ts`
- Modify: `apps/web/lib/intents/intent-compiler.test.ts`
- Modify: `apps/web/app/api/intents/compile/route.test.ts`
- Modify: `apps/web/lib/db/solver-profiles.ts`

**Interfaces:**
- Produces: `IntentCompilation = simple | composed | clarification`; `ComposedIntentDraft` contains input token/amount, allowed capability IDs, loss/receipt bps with provenance, horizon, competition duration, and deadline duration.

- [ ] **Step 1: Add a failing compiler fixture** for the exact user sentence; assert `status: "review"`, `kind: "composed"`, amount `1`, three registered capability IDs, 100 loss bps, derived 9,900 receipt bps, 30-day default, and 600-second expiry.
- [ ] **Step 2: Run red** with `pnpm --filter @cobia/web test -- intent-compiler.test.ts composition-draft.test.ts`; expect the single-template schema to reject the response.
- [ ] **Step 3: Implement the strict compiler union** and server-side resolver. The model outputs registered symbolic IDs and explicit/derived provenance; addresses and versions come only from registries. Keep existing simple receipts byte-for-byte compatible. Require a fresh solver profile advertising `policy.capability-composition@1` before returning composed review; otherwise return a named availability clarification.
- [ ] **Step 4: Add contradiction tests** for unknown protocols, no amount/asset, loss above the policy maximum, prompt injection, and a composed response outside the registered library.
- [ ] **Step 5: Run green** with compiler and API route tests.
- [ ] **Step 6: Commit** `feat(intents): compile registered multi-step goals`.

### Task 4: Composition policy review and signing

**Files:**
- Create: `apps/web/components/intents/CompositionPolicyEditor.tsx`
- Create: `apps/web/components/intents/CompositionPolicyEditor.test.tsx`
- Modify: `apps/web/components/intents/IntentComposer.tsx`
- Modify: `apps/web/components/intents/IntentComposer.test.tsx`
- Modify: `apps/web/app/styles/intent-v2.css`

**Interfaces:**
- Consumes: the compiler union and `buildCapabilityCompositionPolicyV1`.
- Produces: an editable composed review and signed `CapabilityCompositionPolicyV1` POST body.

- [ ] **Step 1: Write failing UI tests** that submit the exact goal, show “Registered composition,” three allowed actions, 1% loss, derived 99% receipt value, 30-day horizon, five-minute competition, and ten-minute expiry without “choose one template.”
- [ ] **Step 2: Run red** with `pnpm --filter @cobia/web test -- IntentComposer.test.tsx CompositionPolicyEditor.test.tsx`.
- [ ] **Step 3: Implement a focused editor** under 300 LOC with editable horizon/timing/loss/receipt fields and provenance labels; preserve the existing simple editor.
- [ ] **Step 4: Branch signing by draft kind**, sign the exact new policy commitment, and POST through the same `/api/intents` surface.
- [ ] **Step 5: Run green**, then run the focused accessibility assertions already used by `IntentComposer.test.tsx`.
- [ ] **Step 6: Commit** `feat(web): review and sign composed intents`.

### Task 5: Publication, snapshot capture, and persistence

**Files:**
- Create: `apps/web/lib/open-exchange/capture-composition-snapshot.ts`
- Create: `apps/web/lib/open-exchange/capture-composition-snapshot.test.ts`
- Modify: `apps/web/lib/db/intents.ts`
- Modify: `apps/web/lib/db/open-intent-snapshots.ts`
- Modify: `apps/web/lib/db/open-exchange-schema.ts`
- Create: `apps/web/drizzle/0021_capability_composition.sql`
- Modify: `apps/web/lib/runtime/market.ts`
- Modify: `apps/web/app/api/intents/route.ts`
- Modify: `apps/web/app/api/intents/route.test.ts`

**Interfaces:**
- Produces: `publishCapabilityCompositionIntent({policy, ownerSignature})` and a union snapshot repository.

- [ ] **Step 1: Write failing API/repository tests** for signed composition publication/listing, wrong signatures, stale/missing route evidence, and unchanged open-intent listing.
- [ ] **Step 2: Run red** with `pnpm --filter @cobia/web test -- capture-composition-snapshot.test.ts app/api/intents/route.test.ts`.
- [ ] **Step 3: Implement capture** by building the equivalent earn `StablecoinPolicyV2`, calling `captureRouteSnapshotV2(routeSnapshotDependencies(client))`, pinning gas price plus OKB USD evidence, and rejecting stale or inconsistent data.
- [ ] **Step 4: Generalize persistence and API unions** and add the database check migration for `capability-composition` snapshots without rewriting existing rows.
- [ ] **Step 5: Run green**, `pnpm --filter @cobia/web typecheck`, and the focused integration repository test with `TEST_DATABASE_URL` when available.
- [ ] **Step 6: Commit** `feat(intents): publish composed competitions`.

### Task 6: Solver SDK and reference solver composition

**Files:**
- Modify: `packages/solver-sdk/src/client.ts`
- Modify: `packages/solver-sdk/test/client.test.ts`
- Create: `examples/open-solver/src/composition-strategy.ts`
- Create: `examples/open-solver/test/composition-strategy.test.ts`
- Modify: `examples/open-solver/src/strategy.ts`
- Modify: `examples/open-solver/src/route-tool.ts`

**Interfaces:**
- Produces: a solver intent union and `solveComposition(intent)` returning a fork-replayed `capability-v2` decision.

- [ ] **Step 1: Write failing SDK tests** accepting both policy/snapshot pairs while still rejecting mismatched commitments and owner signatures.
- [ ] **Step 2: Write failing strategy tests** for direct Aave, Curve→Aave, Uniswap→Aave, unregistered capability abstention, and no positive route abstention.
- [ ] **Step 3: Run red** with `pnpm --filter @cobia/solver-sdk test && pnpm --filter @cobia/example-open-solver test -- composition-strategy.test.ts`.
- [ ] **Step 4: Implement candidate selection** from the committed route snapshot, build exact swap and terminal Aave actions, attach the selected aToken balance constraint, derive legacy authority, replay on the pinned fork, return existing decision/evidence schemas, and advertise `policy.capability-composition@1` from the route tool.
- [ ] **Step 5: Run green**, example solver typecheck, and its runtime build.
- [ ] **Step 6: Commit** `feat(solver): compose registered yield routes`.

### Task 7: Independent composition verification and ranking

**Files:**
- Create: `apps/web/lib/open-exchange/composition-objective.ts`
- Create: `apps/web/lib/open-exchange/composition-objective.test.ts`
- Create: `apps/web/lib/open-exchange/composition-verifier.ts`
- Create: `apps/web/lib/open-exchange/composition-verifier.test.ts`
- Modify: `apps/web/lib/open-exchange/decision-intake.ts`
- Modify: `apps/web/lib/open-exchange/decision-intake.test.ts`
- Modify: `apps/web/lib/runtime/market.ts`
- Modify: `apps/web/lib/competitions/objective-measurement.ts`

**Interfaces:**
- Produces: `verifyCompositionProposalV1()` and versioned objective artifacts carrying atomic USD-E8 net terminal value, horizon, evaluator version, and evidence hash.

- [ ] **Step 1: Write failing arithmetic tests** for cross-asset normalization, conversion loss, Aave yield, expected gas, solver fee, rounding, and deterministic ties.
- [ ] **Step 2: Write failing verifier tamper tests** for capability widening, quote/rate/price/gas substitution, wrong receipt identity/floor, reordered actions, stale anchors, and objective substitution.
- [ ] **Step 3: Run red** with `pnpm --filter @cobia/web test -- composition-objective.test.ts composition-verifier.test.ts decision-intake.test.ts`.
- [ ] **Step 4: Implement the wrapper verifier**: derive authority, invoke `verifyCapabilityProgramV2`, match the replayed action parameters to committed route opportunities, compute the typed objective, and emit the exact executable authorization plus objective artifact.
- [ ] **Step 5: Generalize intake policy/snapshot parsing** while preserving current open transaction and capability paths.
- [ ] **Step 6: Run green** and web typecheck.
- [ ] **Step 7: Commit** `feat(verifier): attest composed intent outcomes`.

### Task 8: Competition presentation and execution compatibility

**Files:**
- Modify: `apps/web/app/intents/[intentId]/page.tsx`
- Modify: `apps/web/components/intents/IntentCompetitionView.tsx`
- Modify: `apps/web/components/intents/IntentCompetitionView.test.tsx`
- Modify: `apps/web/lib/db/solver-submissions.ts`
- Modify: `apps/web/lib/db/solver-profiles.ts`
- Modify: `apps/web/app/api/programs/[submissionId]/execution/route.ts`
- Modify: focused execution route tests.

**Interfaces:**
- Consumes: policy/snapshot union and versioned objective artifacts.
- Produces: ranked composed program cards and unchanged Executor V3 execution payloads.

- [ ] **Step 1: Write failing page/view tests** showing ordered actions, net-yield objective, hard constraints, revision state, solver identity, and receipt token on composed submissions.
- [ ] **Step 2: Write a failing execution test** proving an attested composed capability program projects through the existing Executor V3 authorization path.
- [ ] **Step 3: Run red** with the focused component and API route tests.
- [ ] **Step 4: Implement union rendering/ranking** and retain the existing simple intent UI unchanged.
- [ ] **Step 5: Run green** and web typecheck.
- [ ] **Step 6: Commit** `feat(web): present composed solver competition`.

### Task 9: End-to-end verification and release gate

**Files:**
- Modify: `docs/architecture/intent-compatibility.md`
- Modify: `docs/evidence/general-intent-mainnet-readiness.md`
- Add only focused tests required by failures found during verification.

- [ ] **Step 1: Run focused package suites**: domain, solvers, solver SDK, example solver, and all changed web tests.
- [ ] **Step 2: Run static verification**: `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `git diff --check`.
- [ ] **Step 3: Run a pinned X Layer fork replay** for direct Aave, Curve→Aave, and Uniswap→Aave; record any route that correctly abstains because live pinned liquidity is unavailable.
- [ ] **Step 4: Run browser smoke** for the exact goal through composed review and publication in a local production build; do not claim wallet execution unless the user separately confirms the transaction.
- [ ] **Step 5: Update compatibility/readiness docs** with exact supported shapes, evidence boundaries, and verification output.
- [ ] **Step 6: Review the full diff against the spec**, verify no compiler emission can outrun worker/verifier support, and commit `docs: document composed intent readiness`.
