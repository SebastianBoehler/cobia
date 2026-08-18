# General Intent Product Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Earn/Swap/Profit marketplace with one production-shaped general-intent app that signs explicit policy bounds, runs verified solver competitions, exposes current and historical solver evidence, and keeps execution wallet-controlled.

**Architecture:** Introduce a clean V2 intent contract and new generic persistence tables rather than adapting old market/quote records. Standing challenges remain discoverable across rolling bounded rounds; custom intents bind wallet-specific authority. The web app stores immutable solver revisions and verifier artifacts, derives current/history views deterministically, and projects only fresh custom-intent attestations into V3 execution. Old product routes and runtime code are removed; old database rows remain inaccessible audit records.

**Tech Stack:** TypeScript 6, Next.js 16 App Router, React 19, Zod 4, viem, Drizzle/PostgreSQL, Vitest/Testing Library, Solidity/Foundry, Vercel.

**Spec:** `docs/superpowers/specs/2026-08-18-general-intent-product-design.md`

## Global Constraints

- Keep every implementation file below 300 LOC; split orchestration, schemas, views, and formatting.
- Start each behavior task with the named failing test and observe the expected failure.
- No `/requests`, `/markets`, `/routes`, Earn/Swap/Profit compatibility UI, redirect, or data adapter.
- Do not copy old quote rows into the new model. Retain old database tables only as inaccessible audit evidence.
- Do not add solver hosting, public submission, package installation, queues, bonding, or admission APIs.
- Do not add an LLM drafting endpoint in this slice. The user's goal is signed display context; authority comes only from the reviewed typed receipt.
- A standing challenge may be long-lived; a solver revision, quote, snapshot, replay, or authorization may not be perpetual.
- Never expose a private key, credential-bearing RPC, wallet handle, signing method, or production send method to agent code.
- Only independently reproduced and attested current revisions can expose execution controls.
- Do not push or deploy before the V3 Safe activation and independent chain-state readback pass.

---

## Task 1: Replace the policy contract with a signed general-intent V2

**Files:**
- Replace: `packages/domain/src/general-intent-policy.ts`
- Modify: `packages/domain/src/persisted.ts`
- Modify: `packages/domain/src/index.ts`
- Replace: `packages/domain/test/general-intent-policy.test.ts`
- Modify: `apps/web/lib/intents/general-policy.ts`
- Replace: `apps/web/lib/intents/general-policy.test.ts`

- [x] Write failing domain tests proving a V2 policy requires `displayGoal`, `competition.closesAt`, `competition.maxRevisionsPerSolver`, an enforceable post-state, and a supported capability list.
- [x] Add commitment tests proving any change to goal, close time, recipient/owner, input, capability, forbidden set, predicate, balance constraint, deadline, gas, or action bound changes the policy hash.
- [x] Add rejection tests for V1 input, unknown keys, ambiguous empty goals, close time after policy deadline, overlong competition windows, and unsorted capabilities/forbidden lists.
- [x] Run `pnpm --filter @cobia/domain exec vitest run test/general-intent-policy.test.ts`; the test failed because V2 did not exist.
- [x] Implement `GeneralIntentPolicyV2Schema` and make the general-intent persistence path accept V2 only:

```ts
export const GeneralIntentPolicyV2Schema = z.object({
  version: z.literal(2), kind: z.literal("general-onchain"),
  requestId: z.string().uuid(), displayGoal: z.string().trim().min(1).max(500),
  owner: AddressSchema, executionChainId: z.literal(196),
  nonce: HashSchema,
  createdAt: z.number().int().positive().safe(),
  deadline: z.number().int().positive().safe(),
  maxEvidenceAgeSec: z.number().int().min(30).max(900),
  manifestHash: HashSchema,
  competition: z.object({
    closesAt: z.number().int().positive().safe(),
    maxRevisionsPerSolver: z.number().int().min(1).max(20),
  }).strict(),
  input: z.object({ token: AddressSchema, maxAtomic: PositiveAtomicAmountSchema }).strict(),
  allowedCapabilities: z.array(CapabilitySchema).min(1).max(16),
  limits: GeneralIntentLimitsV2Schema,
  forbiddenTargets: z.array(AddressSchema).max(32),
  forbiddenAssets: z.array(AddressSchema).max(32),
  balanceConstraints: z.array(GeneralBalanceConstraintV2Schema).max(8),
  predicates: z.array(StaticPredicateV1Schema).max(8),
  objective: GeneralIntentObjectiveV2Schema,
}).strict();
```

- [x] Update the web builder to accept capability template IDs (`aave-supply`, `exact-input-swap`, `round-trip`) while emitting only verifier-owned capability/version pairs.
- [x] Run domain, solver, focused web suites and package typechecks; all are green (Node 23 emitted the expected repository engine warning for the Node 24 release gate).
- [ ] Commit: `feat(domain): define signed general intent v2`

## Task 2: Add a clean intent, solver, revision, and artifact store

**Files:**
- Create: `apps/web/lib/db/intent-schema.ts`
- Create: `apps/web/lib/db/solver-schema.ts`
- Create: `apps/web/lib/db/program-schema-v2.ts`
- Create: `apps/web/lib/db/challenge-schema.ts`
- Modify: `apps/web/lib/db/schema.ts`
- Create: `apps/web/drizzle/0013_general_solver_competitions.sql`
- Create: `apps/web/lib/db/general-competitions.integration.test.ts`

- [ ] Write failing integration tests for standing challenges, bounded challenge rounds, custom intent creation, solver identity registration, immutable revisions, supersession, verifier artifacts, expiry, deterministic latest-current selection, and rejection-code history.
- [ ] Test that revision replacement inserts a new row, never updates program/evidence hashes, never resurrects an expired revision, and never lets a rejected revision rank.
- [ ] Test migration behavior against an empty current model and an installation containing old tables; assert no legacy rows are copied and no audit table is dropped.
- [ ] Run `pnpm --filter @cobia/web exec vitest run --config vitest.integration.config.mts lib/db/general-competitions.integration.test.ts`; expect missing-schema failures.
- [ ] Add new tables: `cobia_challenges`, `cobia_challenge_rounds`, `cobia_intents`, `cobia_solvers`, `cobia_solver_submissions`, and `cobia_program_artifacts_v2`. Use check constraints for chain 196, lowercase addresses/hashes, positive revisions, bounded rounds, terminal timestamps, expiry, and state/error consistency.
- [ ] Store verifier-owned challenge templates without an owner, nonce, calldata, or authorization. A round submission references either a challenge round for discovery or a signed custom intent for execution, never both.
- [ ] Store solver profile claims separately from verifier-derived statistics. Require `solverId`, display name, operator kind, attestation address when community-operated, and declared capability IDs; do not seed invented solvers.
- [ ] Store `objectiveMeasurement` as a typed canonical JSON artifact hash rather than a mutable numeric column. Derive wins and acceptance rates from verdict/receipt rows.
- [ ] Generate and inspect Drizzle metadata, then rerun the focused integration test and web typecheck.
- [ ] Commit: `feat(db): store immutable solver competitions`

## Task 3: Build repositories and current-versus-history projections

**Files:**
- Create: `apps/web/lib/db/intents.ts`
- Create: `apps/web/lib/db/solver-submissions.ts`
- Create: `apps/web/lib/db/solver-profiles.ts`
- Create: `apps/web/lib/competitions/submission-state.ts`
- Create: `apps/web/lib/competitions/submission-state.test.ts`
- Create: `apps/web/lib/db/solver-projections.integration.test.ts`
- Create: `apps/web/lib/db/challenges.ts`

- [ ] Write failing unit tests for `current`, `expired`, `rejected`, `superseded`, and `executed` presentation states using explicit `observedAtSec`.
- [ ] Write failing integration tests that rank only each solver's newest fresh attested revision, preserve all older revisions in history, keep a standing challenge active after its round expires, count accepted/rejected outcomes from verifier evidence, and sort ties by canonical solver ID.
- [ ] Run both focused suites; expect missing repository/projection failures.
- [ ] Implement repository methods `createChallenge`, `openChallengeRound`, `createIntent`, `appendSubmission`, `appendArtifact`, `resolveSubmission`, `selectSubmission`, `listDiscover`, `listSolverProfiles`, and `readSolverProfile` with row locks around state transitions.
- [ ] Make state projection pure and deterministic. It must not read wall-clock time internally, trust solver rationale, or infer safety from an artifact's presence.
- [ ] Return explicit empty collections; propagate database/parsing errors instead of hiding them behind an empty marketplace.
- [ ] Rerun focused unit/integration tests and `pnpm --filter @cobia/web typecheck`.
- [ ] Commit: `feat(web): project solver revision history`

## Task 4: Move the coding-agent vertical slice onto the new competition model

**Files:**
- Modify: `apps/web/lib/orchestrator/run-general-coding-agent-market.ts`
- Modify: `apps/web/lib/runtime/general-coding-agent.ts`
- Create: `apps/web/lib/runtime/solver-catalog.ts`
- Replace: `apps/web/lib/orchestrator/run-general-coding-agent-market.test.ts`
- Create: `apps/web/app/api/intents/route.ts`
- Create: `apps/web/app/api/intents/route.test.ts`
- Create: `apps/web/app/api/intents/[intentId]/route.ts`
- Create: `apps/web/app/api/intents/[intentId]/route.test.ts`
- Create: `apps/web/app/api/programs/[submissionId]/route.ts`

- [ ] Write failing tests that a valid owner-signed V2 intent creates a bounded competition and one `cobia-coding-agent` revision, while a solver may abstain or fail without fabricating a submission.
- [ ] Test that wrong chain, owner, signature, manifest, competition time, capability, or policy hash fails before a sandbox job starts.
- [ ] Test a second revision is allowed only before close and within the signed revision cap; the first becomes superseded but remains readable.
- [ ] Test public responses sanitize shell paths, credentials, RPC URLs, private artifacts, and raw internal errors.
- [ ] Run the orchestrator and API tests; expect V1/legacy repository assertions to fail.
- [ ] Register only real coordinator-owned solvers in `solver-catalog.ts`. Keep the catalog separate from verifier capability manifests and do not add community admission.
- [ ] Persist the sandbox proposal, independent verdict, replay, provenance, authorization, and receipt against the immutable submission revision. The agent never writes its own accepted state.
- [ ] Return `202` for a running competition, explicit failure codes for rejected/failed submissions, and canonical `/intents/:id` plus `/programs/:submissionId` links.
- [ ] Rerun focused tests, the read-only RPC adversarial suite, and web typecheck.
- [ ] Commit: `feat(agent): publish verified program revisions`

## Task 5: Implement the hybrid goal and policy-receipt composer

**Files:**
- Create: `apps/web/app/intents/new/page.tsx`
- Create: `apps/web/app/intents/new/page.test.tsx`
- Create: `apps/web/components/intents/IntentComposer.tsx`
- Create: `apps/web/components/intents/IntentGoalInput.tsx`
- Create: `apps/web/components/intents/PolicyReceiptEditor.tsx`
- Create: `apps/web/components/intents/IntentComposer.test.tsx`
- Create: `apps/web/lib/intents/capability-templates.ts`
- Create: `apps/web/lib/intents/domain-examples.ts`

- [ ] Write failing UI tests proving the first control is “What should happen?”, no Earn/Swap/Profit tab exists, the user must explicitly choose a manifest-supported template, and the full typed receipt is visible before signing.
- [ ] Test available examples populate goal context, while rehearsal/designed examples are disabled, identify the missing capability, and cannot reach signature or API calls.
- [ ] Test “Use this challenge” copies only its human goal and capability-template parameters into an unsigned editor; it must generate a new request ID, owner, nonce, times, bounds, and signature and copy no submission artifact.
- [ ] Test invalid amount, unsupported asset, missing output, missing minimum, deadline, and disconnected/wrong-chain wallet focus the exact field and preserve the goal.
- [ ] Test wallet signature covers the rendered V2 policy commitment and signing text states that no funds or approvals move.
- [ ] Run `pnpm --filter @cobia/web exec vitest run components/intents/IntentComposer.test.tsx app/intents/new/page.test.tsx`; expect missing-component failures.
- [ ] Implement a two-stage composer: free-form display goal, then an explicit capability template and editable canonical receipt. Do not parse prose into hidden financial bounds.
- [ ] Keep `IntentComposer.tsx` as state/submit orchestration only; put field groups and examples in separate files so each remains below 300 LOC.
- [ ] Rerun focused tests and web typecheck.
- [ ] Commit: `feat(web): add general intent composer`

## Task 6: Build intent competition, program, Discover, and solver-history surfaces

**Files:**
- Create: `apps/web/app/intents/[intentId]/page.tsx`
- Create: `apps/web/components/competitions/IntentCompetitionView.tsx`
- Create: `apps/web/components/competitions/SubmissionRevisionCard.tsx`
- Modify: `apps/web/app/programs/[programId]/page.tsx`
- Modify: `apps/web/components/agent/AgentProgramView.tsx`
- Create: `apps/web/app/discover/page.tsx`
- Create: `apps/web/components/discover/DiscoverView.tsx`
- Create: `apps/web/app/solvers/page.tsx`
- Create: `apps/web/app/solvers/[solverId]/page.tsx`
- Create: `apps/web/components/solvers/SolverProfileView.tsx`
- Add focused `*.test.tsx` beside each view.

- [ ] Write failing competition tests for countdown, abstention, current leader, immutable revision history, rejection codes, expiry, close, and refresh without focus theft.
- [ ] Write failing Discover tests for Standing challenges, Custom intents, and Past discoveries; prove a challenge remains visible after round expiry, expired/superseded programs have no execution CTA, and “Use this challenge” carries no calldata, evidence, owner, nonce, signature, or wallet state.
- [ ] Write failing solver-profile tests for declared identity versus verifier-derived metrics, accepted/rejected/superseded history, wins, capabilities, evidence links, and a truthful empty state.
- [ ] Write failing program-view tests proving only a fresh attested revision for its exact owner/policy/program hash can expose V3 preparation; rejected, stale, superseded, wrong-owner, or reorged evidence cannot.
- [ ] Run focused view suites and observe the new route/component failures.
- [ ] Implement server loaders from the new repositories and compact responsive cards. Put provenance in a read-only disclosure labelled “Solver lab”; only the verifier card may say accepted/rejected.
- [ ] Keep historical timestamps, pinned block, expiry reason, and hashes visible; never show stale rows as rankable or executable.
- [ ] Rerun focused tests and web typecheck.
- [ ] Commit: `feat(web): expose discovery and solver history`

## Task 7: Replace the landing page, navigation, and visual system

**Files:**
- Create: `docs/design/2026-08-18-general-dapp-interface-audit.md`
- Modify: `apps/web/app/page.tsx`
- Create: `apps/web/components/home/GeneralIntentHero.tsx`
- Create: `apps/web/components/home/DomainCapabilityGrid.tsx`
- Create: `apps/web/components/home/TrustBoundary.tsx`
- Modify: `apps/web/components/layout/AppHeader.tsx`
- Modify: `apps/web/components/layout/AppHeader.test.tsx`
- Modify: `apps/web/app/globals.css`
- Replace: `apps/web/app/styles/landing.css`
- Create: `apps/web/app/not-found.tsx`
- Modify: `apps/web/app/site-metadata.ts`
- Modify: `apps/web/app/sitemap.ts`
- Modify: `apps/web/app/metadata.test.ts`

- [ ] Inspect the current desktop and mobile interfaces of Jumper, Jupiter, and one leading Ethereum app. Capture dated screenshots and document hierarchy, navigation, composer pattern, transaction review, state language, density, spacing, typography, color roles, accessibility, and patterns Cobia must not copy.
- [ ] Apply `better-ui`, `better-layout`, `better-colors`, `better-typography`, `better-writing`, and `better-accessibility` to convert the audit into Cobia-specific layout and content rules before editing components.
- [ ] Write failing landing/navigation tests for Intent, Portfolio, Activity, Discover, `/solvers` discovery links, general on-chain copy, domain truth labels, and absence of APY-first/Earn/Swap/Profit framing.
- [ ] Write a failing branded-not-found test with Intent and Discover actions and no framework 404 copy.
- [ ] Run the focused page, header, and metadata tests; expect old href/copy failures.
- [ ] Implement one neutral green-white/near-black surface system. Remove large blue page backgrounds; reserve cobalt for primary/selected/link/focus and green for independently verified state.
- [ ] Keep the desktop header quiet and add a fixed four-item mobile bottom navigation with `env(safe-area-inset-bottom)`, 44px targets, `aria-current`, and content padding that prevents overlap.
- [ ] Generalize metadata, manifest start URL, sitemap, Open Graph alt text, and terms copy without claiming unsupported commerce/x402/RWA execution.
- [ ] Run focused tests plus light/dark render inspection at 390x844 and 1440x900.
- [ ] Commit: `feat(web): redesign Cobia for general intents`

## Task 8: Remove the legacy product surface and unreachable code

**Files:**
- Delete: `apps/web/app/requests/**`
- Delete: `apps/web/app/markets/**`
- Delete: `apps/web/app/routes/**`
- Delete: `apps/web/app/api/requests/**`
- Delete: `apps/web/app/api/markets/**`
- Delete: `apps/web/app/api/routes/**`
- Delete: `apps/web/components/markets/**`
- Delete: `apps/web/components/request/**`
- Delete: `apps/web/components/routes/**`
- Delete legacy-only modules under `apps/web/lib/markets`, `apps/web/lib/payments`, and `apps/web/lib/execution-v2` after reachability proof.

- [ ] Add a route-manifest test that enumerates the supported product paths and asserts `/requests`, `/markets`, and `/routes` are absent.
- [ ] Run `rg -n '(/requests|/markets|/routes|Earn|Swap|Profit)' apps/web --glob '!drizzle/**'`; classify every remaining match as active low-level capability language, immutable migration history, or obsolete product code.
- [ ] Delete obsolete pages, components, APIs, payment/reveal UI, projections, and tests. Do not add redirects, adapters, fallback responses, or copied records.
- [ ] Retain route construction/verifier code only when imported by the active V3 capability verifier, pinned-fork replay, or deterministic control solver. Delete unreachable exports and prove with typecheck/tests.
- [ ] Run the route-manifest test, `pnpm --filter @cobia/web typecheck`, and all web unit tests; fix only real active-path breakage.
- [ ] Commit: `refactor(web): remove legacy marketplace surface`

## Task 9: Accessibility, responsive, and adversarial product verification

**Files:**
- Add focused tests beside touched components.
- Modify: `docs/architecture/coding-agent-sandbox-threat-model.md`
- Modify: `docs/deployment/x-layer-mainnet-agent-executor-v3.md`

- [ ] Add tests for keyboard order, field error focus, native disclosures, live-region restraint, text state labels, reduced motion, long commitments, mobile card conversion, and bottom-nav safe-area spacing.
- [ ] Add security tests for stale/reorged evidence, target/recipient/value/allowance expansion, wrong solver revision, mutable artifact conflicts, spoofed acceptance, expired competition, and owner mismatch at execution preparation.
- [ ] Run focused accessibility/security tests, then inspect real browser views in light/dark at mobile and desktop widths. Record screenshots outside the repository or in gitignored evidence.
- [ ] Update the threat model with the exact new persistence boundaries, revision rules, no-hosting limitation, unsupported-domain truth model, and residual risks.
- [ ] Update release docs with the new canonical paths and explicitly state that no production principal transaction is used as a deploy check.
- [ ] Commit: `test(web): harden general intent experience`

## Task 10: Full gates and timelocked release

- [ ] Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm contracts:test`, `pnpm audit --audit-level=high`, and `pnpm --filter @cobia/web test:integration`.
- [ ] Run the opt-in pinned X Layer Anvil suite with the configured read-only RPC and record exact test counts, block number/hash, trace hash, and pass/fail. Do not broadcast.
- [ ] Run `git diff --check`, inspect every tracked/untracked change, confirm every implementation file is below 300 LOC or document a justified split blocker, and scan for secrets/credential-bearing URLs.
- [ ] Before `2026-08-20T12:30:41Z`, stop after local verification. At or after it, ask the user to execute the retained Safe activation batch.
- [ ] Independently read chain 196 registry, V3 risk manager, executor, token bounds, capability identities, canary, pause state, and code hashes. Abort release on any mismatch.
- [ ] Apply migration `0013` through the approved production database path, verify schema checks, and confirm no legacy rows were copied or deleted.
- [ ] Rebase/merge safely onto current main without force-push, rerun changed gates, group any remaining changes into conventional commits, and push main.
- [ ] Deploy Vercel production, verify `https://getcobia.com` UI/API/mobile paths and security headers, and do not execute a principal mainnet transaction as a smoke test.
- [ ] Report exact commands, counts, deployed commit, live versus aspirational capabilities, and remaining limits before retail beta.

## Plan Self-Review

- [ ] Confirm every approved spec section maps to at least one task and test.
- [ ] Confirm the explicit no-backward-compatibility decision is reflected in routes, APIs, persistence reads, copy, and deletion steps.
- [ ] Confirm solver history distinguishes identity claims from verifier-derived outcomes and never makes historical calldata actionable.
- [ ] Scan for unfinished markers, invented records, compatibility branches, and unsupported production claims; remove every occurrence.
- [ ] Verify interface names are consistent across policy, persistence, API, UI, and execution tasks.
