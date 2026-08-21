# General Funding V4 Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair production compiler configuration and prepare deterministic, signer-free Executor V4 deployment and verification artifacts.

**Architecture:** Fail builds before runtime when required production configuration is absent, log only stable redacted error classes, and generate deterministic Safe artifacts separately from execution. Every external mutation remains an explicit stop point.

**Tech Stack:** Next.js 16, TypeScript 6, Vitest 4, Vercel CLI, viem 2, Safe Transaction Builder

**Spec:** `docs/superpowers/specs/2026-08-21-general-funding-executor-v4-design.md`

## Global Constraints

- Complete the V4 types, contracts, verifier, and product plans before deployment preparation.
- Never print or persist secret values in logs, fixtures, command output, or git.
- Production env mutation, deployment, Safe proposal, activation, routing, and canary spend require separate action-time approvals.
- Signer-free verifiers use public clients only and pin one canonical block.
- Keep each source file below 300 lines.

---

### Task 1: Repair compiler observability and production configuration gate

**Files:**
- Create: `apps/web/lib/observability/route-error.ts`
- Create: `apps/web/scripts/validate-production-env.mjs`
- Modify: `apps/web/app/api/intents/compile/route.ts`
- Modify: `apps/web/scripts/vercel-build.mjs`
- Test: `apps/web/app/api/intents/compile/route.test.ts`
- Test: `apps/web/scripts/vercel-build.test.ts`

**Interfaces:**
- Produces: redacted structured error logs and build-time validation for `WALLET_AUTH_SECRET` and `OPENAI_API_KEY`.
- External action: adding the missing production secret remains approval-gated.

- [ ] **Step 1: Write failing missing-secret and redaction tests**

```ts
vi.stubEnv("WALLET_AUTH_SECRET", "");
expect(vercelBuildSteps({ VERCEL_ENV: "production" })).toContainEqual([
  "node", ["scripts/validate-production-env.mjs"],
]);
expect(redactedRouteError(new Error("secret=abc"), "/api/intents/compile")).not.toContain("abc");
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm --filter @cobia/web exec vitest run app/api/intents/compile/route.test.ts scripts/vercel-build.test.ts`

Expected: FAIL because missing configuration is detected only at runtime and the route swallows its cause.

- [ ] **Step 3: Implement fail-fast validation and safe logging**

```ts
console.error(JSON.stringify({ level: "error", route: "/api/intents/compile",
  code: classifyCompilerError(error), requestId: request.headers.get("x-vercel-id") }));
```

Never log prompts, wallet addresses, cookies, signatures, headers, provider bodies, or secret values. Keep the client response stable and specific by failure class.

- [ ] **Step 4: Run tests and confirm the defect locally**

Run: `env -u WALLET_AUTH_SECRET VERCEL_ENV=production node apps/web/scripts/validate-production-env.mjs`

Expected: nonzero exit with `Missing required production variable: WALLET_AUTH_SECRET`, without a value.

- [ ] **Step 5: Commit the configuration checkpoint**

```bash
git add apps/web/lib/observability/route-error.ts apps/web/app/api/intents/compile/route.ts apps/web/scripts/vercel-build.mjs apps/web/scripts/validate-production-env.mjs apps/web/app/api/intents/compile/route.test.ts apps/web/scripts/vercel-build.test.ts
git commit -m "fix(web): fail fast on compiler configuration"
```

- [ ] **Step 6: Stop for production-secret approval**

Report that Vercel Production lacks `WALLET_AUTH_SECRET`. After action-time approval, generate at least 32 random bytes without printing them, pipe the value directly into `vercel env add WALLET_AUTH_SECRET production --sensitive`, redeploy, and verify one authenticated compile. Do not combine this with V4 deployment or principal execution.

### Task 2: Deterministic deployment plans and signer-free verification

**Files:**
- Create: `apps/web/lib/deployment/agent-executor-v4-plan.ts`
- Create: `apps/web/lib/deployment/mainnet-v4-state-verifier.ts`
- Create: `apps/web/scripts/prepare-agent-executor-v4-deployment.ts`
- Create: `apps/web/scripts/verify-agent-executor-v4-state.ts`
- Modify: `package.json`
- Test: `apps/web/lib/deployment/agent-executor-v4-plan.test.ts`
- Test: `apps/web/lib/deployment/mainnet-v4-state-verifier.test.ts`
- Create: `docs/deployments/xlayer-executor-v4-runbook.md`

**Interfaces:**
- Produces: deterministic creation/proposal/activation Safe JSON, checksums, and read-only `proposed|active` verification.
- Does not produce: deployed contracts, Safe signatures, activation, routing, or canary spend.

- [ ] **Step 1: Write failing deterministic-plan and state tests**

```ts
expect(plan.executorAddress).toBe(getContractAddress({ from: operator, nonce: operatorNonce + 1n }));
expect(plan.creationInputHashes).toEqual(rebuildCreationInputs(plan));
await expect(verifyMainnetV4State(reader, spec, "active")).rejects.toThrow("risk manager remains paused");
expect(plan.proposal.transactions).not.toContainEqual(expect.objectContaining({ data: ACTIVATE_SELECTOR }));
```

Cover owner/verifier/executor/risk bindings, runtime hashes, optional native canary caps, wallet access, pause, delayed changes, checksum mutation, wrong chain, proxy/code drift, and absence of signer/send methods.

- [ ] **Step 2: Run deployment tests and verify RED**

Run: `pnpm --filter @cobia/web exec vitest run lib/deployment/agent-executor-v4-plan.test.ts lib/deployment/mainnet-v4-state-verifier.test.ts`

Expected: FAIL because V4 deployment tooling does not exist.

- [ ] **Step 3: Implement deterministic plans and read-only verification**

```json
"executor:v4:plan": "tsx apps/web/scripts/prepare-agent-executor-v4-deployment.ts",
"executor:v4:verify": "tsx apps/web/scripts/verify-agent-executor-v4-state.ts"
```

Pin one block and check chain, owner, verifier, executor/risk bindings, code hashes, access mode, pause, pending/active caps, canary state, counters, and zero unexpected configuration.

- [ ] **Step 4: Run the complete pre-deployment gate**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm build && pnpm contracts:test && git diff --check`

Expected: PASS under Node.js 24+; opt-in fork gate passes when configured; no production transaction occurs.

- [ ] **Step 5: Commit deployment-ready artifacts**

```bash
git add apps/web/lib/deployment/agent-executor-v4-plan.ts apps/web/lib/deployment/mainnet-v4-state-verifier.ts apps/web/scripts/prepare-agent-executor-v4-deployment.ts apps/web/scripts/verify-agent-executor-v4-state.ts apps/web/lib/deployment/agent-executor-v4-plan.test.ts apps/web/lib/deployment/mainnet-v4-state-verifier.test.ts docs/deployments/xlayer-executor-v4-runbook.md package.json
git commit -m "feat(deployment): prepare executor v4 release"
```

- [ ] **Step 6: Stop at every external release boundary**

Obtain separate action-time approval before deployment, Safe proposal, delayed activation, public routing, and capped native-OKB canary. After each approved action, pin a fresh block and run `pnpm executor:v4:verify proposed` or `active`; never infer readiness from a countdown or submission alone.
