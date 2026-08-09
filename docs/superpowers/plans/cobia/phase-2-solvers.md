# Cobia Solvers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce two independently signed allocation bundles from one real X Layer snapshot and verify them without trusting either solver.

**Architecture:** OKX DeFi API data is normalized once and committed before solver execution. A deterministic solver applies a published utility function; an OpenAI research solver augments the same numeric snapshot with current sourced risk evidence. A pure verifier recomputes every executable field and score.

**Tech Stack:** TypeScript, Zod, Viem, OpenAI Responses API with web search, Vitest.

## Global Constraints

- Use the constraints in `../2026-08-09-cobia-mvp.md`.
- Solvers consume `Readonly<MarketSnapshot>` and cannot fetch different market numbers.
- Only the research solver may search the web, and its URLs are evidence—not execution authority.
- Solver signing keys never receive funds and never authorize user transactions.

---

### Task 1: Capture one immutable live snapshot

**Files:**
- Create: `apps/web/lib/okx/products.ts`
- Create: `apps/web/lib/okx/normalize.ts`
- Create: `apps/web/lib/okx/normalize.test.ts`
- Create: `apps/web/lib/chain/public-client.ts`
- Create: `apps/web/lib/orchestrator/capture-snapshot.ts`

**Interfaces:**
- Consumes `searchProducts`, product detail, and X Layer RPC.
- Produces `captureSnapshot(policy: StablecoinPolicy): Promise<MarketSnapshot>`.

- [ ] **Step 1: Write normalization tests from redacted API fixtures**

Fixtures may contain real recorded response shapes for tests but are never
compiled into or selectable by runtime code. Test decimal APY to integer bps,
USD TVL to six-decimal integers, token decimals, unsupported chain rejection,
missing investment detail, non-investable products, and duplicate products.

- [ ] **Step 2: Run the focused tests and observe failure**

```bash
pnpm --filter @cobia/web vitest run lib/okx/normalize.test.ts
```

Expected: FAIL because `normalizeAaveCandidate` is missing.

- [ ] **Step 3: Implement snapshot capture**

Read block number/hash first, call OKX product search and detail for the policy
asset and chain, normalize exactly one cash candidate plus eligible Aave
candidates, then read the block again. Reject the snapshot if the ending block
is more than five blocks after the starting block. Store source retrieval times
and commit the complete snapshot.

- [ ] **Step 4: Run a live assertion**

```bash
pnpm tsx scripts/verify-okx-live.ts --snapshot --chain 196 --token USDC
```

Expected: valid `MarketSnapshot`, cash candidate, at least one Aave candidate,
block number/hash, and a reproducible snapshot commitment.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/okx apps/web/lib/chain apps/web/lib/orchestrator
git commit -m "feat(data): capture immutable x layer yield snapshots"
```

### Task 2: Implement the pure bundle verifier

**Files:**
- Create: `packages/domain/src/verify.ts`
- Create: `packages/domain/src/score.ts`
- Create: `packages/domain/test/verify.test.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**
- Produces `verifyBundle(policy, snapshot, bundle, solverAddress): Promise<VerificationVerdict>`.
- Produces `projectRouteQuote(bundle, verdict, priceAtomic, validUntil): RouteQuote`
  that excludes actions, evidence URLs, target addresses, and calldata.
- Produces stable error codes consumed by storage, UI, and contract preparation.

- [ ] **Step 1: Write one failing test per rejection code**

Cover `POLICY_HASH_MISMATCH`, `SNAPSHOT_HASH_MISMATCH`, `SNAPSHOT_STALE`,
`ALLOCATION_TOTAL_INVALID`, `UNKNOWN_CANDIDATE`, `EXPOSURE_LIMIT_EXCEEDED`,
`TVL_BELOW_MINIMUM`, `APY_BELOW_MINIMUM`, `ACTION_AMOUNT_MISMATCH`,
`ACTION_NOT_ALLOWED`, `EVIDENCE_MISSING`, `CRITICAL_RISK`, and
`SOLVER_SIGNATURE_INVALID`.

- [ ] **Step 2: Define the published scoring function**

```ts
const RISK_PENALTY_BPS = { low: 5, medium: 25, high: 100 } as const;
const score = recomputedNetApyBps - sumRiskPenaltyBps - staleEvidencePenaltyBps;
```

Critical risk invalidates the bundle. Evidence older than 30 days costs 25 bps;
older than 90 days fails. The verifier derives allocated amounts and APY from
snapshot candidates and allocation bps, ignoring solver-provided calculations.

- [ ] **Step 3: Implement signature verification**

Recover the EIP-191 signer from the canonical bundle commitment after excluding
the `signature` field. Require exact equality with the configured solver address.

- [ ] **Step 4: Run mutation-style adversarial cases**

Start from one valid bundle and mutate every executable field independently.
Each mutation must either change the commitment and signature requirement or
produce a deterministic rejection code.

Add a projection test proving serialized `RouteQuote` output cannot contain an
action kind, investment ID, evidence URL, target, calldata, or atomic principal.

```bash
pnpm --filter @cobia/domain vitest run test/verify.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/domain
git commit -m "feat(domain): verify and score solver bundles"
```

### Task 3: Implement the deterministic solver

**Files:**
- Create: `packages/solvers/src/types.ts`
- Create: `packages/solvers/src/deterministic.ts`
- Create: `packages/solvers/src/sign.ts`
- Create: `packages/solvers/src/index.ts`
- Create: `packages/solvers/test/deterministic.test.ts`

**Interfaces:**
- Produces `Solver` interface with `solve(input: SolverInput): Promise<DecisionBundle>`.
- Produces `createDeterministicSolver(signer: Account): Solver`.

- [ ] **Step 1: Write allocation tests**

Test 100% cash when no candidate clears constraints, the maximum allowed Aave
allocation when its verified APY clears constraints, exact remainder to cash,
stable tie-breaking by candidate ID, and no mutation of the frozen snapshot.

- [ ] **Step 2: Implement the optimizer**

For each eligible Aave candidate, calculate utility with the same exported
scoring primitives as the verifier. Choose the highest utility candidate. Assign
`maxProtocolExposureBps` to it and the remainder to cash. Derive atomic action
amount with integer arithmetic and sign the bundle commitment.

- [ ] **Step 3: Cross-check every result through the verifier**

```ts
const bundle = await solver.solve(input);
const verdict = await verifyBundle(input.policy, input.snapshot, bundle, signer.address);
expect(verdict.executable).toBe(true);
```

- [ ] **Step 4: Verify and commit**

```bash
pnpm --filter @cobia/solvers vitest run test/deterministic.test.ts
git add packages/solvers
git commit -m "feat(solvers): add transparent deterministic optimizer"
```

### Task 4: Implement the sourced AI research solver

**Files:**
- Create: `packages/solvers/src/ai/research.ts`
- Create: `packages/solvers/src/ai/prompt.ts`
- Create: `packages/solvers/src/ai/evidence.ts`
- Create: `packages/solvers/src/ai/solver.ts`
- Create: `packages/solvers/test/ai-solver.test.ts`
- Create: `packages/solvers/evals/cases.json`
- Create: `packages/solvers/evals/run.ts`

**Interfaces:**
- Produces `createAiResearchSolver(client: OpenAI, signer: Account): Solver`.
- Produces `ResearchResultSchema` containing sourced risk flags and an allocation recommendation, never calldata.

- [ ] **Step 1: Test the model boundary with a test double**

Test refusal, malformed output, absent citations, non-HTTP citations, candidate
IDs outside the snapshot, critical risk, timeout, and successful typed output.
The test double is constructor-injected and has no runtime registration path.

- [ ] **Step 2: Implement the Responses API call**

Use model `gpt-5.6-terra`, `reasoning.effort: "medium"`, built-in
`{ type: "web_search" }`, and structured output parsed by Zod. The prompt must
state the immutable candidate IDs and numbers, restrict research to protocol
security/governance/audits/incidents, and require at least two independent URLs
for any `high` or `critical` flag.

- [ ] **Step 3: Convert research to a bundle deterministically**

Discard any model-supplied amounts or APY calculations. Map only valid risk flags
and the recommended candidate ID into the same integer allocation builder used
by the deterministic solver. Extract cited URLs and hash the exact evidence
claims before signing.

- [ ] **Step 4: Create a ten-case evaluation set**

Include stale audit, recent exploit, paused reserve, governance parameter change,
unsupported token, conflicting sources, irrelevant search results, prompt
injection in a webpage, no material risk, and source outage. Each case defines
allowed candidate, required flags, forbidden claims, and executable expectation.

- [ ] **Step 5: Run live evaluations with a cost cap**

```bash
OPENAI_MODEL=gpt-5.6-terra pnpm --filter @cobia/solvers eval --max-cases 10 --max-usd 10
```

Expected: all schema/security assertions pass; at least 8/10 semantic cases pass.
Any missed critical-risk case blocks launch.

- [ ] **Step 6: Commit**

```bash
git add packages/solvers
git commit -m "feat(solvers): add sourced ai research competitor"
```

### Task 5: Prove solver independence and failure behavior

**Files:**
- Create: `packages/solvers/test/competition.test.ts`
- Create: `docs/evidence/solver-evaluation.md`

**Interfaces:**
- Validates existing solver interfaces without adding production behavior.

- [ ] **Step 1: Run both solvers against the same frozen snapshot**

Assert distinct solver IDs and signatures, identical policy/snapshot hashes,
independent evidence roots, and verifier-produced scores. Freeze inputs deeply
and fail on mutation.

- [ ] **Step 2: Demonstrate one rejected proposal**

Corrupt the AI bundle's amount after signing. Record the resulting
`SOLVER_SIGNATURE_INVALID` or `ACTION_AMOUNT_MISMATCH` verdict for the demo; do
not add a runtime corruption switch.

- [ ] **Step 3: Write evaluation evidence and commit**

```bash
pnpm --filter @cobia/solvers test
pnpm --filter @cobia/domain test
git add packages/solvers/test docs/evidence/solver-evaluation.md
git commit -m "test(solvers): validate competition and rejection paths"
```
