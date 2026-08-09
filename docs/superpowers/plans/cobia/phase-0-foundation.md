# Cobia Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the greenfield workspace, prove the sponsor APIs work with real credentials, and lock the shared domain and persistence interfaces.

**Architecture:** A pnpm workspace contains one Next.js application and focused domain/solver packages; Foundry remains isolated under `contracts`. Zod validates all boundary data, canonical JSON plus Keccak-256 creates cross-runtime commitments, and Drizzle persists full artifacts.

**Tech Stack:** pnpm, Next.js, TypeScript, Zod, Viem, Drizzle ORM, PostgreSQL, Vitest.

## Global Constraints

- Use the versions and global constraints in `../2026-08-09-cobia-mvp.md`.
- Do not proceed past Task 2 unless chain-196 product discovery and Agentic Wallet x402 testnet settlement both succeed.
- `.env` is ignored; `.env.example` contains names and safe descriptions only.

---

### Task 1: Bootstrap the workspace

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `apps/web/**` through `create-next-app`
- Create: `packages/domain/package.json`
- Create: `packages/solvers/package.json`

**Interfaces:**
- Produces workspace packages `@cobia/web`, `@cobia/domain`, and `@cobia/solvers`.
- Produces root scripts `lint`, `typecheck`, `test`, `e2e:testnet`, and `verify:deployment`.

- [ ] **Step 1: Initialize Git and the Next.js application**

```bash
git init
corepack enable
pnpm dlx create-next-app@16.3.0 apps/web --ts --tailwind --eslint --app --no-src-dir --use-pnpm --import-alias '@/*'
```

Expected: `apps/web/app/page.tsx` exists and `git status --short` contains only new files.

- [ ] **Step 2: Add the root workspace manifests**

```json
{
  "name": "cobia",
  "private": true,
  "packageManager": "pnpm@11.20.0",
  "engines": { "node": ">=22" },
  "scripts": {
    "lint": "pnpm -r lint",
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "e2e:testnet": "tsx scripts/e2e-testnet.ts",
    "verify:deployment": "tsx scripts/verify-deployment.ts"
  },
  "devDependencies": { "tsx": "4.23.11", "typescript": "6.0.3" }
}
```

```yaml
packages:
  - apps/*
  - packages/*
```

- [ ] **Step 3: Create secrets policy**

`.env.example` must list `DATABASE_URL`, `OKX_API_KEY`, `OKX_SECRET_KEY`,
`OKX_PASSPHRASE`, `MPPX_SECRET_KEY`, `OPENAI_API_KEY`, `COBIA_TREASURY`,
`XLAYER_RPC_URL`, and `XLAYER_TESTNET_RPC_URL`, plus `PAYMENT_CHAIN_ID` and
`PAYMENT_ASSET`. Add `.env`,
`.env.local`, deployment keystores, and
Foundry broadcast secrets to `.gitignore`.

- [ ] **Step 4: Install and verify**

```bash
pnpm install
pnpm lint
pnpm typecheck
git add .
git commit -m "chore: bootstrap cobia workspace"
```

Expected: lint and typecheck exit `0`.

### Task 2: Prove OKX data and payment feasibility

**Files:**
- Create: `apps/web/lib/env.ts`
- Create: `apps/web/lib/okx/auth.ts`
- Create: `apps/web/lib/okx/client.ts`
- Create: `apps/web/lib/okx/client.test.ts`
- Create: `scripts/verify-okx-live.ts`

**Interfaces:**
- Produces `signOkxRequest(input: OkxSignInput): OkxHeaders`.
- Produces `searchProducts(query: ProductSearchQuery): Promise<RawProduct[]>`.
- Produces a live gate that requires `chainIndex === "196"` and `platformName === "Aave V3"`.

- [ ] **Step 1: Write signature unit tests**

```ts
it("signs timestamp + method + path + body", () => {
  expect(signOkxRequest({
    timestamp: "2026-08-10T10:00:00.000Z",
    method: "POST",
    path: "/api/v6/defi/product/search",
    body: '{"tokenKeywordList":["USDG"],"chainIndex":"196"}',
    secret: "secret",
    key: "key",
    passphrase: "pass"
  })).toMatchObject({ "OK-ACCESS-KEY": "key", "OK-ACCESS-PASSPHRASE": "pass" });
});
```

- [ ] **Step 2: Run the focused test and observe failure**

```bash
pnpm --filter @cobia/web vitest run lib/okx/client.test.ts
```

Expected: FAIL because `signOkxRequest` is missing.

- [ ] **Step 3: Implement exact HMAC authentication and product search**

Use `base64(HMAC_SHA256(secret, timestamp + method + path + body))`; preserve
the exact serialized body for both signing and `fetch`. Reject non-`"0"` OKX
business codes and non-2xx HTTP responses with typed errors.

- [ ] **Step 4: Execute the live product gate**

```bash
pnpm tsx scripts/verify-okx-live.ts --chain 196 --token USDG --protocol "Aave V3"
```

Expected: prints at least one real investment ID, APY, TVL, and retrieval time.
Zero matching products is a hard stop requiring design review.

- [ ] **Step 5: Execute the official Agentic Wallet x402 testnet check**

```bash
npx skills add okx/onchainos-skills
onchainos wallet login
onchainos wallet status
```

Then instruct the logged-in agent to access
`https://www.okx.com/api/v1/pay/mock-merchant/resource`. Expected: the final
response contains a successful receipt on network `eip155:1952`; save only its
public transaction hash in `docs/evidence/x402-testnet.md`.

- [ ] **Step 6: Commit the passed gate**

```bash
pnpm --filter @cobia/web test
git add apps/web/lib scripts/verify-okx-live.ts docs/evidence/x402-testnet.md
git commit -m "feat(okx): verify live data and x402 prerequisites"
```

### Task 3: Define canonical domain contracts

**Files:**
- Create: `packages/domain/src/policy.ts`
- Create: `packages/domain/src/snapshot.ts`
- Create: `packages/domain/src/bundle.ts`
- Create: `packages/domain/src/verdict.ts`
- Create: `packages/domain/src/canonical.ts`
- Create: `packages/domain/src/index.ts`
- Create: `packages/domain/test/domain.test.ts`

**Interfaces:**
- Produces `StablecoinPolicySchema`, `MarketSnapshotSchema`,
  `DecisionBundleSchema`, `RouteQuoteSchema`, and `VerificationVerdictSchema`.
- Produces `canonicalJson(value: unknown): string` and `commitment(value: unknown): Hex`.

- [ ] **Step 1: Write boundary tests**

Test that schemas reject floating-point amounts, allocation totals other than
`10_000`, execution chain IDs other than `196`, expired policies, mismatched request
IDs, and non-HTTP evidence URLs. Test that differently ordered object keys yield
the same commitment and reordered arrays yield different commitments.

- [ ] **Step 2: Run the tests and observe failure**

```bash
pnpm --filter @cobia/domain vitest run
```

Expected: FAIL because the schemas and commitment functions are missing.

- [ ] **Step 3: Implement the minimal schemas**

Use discriminated actions:

```ts
type BundleAction =
  | { kind: "hold"; amountAtomic: string }
  | { kind: "aave-v3-supply"; investmentId: string; amountAtomic: string };
```

Evidence records contain `url`, `title`, `retrievedAt`, `claim`, and
`contentHash`. Risk flags use fixed severities `low | medium | high | critical`.

- [ ] **Step 4: Implement canonical commitments**

Recursively sort object keys, preserve array order, serialize with `JSON.stringify`,
UTF-8 encode, and hash with Viem `keccak256`. Reject `number` values that are not
safe integers before serialization.

- [ ] **Step 5: Verify and commit**

```bash
pnpm --filter @cobia/domain test
pnpm typecheck
git add packages/domain
git commit -m "feat(domain): define verifiable decision bundles"
```

### Task 4: Persist requests and artifacts

**Files:**
- Create: `apps/web/lib/db/client.ts`
- Create: `apps/web/lib/db/schema.ts`
- Create: `apps/web/lib/db/requests.ts`
- Create: `apps/web/lib/db/requests.test.ts`
- Create: `apps/web/drizzle.config.ts`
- Create: `apps/web/drizzle/0000_cobia.sql`

**Interfaces:**
- Produces `createRequest`, `saveSnapshot`, `saveBundle`, `saveVerdict`,
  `selectQuote`, `markPaymentSettled`, `markBundleRevealed`, and `recordExecution`.
- Request states are `open | collecting | verifying | quotes_ready | partial |
  selected | payment_pending | paid | revealed | executed | failed`.

- [ ] **Step 1: Write repository transition tests**

Test legal state transitions and assert duplicate payment receipt hashes,
duplicate bundle hashes, payment before selection, reveal before payment, and
selecting an invalid bundle are rejected by unique constraints or transactions.

- [ ] **Step 2: Add PostgreSQL schema and repositories**

Use JSONB for validated full artifacts and `bytea`/hex text for commitments.
Store chain ID, block number, payment hash, solver ID, failure code, timestamps,
and selected bundle hash in indexed columns. Every write accepting JSON must
parse it through `@cobia/domain` first.

- [ ] **Step 3: Run migration and tests against an isolated database**

```bash
createdb cobia_test
DATABASE_URL=postgresql://localhost/cobia_test pnpm --filter @cobia/web drizzle-kit migrate
DATABASE_URL=postgresql://localhost/cobia_test pnpm --filter @cobia/web vitest run lib/db/requests.test.ts
```

Expected: migration and all transition tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/db apps/web/drizzle.config.ts apps/web/drizzle
git commit -m "feat(storage): persist market provenance"
```
