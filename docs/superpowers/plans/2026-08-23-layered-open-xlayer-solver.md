# Layered Open X Layer Solver Plugins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the X Layer solver research and construct a broad range of bounded transaction programs while deepening its Aave, Curve, Uniswap, native-OKB, and OKX plugins for common DeFi position intents.

**Architecture:** Keep the existing transaction-program raw-call lane as the open proposal Interface. Deterministic plugin planners provide fast common paths; the Codex worker may use live research and installed plugins when those planners abstain. Independent existing verifiers remain authoritative. The separately owned general-asset/ERC-20 V4 implementation is an integration dependency and is not modified here.

**Tech Stack:** Node.js 24+, pnpm 11.20.0, TypeScript 6.0.3, Zod 4.4.3, viem 2.55.11, Vitest 4.1.10, Codex SDK, Foundry/Anvil pinned X Layer forks

**Spec:** `docs/superpowers/specs/2026-08-23-layered-open-xlayer-solver-design.md`

## Global Constraints

- Do not modify or stage general-asset V4 domain, verifier, contract, execution-v4, test, or deployment work owned by the concurrent thread.
- First release targets X Layer chain `196`.
- Novel calls may use the existing `evm.raw@1` transaction-program lane; plugin recognition is not an admission requirement.
- Solver plugin capabilities are signed operator declarations, not runtime attestations or transaction authority.
- The solver has no wallet keys, solver signing keys, transaction-send methods, or credential-bearing RPC output.
- Semantic modules must bind exact owner, target, selector, asset, recipient, amount, deadline, and post-state invariants.
- Ranking uses verified objective evidence and never rewards a plugin label by itself.
- Use strict TDD, adversarial tests, surgical commits, and the 300 LOC soft file limit.
- Mainnet principal execution or canaries require separate explicit authorization.

---

### Task 1: Open solver research and lifecycle

**Files:**
- Modify: `examples/open-solver/src/codex-job.ts`
- Modify: `examples/open-solver/src/codex-runner.ts`
- Modify: `examples/open-solver/src/codex-events.ts`
- Modify: `examples/open-solver/src/index.ts`
- Test: `examples/open-solver/test/codex-job.test.ts`
- Test: `examples/open-solver/test/codex-runner.test.ts`
- Test: `examples/open-solver/test/solver-run.test.ts`

**Interfaces:** The first Codex turn may research after the curated planner abstains. Host events project `accepted | researching | constructing | replaying | submitted | abstained | failed` without exposing prompts or reasoning.

- [ ] **Step 1: Write failing harness tests** proving the first prompt permits live web research, does not require immediate abstention, retains secret/send-method prohibitions, and emits lifecycle transitions from host-observed events.

```ts
expect(job.prompt).toContain("Use live web research");
expect(job.prompt).not.toContain("return its canonical abstention immediately");
expect(events).toContainEqual({ event: "solver-phase", phase: "researching" });
```

- [ ] **Step 2: Run RED:** `pnpm --filter @cobia/example-open-solver exec vitest run test/codex-job.test.ts test/codex-runner.test.ts test/solver-run.test.ts`.
- [ ] **Step 3: Replace contradictory guidance** with one bounded research contract and derive lifecycle phases from thread/tool/replay/decision events.
- [ ] **Step 4: Run GREEN:** focused tests and `pnpm --filter @cobia/example-open-solver typecheck`.
- [ ] **Step 5: Commit:** `git commit -m "feat(solver): open bounded transaction research"`.

### Task 2: Operator-declared capability families and plugin discovery

**Files:**
- Modify: `examples/open-solver/src/route-tool.ts`
- Modify: `examples/open-solver/src/route-mcp-server.ts`
- Modify: `examples/open-solver/src/index.ts`
- Modify: `apps/web/components/solvers/SolverDirectory.tsx`
- Modify: `apps/web/components/solvers/SolverProfileView.tsx`
- Test: matching open-solver and component tests

**Interfaces:** `REFERENCE_CAPABILITIES` preserves action IDs and adds `general.evm-program@1`, `aave-v3.positions@1`, `curve-stableswap-ng.liquidity@1`, `uniswap-v3.swaps@1`, `uniswap-v3.positions@1`, `xlayer.native-okb@1`, and `okx.dex-routing@1`. UI labels them “operator declared.”

- [ ] **Step 1: Write failing registration/tool/UI tests** for sorted unique family claims, open-lane discovery, compatibility action IDs, and declaration copy.
- [ ] **Step 2: Run RED:** focused route-tool, registration, directory, and profile tests.
- [ ] **Step 3: Add capability families and presentation metadata** without changing solver eligibility or objective ranking.
- [ ] **Step 4: Run GREEN:** focused tests and web/open-solver typechecks.
- [ ] **Step 5: Commit:** `git commit -m "feat(solvers): declare protocol plugin families"`.

### Task 3: Native OKB and OKX route construction

**Files:**
- Create: `examples/open-solver/src/native-okb.ts`
- Create: `examples/open-solver/src/okx-route.ts`
- Modify: `examples/open-solver/src/strategy.ts`
- Modify: `packages/solvers/src/okx/manifest.ts`
- Modify: `packages/solvers/src/okx/verifier.ts`
- Test: `examples/open-solver/test/native-okb.test.ts`
- Test: `examples/open-solver/test/okx-route.test.ts`
- Test: `packages/solvers/test/okx-swap-verifier.test.ts`

**Interfaces:** Produces exact raw transaction stages for canonical WOKB wrap/unwrap and verified OKX exact-input routes. Provider artifacts remain inputs to independent transaction-program verification.

- [ ] **Step 1: Write failing tests** for canonical WOKB identity, exact native value, owner recipient, zero unexpected residue, OKX chain/target/selector/token/amount/receiver binding, and output floors.
- [ ] **Step 2: Run RED:** focused open-solver and solver verifier tests.
- [ ] **Step 3: Implement WOKB and OKX route builders** from pinned immutable context; never accept an unbound provider target or calldata.
- [ ] **Step 4: Add pinned-fork regressions** for `USDG -> OKB` and `OKB -> USDG` when liquidity exists.
- [ ] **Step 5: Run GREEN:** focused tests, typechecks, and configured fork tests.
- [ ] **Step 6: Commit:** `git commit -m "feat(solver): support verified native OKB routes"`.

### Task 4: Full Aave position plugin

**Files:**
- Create: `examples/open-solver/src/aave-position-actions.ts`
- Create: `examples/open-solver/src/aave-position-strategy.ts`
- Extend: `examples/open-solver/skills/xlayer-aave-v3/SKILL.md`
- Create: `apps/web/lib/capabilities/aave-withdraw.ts`
- Create: `apps/web/lib/capabilities/aave-borrow.ts`
- Create: `apps/web/lib/capabilities/aave-repay.ts`
- Create: `apps/web/lib/capabilities/aave-controls.ts`
- Modify: capability manifest and registry
- Test: colocated tests and pinned Aave fork tests

**Interfaces:** Adds withdraw, variable borrow, repay, repay-with-aTokens, collateral toggle, and eMode. Every action exposes exact spend/output/debt/receipt effects and owner-only setup requirements.

- [ ] **Step 1: Write failing tests** for owner/on-behalf-of substitution, stable-rate misuse, excessive debt, delegation mismatch, unhealthy withdraw/borrow, collateral-disable risk, and successful variable-debt lifecycle.
- [ ] **Step 2: Run RED:** focused capability and strategy tests.
- [ ] **Step 3: Implement typed action builders and Modules** using pinned Aave Pool, data-provider, oracle, aToken, and variable-debt identities.
- [ ] **Step 4: Extend the skill** with exact supported actions, required setup, semantic bounds, and abstention conditions.
- [ ] **Step 5: Add pinned-fork regressions** for `aXlrUSDG -> USDG`, `aXlrUSDG -> OKB`, supply, borrow, repay, and safe withdraw.
- [ ] **Step 6: Run GREEN:** focused tests, typechecks, and fork tests.
- [ ] **Step 7: Commit:** `git commit -m "feat(aave): support verified position lifecycle"`.

### Task 5: Curve liquidity plugin

**Files:**
- Create: `apps/web/lib/capabilities/curve-add-liquidity.ts`
- Create: `apps/web/lib/capabilities/curve-remove-liquidity.ts`
- Create: `examples/open-solver/src/curve-liquidity-strategy.ts`
- Extend: `examples/open-solver/skills/xlayer-curve/SKILL.md`
- Modify: `apps/web/lib/capabilities/manifest.ts`
- Modify: `apps/web/lib/capabilities/registry.ts`
- Test: `apps/web/lib/capabilities/curve-add-liquidity.test.ts`
- Test: `apps/web/lib/capabilities/curve-remove-liquidity.test.ts`
- Test: `examples/open-solver/test/curve-liquidity-strategy.test.ts`

**Interfaces:** Adds balanced/imbalanced add liquidity, proportional removal, and single-coin removal with exact pool, coin order, receiver, LP mint/burn, and token minimums.

- [ ] **Step 1: Write failing tests** for pool/implementation drift, coin-order substitution, excessive token spend, receiver substitution, weak LP mint floor, and weak removal minima.
- [ ] **Step 2: Run RED:** focused Curve tests.
- [ ] **Step 3: Implement deep Curve Modules and planner** using factory/pool identity at the signed block.
- [ ] **Step 4: Extend the skill and add pinned-fork LP entry/exit replays.**
- [ ] **Step 5: Run GREEN:** focused tests, typechecks, and fork tests.
- [ ] **Step 6: Commit:** `git commit -m "feat(curve): support verified liquidity lifecycle"`.

### Task 6: Uniswap swap and NFT position plugins

**Files:**
- Create: `apps/web/lib/capabilities/uniswap-exact-output.ts`
- Create: `apps/web/lib/capabilities/uniswap-multihop.ts`
- Create: `apps/web/lib/capabilities/uniswap-position-mint.ts`
- Create: `apps/web/lib/capabilities/uniswap-position-liquidity.ts`
- Create: `apps/web/lib/capabilities/uniswap-position-collect.ts`
- Create: `examples/open-solver/src/uniswap-position-strategy.ts`
- Extend: `examples/open-solver/skills/xlayer-uniswap-v3/SKILL.md`
- Modify: `apps/web/lib/capabilities/manifest.ts`
- Modify: `apps/web/lib/capabilities/registry.ts`
- Test: matching colocated capability tests
- Test: `examples/open-solver/test/uniswap-position-strategy.test.ts`

**Interfaces:** Adds exact-output and multi-hop swaps plus mint, increase, decrease, collect, and burn for exact position NFT token IDs.

- [ ] **Step 1: Write failing swap tests** for factory-derived pool paths, fee tiers, owner recipient, input ceiling, output floor, deadline, and price limits.
- [ ] **Step 2: Write failing position tests** for NFT ownership/approval, ticks, liquidity deltas, token minima, collect recipient, and intentional empty-position burn.
- [ ] **Step 3: Run RED:** focused Uniswap tests.
- [ ] **Step 4: Implement swap and position Modules/planner** and extend the skill with exact setup and risk boundaries.
- [ ] **Step 5: Add pinned-fork swap and NFT lifecycle replays.**
- [ ] **Step 6: Run GREEN:** focused tests, typechecks, and fork tests.
- [ ] **Step 7: Commit logical groups:** `feat(uniswap): support verified swap routes` and `feat(uniswap): support verified position lifecycle`.

### Task 7: Integration, readiness, deployment, and push

**Files:**
- Modify: `apps/web/lib/open-exchange/transaction-verifier.ts` only if a new provider verifier must be routed
- Modify: `examples/open-solver/README.md`
- Modify: `examples/open-solver/compose.yaml`
- Create: `docs/evidence/layered-open-xlayer-solver-readiness.md`

**Interfaces:** Produces a deployed solver that researches novel routes, advertises declared plugin families, and submits only schema-valid proposals for independent verification.

- [ ] **Step 1: Run focused regression matrix** for simple swaps, Aave receipt exits, debt lifecycle, Curve liquidity, and Uniswap NFT lifecycle.
- [ ] **Step 2: Run complete non-V4 gates:** affected package tests, typechecks, lint, build, configured pinned X Layer forks, and `git diff --check` under Node 24+.
- [ ] **Step 3: Write readiness evidence** with exact commands, counts, fork blocks, revisions, and any external canary boundary.
- [ ] **Step 4: Reconcile `main` with `origin/main` while preserving the concurrent V4 work, push only logical solver/plugin commits, deploy the solver and affected web build, then verify registration, heartbeat, lifecycle events, and production health.**
- [ ] **Step 5: Do not broadcast principal or perform a wallet canary without separate explicit authorization.**
