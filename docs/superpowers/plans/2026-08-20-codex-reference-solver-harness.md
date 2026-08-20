# Codex Reference Solver Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the deterministic reference strategy with a real Codex agent harness that reacts to signed intent events, uses versioned protocol skills and typed route tools, and returns untrusted canonical decisions for Cobia's independent verifier.

**Architecture:** `watchSolverIntents` remains the concurrent market subscriber. Each intent receives an isolated Codex workspace and thread; Codex may inspect the signed policy, call bounded route tools, optionally simulate candidates, and write one `SolverDecisionV1`. The host parses that output, signs the decision claim without exposing the key, and submits it; only Cobia's existing verifier decides acceptance.

**Tech Stack:** Node.js 24, TypeScript 6, `@openai/codex-sdk`, Zod 4, viem, Vitest, Codex skills, Docker Compose.

**Spec:** `../specs/2026-08-20-general-intent-solver-plugins-design.md`

## Global Constraints

- Codex never receives the solver private key, a user wallet, or a production send method.
- Fork replay and RPC simulation are optional solver research tools, not mandatory submission gates.
- Every final output is parsed by `SolverDecisionV1Schema`; malformed or missing output is an explicit job failure.
- The reference harness advertises only capabilities its installed tools can construct.
- A same-token round trip with no profitable route abstains as `NO_PROFITABLE_ROUTE`, not `NO_SUPPORTED_REFERENCE_ROUTE`.
- Protocol skills contain procedural guidance; executable facts come from pinned registries, live quote tools, and signed job data.
- Agent workspaces are isolated by intent id and contain no ambient application secrets.

---

### Task 1: Codex job contract and lifecycle

**Files:**
- Create: `examples/open-solver/src/codex-job.ts`
- Create: `examples/open-solver/src/codex-output.ts`
- Test: `examples/open-solver/test/codex-job.test.ts`

**Interfaces:**
- Consumes: `SolverIntentV1`, a job root, and the absolute route-tool command.
- Produces: `prepareCodexJob(input): Promise<CodexJob>` and `readCodexDecision(path): Promise<SolverDecisionV1>`.

- [ ] Write tests proving each intent gets its own owner-only workspace, exact `intent.json`, bounded `AGENTS.md`, installed skill links, and no private-key material.
- [ ] Run `pnpm --filter @cobia/example-open-solver test -- codex-job.test.ts` and confirm RED because the modules do not exist.
- [ ] Implement atomic job preparation and strict decision parsing with explicit missing/invalid-output errors.
- [ ] Re-run the focused test and confirm PASS.

### Task 2: Typed protocol route tool

**Files:**
- Create: `examples/open-solver/src/route-tool.ts`
- Create: `examples/open-solver/src/route-candidates.ts`
- Create: `examples/open-solver/src/route-decision.ts`
- Test: `examples/open-solver/test/route-tool.test.ts`

**Interfaces:**
- Consumes: an immutable `intent.json` plus command `capabilities`, `quote`, `build`, or `simulate`.
- Produces: JSON-only capability facts or a schema-valid `SolverDecisionV1` through the `capabilities` and `solve` commands.

- [ ] Write tests for Aave supply, Curve and Uniswap swaps, same-token round-trip ranking, registered RWA routing, optional simulation, and unsupported x402 intent outcomes.
- [ ] Confirm RED with the focused test.
- [ ] Extract the existing deterministic builders behind command handlers; add Uniswap candidate construction and compare both ordered round-trip paths using pinned quote readers.
- [ ] Return `NO_PROFITABLE_ROUTE` when every complete round trip violates the signed minimum increase.
- [ ] Keep x402 purchase construction in the registered commerce placement boundary; expose discovery facts without fabricating an open-intent program.
- [ ] Confirm PASS and run `pnpm --filter @cobia/example-open-solver typecheck`.

### Task 3: Codex SDK runtime

**Files:**
- Create: `examples/open-solver/src/codex-runner.ts`
- Create: `examples/open-solver/src/codex-events.ts`
- Create: `examples/open-solver/test/codex-runner.test.ts`
- Modify: `examples/open-solver/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: `CodexJob`, `CODEX_MODEL`, `CODEX_REASONING_EFFORT`, and Codex authentication from `CODEX_HOME` or `OPENAI_API_KEY`.
- Produces: `runCodexSolver(job, emit): Promise<SolverDecisionV1>` plus allowlisted lifecycle events containing thread id, model, phase, usage, and final state.

- [ ] Write a fake-thread test proving one thread per intent, streamed lifecycle handling, schema-based final output, timeout interruption, and no deterministic fallback.
- [ ] Confirm RED, install `@openai/codex-sdk`, and implement the smallest SDK adapter using workspace-write sandbox limited to the job root.
- [ ] Instruct Codex to use the installed Cobia skills and route tool, optionally simulate, and finish by writing `decision.json`.
- [ ] Confirm PASS and typecheck.

### Task 4: Market subscriber integration and operations

**Files:**
- Modify: `examples/open-solver/src/index.ts`
- Modify: `examples/open-solver/.env.example`
- Modify: `examples/open-solver/compose.yaml`
- Modify: `examples/open-solver/Dockerfile`
- Modify: `examples/open-solver/README.md`
- Test: `examples/open-solver/test/worker.test.ts`

**Interfaces:**
- Consumes: a fresh intent event and configured Codex runtime.
- Produces: one signed solver decision claim and durable job/thread metadata per handled intent.

- [ ] Write a worker test proving concurrent intents start independent Codex jobs while signing occurs only after schema validation.
- [ ] Confirm RED, inject the runner into `processIntent`, and declare Aave, Curve, Uniswap, raw EVM, RWA, and registered-commerce research capabilities accurately.
- [ ] Mount a persistent `CODEX_HOME`, document device login/API-key setup, configure an explicit model, and persist job artifacts below the solver state volume.
- [ ] Confirm PASS, typecheck, and build the Docker image.

### Task 5: Solver skills

**Files:**
- Create: `examples/open-solver/skills/cobia-intent/SKILL.md`
- Create: `examples/open-solver/skills/xlayer-aave-v3/SKILL.md`
- Create: `examples/open-solver/skills/xlayer-curve/SKILL.md`
- Create: `examples/open-solver/skills/xlayer-uniswap-v3/SKILL.md`
- Create: `examples/open-solver/skills/cobia-rwa/SKILL.md`
- Create: `examples/open-solver/skills/cobia-x402/SKILL.md`

**Interfaces:**
- Consumes: signed job JSON and the typed route-tool CLI.
- Produces: on-demand procedures that teach Codex how to inspect, quote, compose, optionally simulate, and emit a canonical decision.

- [ ] Add concise routing frontmatter and procedural steps that reference only the typed CLI and official protocol semantics.
- [ ] Validate every skill file has only `name` and `description` frontmatter and contains no addresses duplicated from the canonical registry.
- [ ] Add a focused skill-manifest assertion to `codex-job.test.ts` and confirm PASS.

### Task 6: Homepage animated-card cleanup

**Files:**
- Modify: `apps/web/components/home/RotatingIntentPrompt.tsx`
- Modify: `apps/web/components/home/RotatingIntentPrompt.test.tsx`
- Modify only if unused afterward: `apps/web/app/globals.css`

**Interfaces:**
- Consumes: rotating example goal text.
- Produces: the same animation without the unreadable top-right status label.

- [ ] Change the focused rendering test to reject the status copy.
- [ ] Confirm RED, remove the status field and element, then confirm PASS.

### Task 7: Live proof

**Files:**
- Runtime only: `examples/open-solver/.env`, Docker volume, production APIs.

**Interfaces:**
- Consumes: authenticated Codex runtime and a newly wallet-signed supported intent.
- Produces: worker lifecycle logs and either an independently verified proposal or a specific evidence-backed abstention.

- [ ] Run focused worker/web tests, package typechecks, and the production build.
- [ ] Authenticate Codex in the mounted runtime without committing auth material; start the worker and verify registration plus model identity in logs.
- [ ] Publish one fresh Aave or swap intent and verify the Codex job starts, produces a canonical candidate, and the competition page receives the verifier result.
- [ ] Publish one economically impossible round trip and verify `NO_PROFITABLE_ROUTE` is recorded without a fake proposal.
