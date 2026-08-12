# Cobia Intent-First Product Implementation Plan

> **Execution:** Use `superpowers:test-driven-development`, implement tasks in
> order, and run `superpowers:verification-before-completion` before each
> checkpoint. The approved product specification is
> `docs/superpowers/specs/2026-08-12-intent-first-product-design.md`.

**Goal:** Replace the current form/card flow with an outcome-first route
comparison, current-state simulation, and capped atomic X Layer execution while
building the trusted route-graph boundary needed for open-ended agentic search.

**Architecture:** UI modes compile to typed policies. Solvers consume one
immutable graph snapshot and produce route IR only. A deterministic compiler,
independent verifier, full-route simulator, and capped executor remain the only
execution authority. The model may write ephemeral strategy code in a sandbox,
but never raw executable calldata.

**Related backend plan:**
`docs/superpowers/plans/2026-08-12-verified-adapter-market.md`

## Global constraints

- No mock route, APY, balance, gas, or protocol data in production code.
- Green means enforceable or verified; amber means estimate; red means failed.
- Protocol forecasts never become on-chain minimums.
- Every new source file stays under 300 lines.
- Use real token and protocol assets with accessible text fallbacks.
- Preserve the current V2 Earn path until the corresponding generalized policy
  and verifier exist; never coerce Swap or Profit into an Earn policy.

## Task 1: Product shell and identity assets

**Files:**

- Modify: `apps/web/components/layout/AppHeader.tsx`
- Modify: `apps/web/components/layout/AppHeader.test.tsx`
- Modify: `apps/web/components/brand/CobiaLogo.tsx`
- Create: `apps/web/components/brand/AssetMark.tsx`
- Create: `apps/web/components/brand/ProtocolMark.tsx`
- Create: `apps/web/components/brand/brand-marks.test.tsx`
- Add: sourced brand assets under `apps/web/public/brands/`
- Modify: `apps/web/app/globals.css`

- [ ] Write failing header tests for `New intent`, `Positions`, and `Activity`,
  active-route semantics, block-aware X Layer status, theme toggle, and wallet.
- [ ] Write failing mark tests for USDG, USDt0, Aave, Curve, Uniswap, and an
  accessible neutral fallback.
- [ ] Implement the compact approved shell with semantic light/dark tokens.
- [ ] Document every brand asset source and license in
  `apps/web/public/brands/README.md`.
- [ ] Run header/brand tests, targeted ESLint, and typecheck.

## Task 2: Outcome composer

**Files:**

- Create: `apps/web/components/intents/IntentComposer.tsx`
- Create: `apps/web/components/intents/IntentComposer.test.tsx`
- Create: `apps/web/components/intents/IntentModeTabs.tsx`
- Create: `apps/web/components/intents/IntentReceipt.tsx`
- Modify: `apps/web/components/request/PolicyForm.tsx`
- Modify: `apps/web/components/request/PolicyForm.test.tsx`
- Modify: `apps/web/app/requests/new/page.tsx`
- Modify: `apps/web/app/styles/request.css`

- [ ] Write failing tests for the Earn composer: natural-language field,
  token mark, amount, balance, advanced bounds, wallet state, visible parsed
  receipt, one signature, and request submission.
- [ ] Write failing tests proving Swap and Profit cannot submit an Earn policy.
- [ ] Implement mode selection as truthful typed states. Until Task 6 lands,
  unavailable modes explain the missing atomic policy without producing a
  request.
- [ ] Replace protocol-prescriptive copy with outcome language.
- [ ] Preserve the existing V2 Earn signature and API envelope exactly.
- [ ] Run focused form/page tests, ESLint, typecheck, and keyboard checks.

## Task 3: Live route comparison

**Files:**

- Create: `apps/web/components/routes/RouteComparison.tsx`
- Create: `apps/web/components/routes/RouteComparison.test.tsx`
- Create: `apps/web/components/routes/RoutePath.tsx`
- Create: `apps/web/components/routes/RouteOutcome.tsx`
- Create: `apps/web/lib/markets/route-presentation.ts`
- Create: `apps/web/lib/markets/route-presentation.test.ts`
- Modify: `apps/web/components/request/CompetitionView.tsx`
- Modify: `apps/web/components/request/CompetitionView.v2.test.tsx`
- Replace: `apps/web/components/request/CompetitionView.module.css`

- [ ] Write pure presentation tests that derive input, exact minimum received,
  estimated result, forecast APY, route steps, and protocol marks from persisted
  V2 policy, snapshot, bundle, and quote artifacts.
- [ ] Mutation-test wrong asset, amount, action order, quoted/minimum output,
  horizon, authorization, expiry, and solver identity.
- [ ] Write component tests for one expanded best route, compact alternatives,
  active/expired states, selection, paid reveal, and no-route recovery.
- [ ] Implement objective-first ranking display without changing repository
  ordering or payment behavior.
- [ ] Move commitments, risk evidence, fees, and raw verification into one
  collapsed technical-details section.
- [ ] Remove the empty Explore destination from the primary journey; market
  history remains reachable from Activity or a secondary link.
- [ ] Run all request, market, payment, and purchased-route suites.

## Task 4: Simulation result UX

**Files:**

- Create: `apps/web/components/simulation/SimulationSummary.tsx`
- Create: `apps/web/components/simulation/SimulationSummary.test.tsx`
- Create: `apps/web/components/simulation/BalanceDelta.tsx`
- Modify: purchased-route rehearsal components and tests
- Modify: simulation evidence persistence/API after the related adapter plan

- [ ] Write failing tests for before/after token and position balances, exact
  minimums, gas, route calls, block identity, freshness countdown, and failures.
- [ ] Require canonical `SimulationEvidenceV1`; do not infer output from APY.
- [ ] Replace `Fork rehearsal` as the primary action with `Run final simulation`.
  Historical fork evidence remains available as secondary technical evidence.
- [ ] Invalidate the action on stale block, registry, wallet, nonce, balance,
  allowance, target identity, or policy.
- [ ] Run unit, disposable-fork, accessibility, and visual regression checks.

## Task 5: Atomic mainnet execution product path

**Files:**

- Modify: `contracts/src/CobiaAdapterRegistry.sol`
- Modify: `contracts/src/CobiaExecutorV1.sol`
- Add or modify Foundry tests under `contracts/test/`
- Extend: `apps/web/lib/atomic-execution/`
- Create: atomic execution API and persistence migration
- Create: atomic execution UI and recovery tests

- [ ] Add failing contract tests for EIP-1967 implementation pinning, registry
  version drift, simulation commitment drift, pause, wallet allowlist, route,
  daily-wallet and cumulative caps, reentrancy, native value, and nonce replay.
- [ ] Pin proxy shell and implementation code hashes in registry permissions.
- [ ] Persist a complete atomic attempt before wallet submission and the hash
  immediately after submission; make retry recovery idempotent.
- [ ] Require a current full-route simulation and verifier authorization whose
  hashes exactly match the route sent to the executor.
- [ ] Display one `Execute on X Layer` transaction with spend, minimum receive,
  expected receive, gas, expiry, and every step before wallet confirmation.
- [ ] Deploy only to a reproducible local/fork lane first, then X Layer mainnet
  paused, source-verify, configure multisig controls, run funded capped canaries,
  and unpause selected wallets only after reconciliation succeeds.
- [ ] Run contract unit/fuzz/invariant, fork, web integration, and canary checks.

## Task 6: Generalized intent policies

**Files:**

- Create: `packages/domain/src/intent-v3.ts`
- Create: `packages/domain/test/intent-v3.test.ts`
- Create: `packages/domain/src/route-ir-v1.ts`
- Create: `packages/domain/test/route-ir-v1.test.ts`
- Modify: request API, persistence, MCP, and UI unions

- [ ] Define a strict discriminated union for Earn, Swap, and Atomic Profit.
- [ ] Earn commits input, horizon, risk/adapter bounds, and minimum immediate
  exit value; forecast yield remains separate.
- [ ] Swap commits input/output assets, spend, recipient, deadline, and minimum
  exact output.
- [ ] Atomic Profit commits start/end valuation authority, maximum spend, minimum
  final wallet gain, temporary-liquidity repayment, deadline, and gas treatment.
- [ ] Reject route classes whose guarantee semantics cannot satisfy the selected
  policy; bridges use a future settlement-policy union, not this atomic union.
- [ ] Add compatibility parsing for persisted V1/V2 reads without weakening new
  writes.
- [ ] Run domain mutation suites and all HTTP/MCP ingress tests.

## Task 7: Agentic strategy harness

**Files:**

- Create: `packages/solvers/src/harness/`
- Create: `packages/solvers/test/harness/`
- Create: `apps/web/lib/solver-sandbox/`
- Extend: route graph and manifest modules from the related adapter plan

- [ ] Define immutable tools for graph inspection, valuation, gas, constraints,
  candidate simulation, and failure diagnostics.
- [ ] Run model-authored TypeScript/WASM strategy code in a CPU, memory, time,
  filesystem, tool, and network-limited sandbox with no secrets or write access.
- [ ] Accept only canonical route IR using registered opportunity and adapter
  IDs. Reject model-authored targets, calldata, addresses, evidence, prices, or
  simulation claims.
- [ ] Let the agent iterate: propose, compile, simulate, inspect failure, revise,
  rank, and explain. Record code hash, tool transcript, candidate IDs, model, and
  cost without persisting hidden chain credentials.
- [ ] Allow unsupported-protocol research to emit a non-executable adapter
  proposal and test bundle; activation requires separate review and registry
  governance.
- [ ] Add adversarial tests for secret reads, network escape, infinite loops,
  resource exhaustion, prompt injection, raw calldata, unknown adapters,
  fabricated evidence, changed amounts, and verifier bypass attempts.

## Task 8: Proactive wallet scout

**Files:**

- Create: wallet preference and notification domain schemas
- Create: `apps/web/lib/scout/`
- Create: Scout API, persistence migration, and worker
- Create: Scout settings, opportunity inbox, and notification components

- [ ] Write read-only wallet snapshot tests for supported balances, positions,
  gas reserve, block identity, and RPC failure.
- [ ] Match candidates only after reveal fee, estimated gas, slippage, and saved
  minimum improvement are applied; mutation-test every bound.
- [ ] Deduplicate by wallet, policy template, route commitment, and cooldown.
- [ ] Make server monitoring explicit opt-in with retention, disable, and delete
  controls; default to local analysis where practical.
- [ ] Deliver an in-app opportunity first. Add web push/email only through
  separately verified consent and unsubscribe flows.
- [ ] Prefill a reviewable intent from the alert; never create a signature or
  transaction in the worker.

## Task 9: Evidence-backed X marketing agent

**Files:**

- Create: public claim policy and redaction tests
- Create: evidence-to-draft generator
- Create: X API client and scheduled-post queue after current API verification
- Create: marketing approval UI and audit log

- [ ] Accept only public, cited release/deployment/aggregate evidence; reject
  wallet-level data, unsupported APY/safety claims, secrets, and private URLs.
- [ ] Generate platform-aware drafts, link previews, route cards, and threads
  with source evidence attached for reviewer inspection.
- [ ] Require human approval initially. Persist editor, exact final copy,
  evidence hashes, schedule, API response, and deletion/correction status.
- [ ] Add rate-limit, token rotation, retry/idempotency, duplicate-post, revoked
  credential, and global kill-switch tests.
- [ ] Permit later auto-posting only for allowlisted factual event templates;
  performance, yield, safety, or user-result claims remain approval-only.

## Task 10: Production verification and launch gate

- [ ] Run web unit, database integration, fork, typecheck, lint, production
  build, dependency audit, Drizzle check, and `git diff --check`.
- [ ] Run contract unit/fuzz/invariant plus fixed-fork atomic acceptance.
- [ ] Run accessibility and visual QA in light/dark desktop and mobile against
  the approved reference; save `design-qa.md` with `final result: passed`.
- [ ] Validate CSP and security headers, RPC failover, rate limiting, error
  tracking, database restore, pause/unpause, signer rotation, cap exhaustion,
  and settlement reconciliation in staging.
- [ ] Publish only after an independent contract/application review and a funded
  capped canary produce matching transaction, receipt, event, balance, and
  postcondition evidence.
