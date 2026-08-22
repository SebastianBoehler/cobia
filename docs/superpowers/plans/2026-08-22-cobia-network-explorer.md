# Cobia Network Explorer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a public Cobia Network page and API that aggregate only confirmed, independently attributable X Layer intent outcomes into truthful network and per-solver metrics.

**Architecture:** A pure domain projector validates public outcome candidates and aggregates denominator-backed metrics. A web database repository converts executed intent/submission/artifact rows into those candidates, while a read-only API and server-rendered page expose the same projection. Existing solver performance remains authoritative and the public DTO never contains raw goals, signatures, policies, or full wallet addresses.

**Tech Stack:** TypeScript 6, Zod 4, Vitest 4, Drizzle ORM/PostgreSQL, Next.js 16 App Router, React 19, CSS Modules.

**Spec:** `docs/superpowers/specs/2026-08-22-cobia-network-explorer-design.md`

## Global Constraints

- Node.js 24+ and pnpm 11.20.0.
- Count owner principal once only after an executed winning submission has a valid chain-196 receipt.
- Require committed valuation evidence; token symbols alone never establish USD value.
- Attribute volume only to the selected winning solver.
- Return abbreviated owner labels only; never return raw goals, policies, signatures, or unfiltered receipts.
- Reuse Cobia's existing performance projection; add no composite solver score or mock/fallback data.
- Keep new files below the repository's 300 LOC soft limit.

---

### Task 1: Pure network outcome projection

**Files:**
- Create: `packages/domain/src/network-metrics.ts`
- Create: `packages/domain/test/network-metrics.test.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**
- Consumes: strict candidate values prepared by the web repository.
- Produces: `projectPublicOutcomeV1(input)`, `aggregateNetworkMetricsV1(input)`, `PublicOutcomeV1`, `NetworkMetricsV1`, and stable `NetworkExclusionReason` values.

- [ ] **Step 1: Write failing tests for strict confirmation, privacy, valuation, and one-time attribution**

Create fixtures with one selected chain-196 executed submission, a canonical transaction hash, `1_000_000` atomic principal, six decimals, and `100_000_000` USD-E8 price. Assert the output has `volumeUsdE8: "100000000"`, abbreviated owner, solver attribution, and no `displayGoal` or full owner field. Add cases for pending state, wrong chain, missing receipt, missing valuation, malformed amount, and two program stages sharing the same principal.

- [ ] **Step 2: Run the focused domain test and observe the missing module failure**

Run: `pnpm --filter @cobia/domain test -- network-metrics.test.ts`

Expected: FAIL because `network-metrics` is not exported.

- [ ] **Step 3: Implement strict schemas and projection**

Define a candidate containing only normalized repository inputs:

```ts
interface NetworkOutcomeCandidateV1 {
  intentId: string;
  submissionId: string;
  solverId: string;
  owner: string;
  chainId: number;
  state: string;
  selected: boolean;
  confirmedAtSec: number;
  transactionHash: string | null;
  intentClass: string;
  principal: { token: string; symbol: string; atomic: string };
  valuation: { decimals: number; priceUsdE8: string; blockNumber: string } | null;
  resultLabel: string;
}
```

Validate with Zod, return `{ outcome }` or `{ excluded: reason }`, compute USD-E8 as `atomic * price / 10**decimals`, and emit only `ownerLabel` using `0x1234…abcd`. Aggregate confirmed count, valued/unvalued counts, total USD-E8, and per-solver totals from already projected outcomes.

- [ ] **Step 4: Export the module and rerun focused tests**

Run: `pnpm --filter @cobia/domain test -- network-metrics.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the domain checkpoint**

```bash
git add packages/domain/src/index.ts packages/domain/src/network-metrics.ts packages/domain/test/network-metrics.test.ts
git commit -m "feat(domain): project verified network outcomes"
```

### Task 2: Database projection and public API

**Files:**
- Create: `apps/web/lib/db/network-outcomes.ts`
- Create: `apps/web/lib/db/network-outcomes.integration.test.ts`
- Modify: `apps/web/lib/runtime/market.ts`
- Create: `apps/web/app/api/network/route.ts`
- Create: `apps/web/app/api/network/route.test.ts`

**Interfaces:**
- Consumes: executed `cobia_intents`, selected `cobia_solver_submissions`, and `program`, `snapshot`, and `receipt` artifacts.
- Produces: `createNetworkOutcomeRepository(db).read({ window, limit, cursor, observedAtSec })` and `getNetworkOutcomeRepository()`.

- [ ] **Step 1: Write a failing disposable-PostgreSQL integration test**

Persist one executed capability-composition intent with a selected solver, `CapabilityProgramV2` input, `CapabilityCompositionSnapshotV1` valuation, and receipt artifact. Persist a second incomplete executed-shaped record without valid evidence. Assert the repository returns one outcome, exact network/per-solver volume, one exclusion reason, stable reverse chronology, and no raw goal/full owner in serialized output.

- [ ] **Step 2: Run the integration test and observe the missing repository failure**

Run: `pnpm --filter @cobia/web test:integration -- network-outcomes.integration.test.ts`

Expected: FAIL because `createNetworkOutcomeRepository` does not exist.

- [ ] **Step 3: Implement the repository projection**

Query executed intents and their selected submissions within `30d` or `all`, then fetch only `program`, `snapshot`, and `receipt` artifacts for those submission IDs. Parse capability programs with `CapabilityProgramV2Schema`, transaction programs with `TransactionProgramV1Schema`, composition snapshots with `CapabilityCompositionSnapshotV1Schema`, and open snapshots with `OpenIntentSnapshotV1Schema`. Derive one actual principal from the verified program and one committed valuation from the matching snapshot; otherwise send an unvalued or excluded candidate to the domain projector. Paginate projected outcomes with a validated submission-ID cursor after computing totals across the full window.

- [ ] **Step 4: Register the lazy runtime repository and rerun integration tests**

Run: `pnpm --filter @cobia/web test:integration -- network-outcomes.integration.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing API tests**

Mock `getNetworkOutcomeRepository().read`. Assert `GET /api/network?window=30d&limit=20` returns the repository payload with the shared 30-second cache policy. Assert invalid window, limit, or cursor returns `400 INVALID_NETWORK_QUERY`; repository failure returns `503 NETWORK_UNAVAILABLE` without fabricated totals.

- [ ] **Step 6: Implement the versioned read-only API and rerun its tests**

Run: `pnpm --filter @cobia/web test -- app/api/network/route.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the persistence/API checkpoint**

```bash
git add apps/web/lib/db/network-outcomes.ts apps/web/lib/db/network-outcomes.integration.test.ts apps/web/lib/runtime/market.ts apps/web/app/api/network/route.ts apps/web/app/api/network/route.test.ts
git commit -m "feat(web): expose verified network metrics"
```

### Task 3: Public Network page and navigation

**Files:**
- Create: `apps/web/components/network/NetworkOverview.tsx`
- Create: `apps/web/components/network/NetworkOverview.module.css`
- Create: `apps/web/components/network/NetworkOverview.test.tsx`
- Create: `apps/web/app/network/page.tsx`
- Create: `apps/web/app/network/page.test.tsx`
- Modify: `apps/web/components/layout/AppHeader.tsx`
- Modify: `apps/web/components/layout/AppHeader.test.tsx`
- Modify: `apps/web/components/layout/AppFooter.tsx`
- Modify: `apps/web/components/layout/AppFooter.test.tsx`
- Modify: `apps/web/components/buildx/JudgeEvidence.tsx`
- Modify: `apps/web/app/site-metadata.ts` only if the metadata registry requires a new canonical path.

**Interfaces:**
- Consumes: the exact result of `getNetworkOutcomeRepository().read` and existing solver-profile links.
- Produces: server-rendered `/network` plus discoverable navigation and BuildX evidence links.

- [ ] **Step 1: Write failing component and page tests**

Assert the rendered page contains `Every outcome, independently verified.`, confirmed outcomes, formatted verified USD volume, valued/unvalued labels, denominator-backed solver rows, and ledger links to `/programs/:id`, `/solvers/:id`, and the X Layer explorer. Assert empty and unavailable states never show zero-filled proof or sample rows. Assert no raw goal or full wallet is present.

- [ ] **Step 2: Run focused UI tests and observe missing components**

Run: `pnpm --filter @cobia/web test -- components/network app/network`

Expected: FAIL because the page and component do not exist.

- [ ] **Step 3: Implement the page and restrained proof-led presentation**

Render one headline, one metric strip, a row-based confirmed-outcome ledger, and a compact solver comparison. Format USD-E8 and token atomic amounts without floating-point arithmetic. Use cobalt for navigation, semantic colors only for evidence state, monospace hashes/amounts, and no chart unless multiple time buckets are later added. Catch repository failure in the server page and render the explicit unavailable variant.

- [ ] **Step 4: Update navigation, footer, BuildX evidence, and metadata tests**

Change the header item from `Solvers` to `Network` at `/network`, keep solver profiles active under the Network item, add footer links for both Network and solver directory, and link the BuildX evidence page to `/network`. Preserve the five-item main navigation count.

- [ ] **Step 5: Run focused UI and navigation tests**

Run: `pnpm --filter @cobia/web test -- components/network app/network AppHeader AppFooter JudgeEvidence metadata`

Expected: PASS.

- [ ] **Step 6: Commit the product checkpoint**

```bash
git add apps/web/app/network apps/web/components/network apps/web/components/layout apps/web/components/buildx/JudgeEvidence.tsx apps/web/app/site-metadata.ts
git commit -m "feat(web): add Cobia Network explorer"
```

### Task 4: Verification, browser QA, and publication

**Files:**
- Modify only files required to fix failures caused by Tasks 1-3.

**Interfaces:**
- Consumes: the complete feature.
- Produces: verified local build and pushed `main` checkpoint.

- [ ] **Step 1: Run the focused and complete verification gates**

```bash
pnpm --filter @cobia/domain test
pnpm --filter @cobia/web test
pnpm --filter @cobia/web test:integration
pnpm typecheck
pnpm lint
pnpm build
git diff --check
```

Expected: all commands pass under Node.js 24+.

- [ ] **Step 2: Run the application against production-shaped local data**

Use the repository's configured local environment and database. Open `/network` at desktop and narrow mobile widths. Verify navigation, metric definitions, empty/unavailable behavior, ledger overflow, abbreviated owners, and program/solver/explorer links. If no safe local database is configured, use test-owned fixture rendering and state that the browser check did not exercise live database rows.

- [ ] **Step 3: Review final truth boundaries and worktree state**

Search the rendered/source copy for `routed`, `TVL`, `revenue`, `guaranteed`, raw goals, and full fixture addresses. Confirm every displayed number comes from the server projection and inspect `git status --short` for unrelated concurrent work.

- [ ] **Step 4: Commit any verification-only corrections**

```bash
git add packages/domain/src/network-metrics.ts packages/domain/test/network-metrics.test.ts \
  apps/web/lib/db/network-outcomes.ts apps/web/lib/db/network-outcomes.integration.test.ts \
  apps/web/app/api/network apps/web/app/network apps/web/components/network \
  apps/web/components/layout/AppHeader.tsx apps/web/components/layout/AppHeader.test.tsx \
  apps/web/components/layout/AppFooter.tsx apps/web/components/layout/AppFooter.test.tsx \
  apps/web/components/buildx/JudgeEvidence.tsx apps/web/app/site-metadata.ts
git commit -m "fix(web): harden network explorer evidence"
```

Skip this commit when no correction is needed.

- [ ] **Step 5: Push the requested branch**

```bash
git push origin main
```

Expected: `origin/main` advances to the verified local `HEAD`.
