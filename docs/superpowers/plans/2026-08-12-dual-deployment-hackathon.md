# Cobia Dual Deployment and Hackathon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish isolated `cobia-testnet` and selected-user `cobia-beta` applications with truthful chain behavior, production gates, and a complete AI Season evidence bundle.

**Architecture:** One codebase has a strict server-only deployment profile that fixes chain behavior and public copy. Each Vercel project owns a separate PostgreSQL database, realm, secrets, solver identities, and deployment manifest; testnet proves X Layer 1952 payment/control-plane behavior while beta executes only reviewed chain-196 routes.

**Tech Stack:** Vercel, Next.js 16, PostgreSQL 16, Drizzle, viem, OKX MPP, X Layer 1952/196, GitHub Actions.

## Global Constraints

- Vercel projects are named `cobia-testnet` and `cobia-beta`.
- Do not copy local `.env.local`, wallet keys, database contents, or credentials into Git, chat, logs, or Vercel output.
- Testnet never claims Aave, Curve, or Uniswap execution on chain 1952 without an official verified deployment.
- Mainnet beta is selected-wallet only and remains paused until the atomic-executor promotion gates pass.
- Public APIs are fail-closed, rate-limited, no-store where buyer-specific, and return generic errors with correlation IDs.
- A managed PostgreSQL provider must supply two independent URLs; the current local `127.0.0.1` database is not deployable.
- No Launch Grant volume claim: OKX DEX API volume is explicitly excluded by the official rules.
- No handwritten source file exceeds 300 lines.

---

### Task 1: Deployment profile as a closed type

**Files:**
- Create: `apps/web/lib/deployment/profile.ts`
- Create: `apps/web/lib/deployment/profile.test.ts`
- Modify: `.env.example`
- Modify: `apps/web/lib/env.ts`

**Interfaces:**
- Produces: `readDeploymentProfile(): DeploymentProfile` with variants `local`, `testnet`, and `beta`.
- Consumes: `COBIA_ENVIRONMENT`, `PUBLIC_APP_URL`, exact executor manifests, and existing secret parsers.

- [ ] **Step 1: Write RED profile tests**

```ts
expect(readDeploymentProfile({
  COBIA_ENVIRONMENT: "testnet",
  PUBLIC_APP_URL: "https://cobia-testnet.vercel.app",
})).toMatchObject({ executionMode: "rehearsal-only", paymentChainId: 1952 });

expect(readDeploymentProfile({
  COBIA_ENVIRONMENT: "beta",
  PUBLIC_APP_URL: "https://cobia-beta.vercel.app",
})).toMatchObject({ executionMode: "selected-mainnet", executionChainId: 196 });
```

Reject unknown environment, HTTP production URL, localhost production URL,
realm/host mismatch, chain override variables, missing executor manifest, and a
beta profile with execution unpaused before manifest validation.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @cobia/web exec vitest run lib/deployment/profile.test.ts`

Expected: FAIL because the profile module is absent.

- [ ] **Step 3: Implement closed profiles**

Use a strict Zod discriminated union. Chain IDs, payment token, supported
protocols, and execution modes are constants selected by the environment—not
free-form environment variables.

- [ ] **Step 4: Run GREEN**

Run: `pnpm --filter @cobia/web exec vitest run lib/deployment/profile.test.ts`

Expected: all table and mutation cases pass.

- [ ] **Step 5: Commit**

```bash
git add .env.example apps/web/lib/deployment apps/web/lib/env.ts
git commit -m "feat(deploy): define closed Cobia environments"
```

### Task 2: Public truth and access control

**Files:**
- Create: `apps/web/lib/beta/access.ts`
- Create: `apps/web/lib/beta/access.test.ts`
- Modify: `apps/web/app/layout.tsx`
- Modify: `apps/web/components/request/PolicyForm.tsx`
- Modify: `apps/web/components/routes/PurchasedRouteExecution.tsx`
- Modify: `apps/web/app/api/requests/route.ts`
- Modify: mainnet execution API handlers

**Interfaces:**
- Consumes: deployment profile and comma-free hashed selected-wallet records.
- Produces: testnet/mainnet environment badge and server-enforced beta access.

- [ ] **Step 1: Write RED tests**

Assert testnet says “X Layer testnet payment + mainnet fork rehearsal,” beta says
“Selected-user X Layer mainnet beta,” testnet emits no mainnet transaction
button, an unselected wallet cannot prepare or submit mainnet execution, and
client-side element removal alone cannot bypass the API.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @cobia/web exec vitest run lib/beta components app/api`

Expected: current code has no deployment-aware access boundary.

- [ ] **Step 3: Implement hashed wallet access**

Store selected wallet addresses in PostgreSQL with normalized address and audit
fields. Do not expose the complete list to the browser. An authenticated owner
proof is required before the API reveals whether that owner is selected.

- [ ] **Step 4: Run GREEN**

Run the focused tests, full web suite, typecheck, and lint.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/beta apps/web/app apps/web/components
git commit -m "feat(beta): enforce selected-wallet mainnet access"
```

### Task 3: Production security headers and request controls

**Files:**
- Modify: `apps/web/next.config.ts`
- Create: `apps/web/lib/http/rate-limit.ts`
- Create: `apps/web/lib/http/rate-limit.test.ts`
- Modify: payment, rehearsal, solver-run, and execution mutation handlers

**Interfaces:**
- Produces: CSP, HSTS in Vercel environments, correlation IDs, and endpoint-specific rate limits.

- [ ] **Step 1: Write RED response tests**

Assert `Content-Security-Policy`, `Strict-Transport-Security`, `nosniff`, frame
denial, referrer policy, permissions policy, no-store on buyer artifacts, and
429 responses with `Retry-After`. Assert raw RPC, SQL, provider, and credential
errors never reach the response body.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @cobia/web exec vitest run lib/http app/api`

Expected: CSP/HSTS and shared rate limiting are absent.

- [ ] **Step 3: Implement fixed controls**

Permit scripts/styles/connect origins required by Next.js, injected wallets,
the active X Layer RPCs, and the app origin only. Production HSTS is
`max-age=31536000; includeSubDomains`. Use PostgreSQL-backed counters for paid,
solver, and execution mutation endpoints so serverless instances share limits.

- [ ] **Step 4: Run GREEN and browser smoke**

Run focused tests, `pnpm build`, and load wallet connect, markets, request,
payment, rehearsal, and execution pages without CSP console violations.

- [ ] **Step 5: Commit**

```bash
git add apps/web/next.config.ts apps/web/lib/http apps/web/app/api
git commit -m "fix(security): harden public Cobia endpoints"
```

### Task 4: Disposable production database validation

**Files:**
- Create: `apps/web/scripts/verify-production-database.mts`
- Create: `apps/web/scripts/verify-production-database.test.ts`
- Modify: `apps/web/package.json`
- Modify: `README.md`

**Interfaces:**
- Consumes: one candidate managed `DATABASE_URL` at a time.
- Produces: a read-only connectivity/schema report and a separate explicit migration command.

- [ ] **Step 1: Write RED tests**

Reject localhost, private IP, URL without TLS requirement, same normalized URL
for both environments, missing migrations, wrong schema version, and existing
rows when validating a new empty production database.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @cobia/web exec vitest run scripts/verify-production-database.test.ts`

Expected: missing verifier.

- [ ] **Step 3: Implement read-only verification**

The verifier prints only provider hostname, database name hash, TLS status,
schema version, and row counts. It never prints credentials or the full URL.
Migration remains `pnpm --filter @cobia/web db:migrate` and requires an explicit
environment selection.

- [ ] **Step 4: Provision two managed PostgreSQL databases**

Use a user-approved managed provider. Create independent empty databases for
`cobia-testnet` and `cobia-beta`, run the verifier, migrate, then rerun the
verifier. Stop if either URL is reused or the provider would incur an
unapproved paid plan.

- [ ] **Step 5: Commit code only**

```bash
git add apps/web/scripts apps/web/package.json README.md
git commit -m "chore(db): verify isolated deployment databases"
```

### Task 5: Vercel projects and secret isolation

**Files:**
- Create: `docs/runbooks/vercel-deployments.md`
- Create: `docs/evidence/cobia-testnet-deployment.md` after successful deploy
- Create: `docs/evidence/cobia-beta-deployment.md` after successful deploy

**Interfaces:**
- Consumes: Vercel account `sebastianboehlers-projects`, two verified databases, and locally supplied secrets.
- Produces: `cobia-testnet.vercel.app` and `cobia-beta.vercel.app`.

- [ ] **Step 1: Create projects without deploying**

Run:

```bash
vercel project add cobia-testnet
vercel project add cobia-beta
```

Confirm both use repository root, Node 22.x, pnpm 11.20.0, and build command
`pnpm build`. Do not link the same checkout to both projects simultaneously;
use `vercel link --project` only inside a temporary directory.

- [ ] **Step 2: Populate exact environment keys**

For each project add independent values for `DATABASE_URL`, `MPPX_SECRET_KEY`,
`EXECUTION_SESSION_SECRET`, `COBIA_TREASURY`, `PAYMENT_REALM`, both solver keys,
OpenAI credentials, OKX credentials, RPC URLs, `COBIA_ENVIRONMENT`, and
`PUBLIC_APP_URL`. Never copy `COBIA_DEV_TREASURY_PRIVATE_KEY`.

- [ ] **Step 3: Deploy testnet preview then production**

Run a preview, execute HTTP and authenticated testnet E2E checks, then promote
the exact immutable build to production. Record deployment ID, commit, URL,
headers, database fingerprint, chain IDs, and testnet transaction links.

- [ ] **Step 4: Deploy beta while execution remains paused**

Repeat with independent values. Confirm mainnet reads work, unselected wallets
cannot execute, and the atomic executor control remains paused.

- [ ] **Step 5: Commit evidence without secrets**

```bash
git add docs/runbooks/vercel-deployments.md docs/evidence
git commit -m "docs(deploy): record isolated Vercel environments"
```

### Task 6: CI release gates

**Files:**
- Create: `.github/workflows/verify.yml`
- Create: `.github/workflows/fork.yml`
- Modify: `README.md`

**Interfaces:**
- Produces: required checks for unit/type/lint/build/audit and opt-in protected fork/contracts lanes.

- [ ] **Step 1: Add a deliberately failing workflow validation**

Use `actionlint` in the pinned Foundry container or a pinned `rhysd/actionlint`
release and confirm the absent workflow is detected by the local verification
script.

- [ ] **Step 2: Implement workflows with least privilege**

Set `permissions: contents: read`, pin third-party actions by commit SHA, use
Node 22 and pnpm 11.20.0, cache only pnpm store, and run frozen install, tests,
typecheck, lint, build, Drizzle check, production audit, and diff/LOC checks.
Fork and contract jobs run manually or on protected main pushes with repository
secrets; pull requests from forks never receive secrets.

- [ ] **Step 3: Run locally and in GitHub**

Push a branch, require every check, and confirm no secret appears in logs or
artifacts.

- [ ] **Step 4: Commit**

```bash
git add .github README.md
git commit -m "ci: gate Cobia releases"
```

### Task 7: Testnet product E2E

**Files:**
- Create: `apps/web/e2e/testnet.spec.ts`
- Modify: `apps/web/package.json`
- Create: `docs/evidence/xlayer-testnet-product.md`

**Interfaces:**
- Consumes: public testnet deployment and a locally controlled funded test wallet.
- Produces: public testnet payment, request, quote, reveal, and rehearsal evidence.

- [ ] **Step 1: Write the browser E2E**

Create a 1 USD intent, run deterministic and bounded agentic solvers, select a
quote, complete the one-payment/two-authorization MPP reveal with test USDt0,
load the purchased route, and run the no-wallet-funds fork rehearsal. Assert the
UI never claims testnet yield execution.

- [ ] **Step 2: Run against preview and capture RED**

Expected: any missing environment, wallet chain, payment receipt, persistence,
or realm mismatch fails the test with the exact boundary.

- [ ] **Step 3: Fix only discovered production defects with TDD**

Do not add test-only branches, fallback protocol data, or fake APY.

- [ ] **Step 4: Run GREEN and record evidence**

Record public URL, commit, request ID, payment transaction/reference, bundle
hash, rehearsal trace hash, and screenshots without private keys.

- [ ] **Step 5: Commit**

```bash
git add apps/web/e2e apps/web/package.json docs/evidence/xlayer-testnet-product.md
git commit -m "test(e2e): verify public X Layer testnet flow"
```

### Task 8: Mainnet selected-user canary

**Files:**
- Create: `docs/evidence/xlayer-mainnet-beta.md`
- Modify: `docs/runbooks/vercel-deployments.md`

**Interfaces:**
- Consumes: approved deployed atomic executor and exact 10 USD canary.
- Produces: one persisted, explorer-linked, bounded mainnet route.

- [ ] **Step 1: Present the canary approval sheet**

Show owner, input token, input amount, protocol targets, selectors, minimum
output/position, executor, registry, verifier, nonce, deadline, current gas,
maximum OKB cost, fork trace, and the command/UI action. Stop for explicit
approval.

- [ ] **Step 2: Execute one route**

Unpause only after approval, execute one 10 USD route, repause immediately if
receipt/event/postcondition evidence differs, and do not retry an ambiguous
transaction.

- [ ] **Step 3: Verify product recovery**

Reload the app, verify the confirmed state and Portfolio position from chain,
and ensure Activity links the exact explorer transaction.

- [ ] **Step 4: Record and commit evidence**

```bash
git add docs/evidence/xlayer-mainnet-beta.md docs/runbooks/vercel-deployments.md
git commit -m "docs(beta): record capped X Layer mainnet canary"
```

### Task 9: Hackathon submission and X launch

**Files:**
- Create: `docs/hackathon/ai-season-submission.md`
- Create: `docs/hackathon/x-launch-drafts.md`
- Create: `docs/hackathon/demo-script.md`

**Interfaces:**
- Consumes: public URLs, explorer evidence, repository, and active dedicated X account.
- Produces: reviewed submission packet and public post only after final user approval.

- [ ] **Step 1: Assemble the rules checklist**

Record evidence for meaningful AI, X Layer testnet, X Layer mainnet, dedicated
active X account, post mentioning `@XLayerOfficial`, and Google Form before
August 21, 2026 at 23:59 UTC. Include judge-facing sections for AI application,
innovation, completeness, user value, X Layer integration, growth potential,
ecosystem contribution, onchain data, code quality, and market potential.

- [ ] **Step 2: Write exact truthful launch copy**

Describe registered Aave/Curve/Uniswap adapters, deterministic verification,
bounded agentic selection, fork proof, capped atomic beta, and future adapter
expansion. Do not claim guaranteed APY, whole-chain coverage, Launch Grant
volume, unrestricted production, or audited contracts unless each is true.

- [ ] **Step 3: Record a deterministic demo**

Use the testnet payment/reveal and one mainnet/fork route. Show the signed
constraints, agentic candidate choice, independent verdict, exact transaction,
receipt/postconditions, and failure/revert behavior.

- [ ] **Step 4: Request final publication approval**

Present the exact X handle, post text, media, public URLs, Form answers, and
submission deadline. Do not create the account, publish, or submit the Form
until the user approves those concrete external actions.

- [ ] **Step 5: Publish and archive receipts**

After approval, publish from the dedicated account with `@XLayerOfficial`,
submit the official Form, and add public post/Form receipt URLs without private
account data.

- [ ] **Step 6: Commit**

```bash
git add docs/hackathon
git commit -m "docs(hackathon): finalize AI Season submission"
```
