# Cobia RFQ, Payment, and Reveal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a free request into privately submitted verified quotes, charge only for the selected winner, reveal the committed route, and persist complete provenance on X Layer.

**Architecture:** Request creation starts solver competition without payment. The orchestrator captures one snapshot, stores complete bundles privately, projects sanitized quotes, and commits hashes. Selection fixes the winning bundle. Only its reveal endpoint is protected by OKX MPP `charge`; after settlement Cobia rechecks the commitment, releases the bundle, and records the receipt/reveal.

**Tech Stack:** Next.js route handlers, `@okxweb3/mpp`, PostgreSQL, Viem, Vitest.

## Global Constraints

- Use the constraints in `../2026-08-09-cobia-mvp.md`.
- Total winner price is `100000` atoms of the configured six-decimal payment
  stablecoin: `90000` remains with the selected solver recipient and a `10000`
  split is sent to Cobia.
- Competition, deterministic verification, and user selection precede payment.
- A route's complete bundle, evidence URLs, targets, and action remain private
  until its payment settles.
- A selected quote can settle exactly once. Losing quotes have no paid endpoint.

---

### Task 1: Implement free market orchestration

**Files:**
- Create: `apps/web/lib/orchestrator/run-market.ts`
- Create: `apps/web/lib/orchestrator/run-market.test.ts`
- Create: `apps/web/lib/orchestrator/rank.ts`
- Create: `apps/web/lib/orchestrator/errors.ts`

**Interfaces:**
- Produces `runMarket(requestId: string): Promise<QuoteMarketResult>`.
- Consumes repositories, snapshot capture, both solvers, verifier, quote
  projection, and ledger writer through explicit constructor dependencies.

- [ ] **Step 1: Write failing orchestration-order tests**

Assert request opening and snapshot persistence precede solvers; both solvers
receive object-identical frozen input; complete bundles remain in the private
repository; verification precedes quote projection; and `quotes_ready` is
written only after required chain commitments confirm. Assert no payment method
is called by `runMarket`.

- [ ] **Step 2: Define failure states**

If one solver fails, persist the successful result and mark `partial`; do not
invent a quote. If both fail, mark `failed`. If commitment fails, mark `failed`
even when private bundles exist. Never retry a solver implicitly.

- [ ] **Step 3: Implement bounded competition**

Run solvers with `Promise.allSettled`, individual 90-second abort signals, and no
automatic retry. Sort executable quotes by verifier score descending, then
solver ID ascending. Project only the `RouteQuote` schema; do not auto-select.

- [ ] **Step 4: Verify and commit**

```bash
pnpm --filter @cobia/web vitest run lib/orchestrator/run-market.test.ts
git add apps/web/lib/orchestrator
git commit -m "feat(market): orchestrate private solver quotes"
```

### Task 2: Implement chain commitment writes

**Files:**
- Create: `apps/web/lib/chain/contracts.ts`
- Create: `apps/web/lib/chain/ledger-writer.ts`
- Create: `apps/web/lib/chain/ledger-writer.test.ts`
- Modify: `apps/web/lib/env.ts`

**Interfaces:**
- Produces `openOnchainRequest`, `commitOnchainBundle`,
  `commitOnchainVerification`, `selectOnchainBundle`, `recordOnchainPayment`,
  `recordOnchainReveal`, and `readOnchainRequest`.

- [ ] **Step 1: Write failing receipt-confirmation tests**

Test correct ABI arguments, transaction replacement, revert propagation,
timeout, receipt chain mismatch, wrong emitted request ID, selection before
payment, and idempotent reads when a transition already succeeded.

- [ ] **Step 2: Implement write-then-confirm semantics**

Every method reads ledger state first, sends only a missing legal transition,
waits for a successful receipt, decodes the expected event, and returns its
transaction hash. A failure never marks the PostgreSQL artifact committed.

- [ ] **Step 3: Verify against testnet deployment**

```bash
pnpm tsx scripts/verify-deployment.ts --network xlayer-testnet --write-smoke-test
pnpm --filter @cobia/web vitest run lib/chain/ledger-writer.test.ts
git add apps/web/lib/chain apps/web/lib/env.ts
git commit -m "feat(chain): persist rfq commitments on x layer"
```

### Task 3: Configure selected-winner x402 payment

**Files:**
- Create: `apps/web/lib/payments/config.ts`
- Create: `apps/web/lib/payments/mpp.ts`
- Create: `apps/web/lib/payments/receipt.ts`
- Create: `apps/web/lib/payments/mpp.test.ts`

**Interfaces:**
- Produces `protectReveal(requestId, quoteId, request): Promise<PaidAccess>`.
- `PaidAccess` is `{ paid: false; response: Response } | { paid: true; receipt: PaymentReceipt }`.

- [ ] **Step 1: Write failing configuration tests**

Assert chain ID `1952` or `196`, six-decimal payment asset, selected solver as
main recipient, total `100000`, treasury split `10000`, canonical external ID
equal to quote ID, and rejection of an unselected, invalid, or expired quote.

- [ ] **Step 2: Register MPP charge**

Create `SaApiClient` from validated server credentials and `Mppx.create` with
the OKX `charge` method. Do not export secrets or a runtime test hook.

- [ ] **Step 3: Protect the exact reveal resource**

Call `mppx.charge` with `amount: "100000"`, the winning solver as recipient,
`splits: [{ amount: "10000", recipient: COBIA_TREASURY }]`, `feePayer: true`,
`externalId: quoteId`, and canonical `resourceUrl` ending in
`/api/requests/<id>/quotes/<quoteId>/reveal`. Hash only normalized public receipt
fields.

- [ ] **Step 4: Verify and commit**

```bash
pnpm --filter @cobia/web vitest run lib/payments/mpp.test.ts
git add apps/web/lib/payments apps/web/lib/env.ts
git commit -m "feat(payments): charge only the winning solver quote"
```

### Task 4: Implement selection and paid reveal APIs

**Files:**
- Create: `apps/web/app/api/requests/route.ts`
- Create: `apps/web/app/api/requests/[id]/route.ts`
- Create: `apps/web/app/api/requests/[id]/selection/route.ts`
- Create: `apps/web/app/api/requests/[id]/quotes/[quoteId]/reveal/route.ts`
- Create: `apps/web/app/api/requests/api.test.ts`

**Interfaces:**
- `POST /api/requests` returns `{ requestId, policyHash }` and starts competition.
- `GET /api/requests/:id` returns policy and sanitized quote/verdict data.
- `POST /api/requests/:id/selection` selects one executable quote.
- `POST /api/requests/:id/quotes/:quoteId/reveal` returns 402 or paid bundle.

- [ ] **Step 1: Write failing route-contract tests**

Cover malformed policy, owner mismatch, request not found, private-field
redaction, invalid selection, stale selection, unpaid 402, wrong quote reveal,
settled reveal, duplicate paid call, commitment mismatch, and paid replay.
Server errors use stable `{ code, message, requestId }` JSON.

- [ ] **Step 2: Implement request and public reads**

Generate UUIDv7, resolve configured asset, validate the policy, persist `open`,
and enqueue/run market orchestration. Public reads parse through explicit public
schemas and set `Cache-Control: no-store`.

- [ ] **Step 3: Implement selection**

Derive owner and bundle hash from stored data, reject non-executable or expired
quotes, persist `selected`, and confirm the ledger selection before returning
the reveal URL.

- [ ] **Step 4: Implement paid reveal**

Check selection and freshness before issuing the 402 challenge. After receipt,
persist and commit payment, load the private bundle, require its current hash to
equal the quote commitment, persist and commit reveal, then return the complete
bundle plus receipt. Never return another solver's bundle.

- [ ] **Step 5: Verify and commit**

```bash
pnpm --filter @cobia/web vitest run app/api/requests/api.test.ts
pnpm lint && pnpm typecheck && pnpm test
git add apps/web/app/api
git commit -m "feat(api): expose winner-paid rfq workflow"
```

### Task 5: Prove the real testnet payment loop

**Files:**
- Create: `scripts/e2e-testnet.ts`
- Create: `docs/evidence/x402-cobia-testnet.md`

**Interfaces:**
- Exercises public APIs, Agentic Wallet payment, both solvers, PostgreSQL, and
  X Layer testnet without a runtime mock mode.

- [ ] **Step 1: Create and solve a real request**

Create a capped request, wait for at least one executable quote, select it, and
print the exact reveal URL, winner address, `0.10` USDC price, and 90/10 split.

- [ ] **Step 2: Pay through Agentic Wallet**

Access the reveal URL, confirm the challenge identifies the selected solver,
and require the final receipt network `eip155:1952`.

- [ ] **Step 3: Verify provenance and privacy**

Assert the pre-payment response never contained the private action, the paid
bundle hash matches its earlier commitment, payment logs show `90000/10000`, and
ledger events contain request, bundle, verdict, selection, payment, and reveal.

- [ ] **Step 4: Save public evidence and commit**

```bash
pnpm e2e:testnet
git add scripts/e2e-testnet.ts docs/evidence/x402-cobia-testnet.md
git commit -m "test(e2e): prove winner-paid rfq on x layer"
```
