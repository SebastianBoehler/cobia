# General-Intent Mainnet Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a wallet-controlled mainnet proof for one X Layer swap, one LI.FI bridge plus registered tokenized-instrument acquisition, and one exact x402 payment, all authored through a typed agent harness and independently verified.

**Architecture:** Add a canonical multi-stage transaction program alongside the existing V3 atomic program. Provider quotes remain untrusted until a dedicated LI.FI adapter binds and verifies every transaction field, simulation result, and code identity; the browser signs only the committed requests. Async delivery and x402 remain distinct stage kinds with truthful guarantees.

**Tech Stack:** TypeScript 6, Zod 4, viem 2, Vitest 4, Next.js 16, React 19, existing Vercel Sandbox/Anvil and x402 modules.

**Spec:** `docs/superpowers/specs/2026-08-20-general-intent-solver-plugins-design.md`

## Verified progress checkpoint — 20 August 2026

Implemented and covered by focused tests: Open V3 policy and staged program IR,
generic raw-EVM verification, LI.FI normalization/verifier/read broker, strict
OKX swap verification with Builder Code attribution, isolated open-program
sandbox output parsing, the public intent listing API, signed community solver
registration, solver SDK/example harness, developer docs, and segmented solver
performance evidence.

Still release-blocking: public signed community decision submission,
production provider dispatch plus independent generic replay, exact staged
wallet execution for Open V3, one independently registered tokenized
instrument, and one HTTPS x402 merchant offer. V3 governance activation is
time-locked until `2026-08-20T12:30:41Z`; no automated release gate may sign or
broadcast a principal transaction.

## Global Constraints

- X Layer mainnet is chain `196`; Ethereum mainnet is chain `1`.
- The agent and server receive no user key, wallet handle, credential-bearing RPC URL, or production send method.
- The browser wallet broadcasts only exact independently verified requests.
- V3 registry activation delays and existing capabilities remain unchanged.
- Bridges are asynchronous and never inherit an atomic guarantee.
- Provider data, ABI, docs, and solver rationale are provenance, not trust evidence.
- Files should remain below 300 LOC; errors are typed and fail closed.

---

### Task 1: Canonical Staged Program

**Files:**
- Create: `packages/domain/src/transaction-program.ts`
- Create: `packages/domain/test/transaction-program.test.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**
- Produces: `TransactionProgramV1Schema`, `TransactionStageV1Schema`, `parseTransactionProgramV1(input, nowSec)`, and `transactionProgramCommitmentV1(program)`.

- [ ] **Step 1: Write failing strict-schema tests**

Cover a valid two-chain stage sequence and reject unknown keys, duplicate IDs,
forward dependencies, dirty addresses, unsafe atomic amounts, owner/recipient
changes, expired evidence, signing material, and executable `research` stages.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `pnpm --filter @cobia/domain test -- transaction-program.test.ts`
Expected: FAIL because `transaction-program` is not exported.

- [ ] **Step 3: Implement the schemas and canonical commitment**

Use a strict discriminated union for `cobia-v3 | wallet-transaction |
async-delivery | x402-authorization | research`. Require stage IDs to be sorted
and dependencies to point only backward. Restrict chains to `1 | 196` in this
vertical slice and require decimal-string atomic values.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `pnpm --filter @cobia/domain test -- transaction-program.test.ts && pnpm --filter @cobia/domain typecheck`
Expected: PASS.

- [ ] **Step 5: Commit the schema checkpoint**

```bash
git add packages/domain/src/transaction-program.ts packages/domain/src/index.ts packages/domain/test/transaction-program.test.ts
git commit -m "feat(domain): define staged transaction programs"
```

### Task 2: LI.FI Wire Normalization

**Files:**
- Create: `packages/solvers/src/lifi/wire.ts`
- Create: `packages/solvers/src/lifi/normalize.ts`
- Create: `packages/solvers/test/lifi-normalize.test.ts`
- Modify: `packages/solvers/src/index.ts`

**Interfaces:**
- Consumes: `TransactionProgramV1` address/hash conventions.
- Produces: `LifiQuoteEnvelopeV1`, `NormalizedLifiQuoteV1`, and `normalizeLifiQuoteV1({ response, responseHash, fetchedAt, expiresAt, request })`.

- [ ] **Step 1: Write failing quote normalization tests**

Use sanitized fixtures for X Layer USD₮0 to Ethereum USDC and Ethereum USDC to
SPCXx. Assert exact chain, tokens, amounts, owner, recipient, approval spender,
target, selector, value, tool list, response hash, and expiry. Reject alternate
chains, arbitrary destination calls, malformed calldata, owner drift, unsafe
amounts, unknown tools, missing transaction request, and stale timestamps.

- [ ] **Step 2: Confirm RED**

Run: `pnpm --filter @cobia/solvers test -- lifi-normalize.test.ts`
Expected: FAIL because the normalizer does not exist.

- [ ] **Step 3: Implement the strict wire parser and normalizer**

Accept only the exact quote response subset needed by verification. Preserve
the full raw response only outside the parsed value; store its supplied hash.
Allow initial tools `feeCollection`, `layerswap`, `sushiswap`, and `fly`, while
requiring verifier-owned tool semantics before execution.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `pnpm --filter @cobia/solvers test -- lifi-normalize.test.ts && pnpm --filter @cobia/solvers typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/solvers/src/lifi packages/solvers/src/index.ts packages/solvers/test/lifi-normalize.test.ts
git commit -m "feat(solvers): normalize lifi transaction quotes"
```

### Task 3: LI.FI Deterministic Verifier

**Files:**
- Create: `packages/solvers/src/lifi/manifest.ts`
- Create: `packages/solvers/src/lifi/verifier.ts`
- Create: `packages/solvers/test/lifi-verifier.test.ts`

**Interfaces:**
- Consumes: `NormalizedLifiQuoteV1`.
- Produces: `verifyLifiWalletTransactionV1(input): Promise<LifiVerificationV1>` with exact approvals/transaction and stable rejection codes.

- [ ] **Step 1: Write adversarial failing tests**

Test target/selector/value/approval/recipient/chain/token/amount/quote hash/code
hash/simulation/state-diff/freshness mismatches, proxy upgrade, stale/reorged
anchor, undeclared output, and spoofed trace. Assert the verifier never exposes
a request when rejected.

- [ ] **Step 2: Confirm RED**

Run: `pnpm --filter @cobia/solvers test -- lifi-verifier.test.ts`
Expected: FAIL because the verifier does not exist.

- [ ] **Step 3: Implement manifest-backed verification**

Define exact chain-specific LI.FI diamond deployment, runtime code hash,
selectors, approval spender, allowed tools, simulation maximum age, and state
delta rules. Require a fresh anchor callback and simulation callback; hash all
accepted evidence into the verdict.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `pnpm --filter @cobia/solvers test -- lifi-normalize.test.ts lifi-verifier.test.ts && pnpm --filter @cobia/solvers typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/solvers/src/lifi packages/solvers/test/lifi-verifier.test.ts
git commit -m "feat(solvers): verify exact lifi wallet transactions"
```

### Task 4: Read-Only LI.FI Broker and Harness Tool

**Files:**
- Create: `apps/web/lib/lifi/broker.ts`
- Create: `apps/web/lib/lifi/broker.test.ts`
- Create: `apps/web/lib/solver-tools/types.ts`
- Create: `apps/web/lib/solver-tools/lifi.ts`
- Create: `apps/web/lib/solver-tools/lifi.test.ts`
- Modify: `apps/web/lib/coding-agent-sandbox/vercel-sandbox.ts`

**Interfaces:**
- Produces: `SolverToolV1`, `createLifiBrokerV1(fetch)`, and `lifiRoutesToolV1`.

- [ ] **Step 1: Write failing egress and credential tests**

Reject non-HTTPS, non-`li.quest`, unexpected paths/query keys, redirects,
private/reserved DNS results, headers, request bodies, oversized responses,
wrong content type, timeouts, and schema bombs. Assert no ambient headers or
secrets reach `fetch` or sandbox environment.

- [ ] **Step 2: Confirm RED**

Run: `pnpm --filter @cobia/web test -- lib/lifi/broker.test.ts lib/solver-tools/lifi.test.ts`
Expected: FAIL because the broker/tool do not exist.

- [ ] **Step 3: Implement the bounded broker and tool**

Expose only `/v1/chains`, `/v1/tokens`, `/v1/tools`, `/v1/connections`,
`/v1/quote`, and `/v1/status`; cap timeout at 10 seconds and response at 2 MiB.
Return normalized immutable snapshots and typed abstention.

- [ ] **Step 4: Run tests and web typecheck**

Run: `pnpm --filter @cobia/web test -- lib/lifi/broker.test.ts lib/solver-tools/lifi.test.ts && pnpm --filter @cobia/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/lifi apps/web/lib/solver-tools apps/web/lib/coding-agent-sandbox/vercel-sandbox.ts
git commit -m "feat(web): broker lifi solver tools"
```

### Task 5: Instrument Registry

**Files:**
- Create: `apps/web/lib/instruments/types.ts`
- Create: `apps/web/lib/instruments/production-registry.ts`
- Create: `apps/web/lib/instruments/registry.test.ts`

**Interfaces:**
- Produces: `RwaInstrumentV1Schema`, `productionInstrumentRegistryV1()`, and `resolveInstrumentV1(identity)`.

- [ ] **Step 1: Write failing identity tests**

Require exact issuer, contract, chain, underlying identifier, claim class,
official source hashes, restrictions, proxy/runtime identity, and expiry.
Reject ticker-only lookup, duplicate representations, ambiguous SpaceX/Tesla
tokens, unsupported jurisdiction, and stale evidence.

- [ ] **Step 2: Confirm RED**

Run: `pnpm --filter @cobia/web test -- lib/instruments/registry.test.ts`
Expected: FAIL because the registry does not exist.

- [ ] **Step 3: Add only independently sourced initial entries**

Register one submission instrument only after official issuer evidence and live
code identities are captured. If legal/eligibility evidence is insufficient,
leave the registry empty and surface `INSTRUMENT_NOT_REGISTERED`.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `pnpm --filter @cobia/web test -- lib/instruments/registry.test.ts && pnpm --filter @cobia/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/instruments
git commit -m "feat(web): register verified tokenized instruments"
```

### Task 6: Staged Program Service and APIs

**Files:**
- Create: `apps/web/lib/programs/stage-machine.ts`
- Create: `apps/web/lib/programs/stage-machine.test.ts`
- Create: `apps/web/lib/programs/lifi-service.ts`
- Create: `apps/web/app/api/programs/[submissionId]/stages/[stageId]/route.ts`
- Create: `apps/web/app/api/programs/[submissionId]/stages/[stageId]/route.test.ts`

**Interfaces:**
- Produces: `prepareProgramStageV1`, `recordStageReceiptV1`, and exact no-store API responses.

- [ ] **Step 1: Write failing lifecycle tests**

Reject stage skipping, wrong owner proof, wrong chain, stale preparation,
duplicate receipt, changed quote, missing bridge delivery, reorged receipt, and
destination preparation before finality.

- [ ] **Step 2: Confirm RED**

Run: `pnpm --filter @cobia/web test -- lib/programs/stage-machine.test.ts 'app/api/programs/[submissionId]/stages/[stageId]/route.test.ts'`
Expected: FAIL because the service/routes do not exist.

- [ ] **Step 3: Implement preparation and receipt reconciliation**

Reuse existing owner access proofs. Return exact calls only after current code,
chain, account, quote, anchor, and simulation checks. Store immutable stage
commitments and LI.FI delivery evidence; never accept client-supplied calldata.

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @cobia/web test -- lib/programs/stage-machine.test.ts 'app/api/programs/[submissionId]/stages/[stageId]/route.test.ts' && pnpm --filter @cobia/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/programs apps/web/app/api/programs
git commit -m "feat(web): orchestrate verified program stages"
```

### Task 7: Multi-Chain Wallet Review

**Files:**
- Modify: `apps/web/lib/wallet/eip1193.ts`
- Modify: `apps/web/components/wallet/WalletProvider.tsx`
- Create: `apps/web/lib/programs/wallet-stage-client.ts`
- Create: `apps/web/lib/programs/wallet-stage-client.test.ts`
- Modify: `apps/web/components/agent/AgentProgramView.tsx`
- Modify: `apps/web/components/agent/AgentProgramView.test.tsx`

**Interfaces:**
- Produces: wallet switching for chain `1 | 196` and exact committed-stage execution.

- [ ] **Step 1: Write failing wallet security/UI tests**

Assert visible chain, asset, spend, recipient, approval, minimum output,
deadline, async warning, and instrument identity. Reject account/chain/code/hash
changes immediately before send. Assert one user confirmation per request.

- [ ] **Step 2: Confirm RED**

Run: `pnpm --filter @cobia/web test -- lib/programs/wallet-stage-client.test.ts components/agent/AgentProgramView.test.tsx`
Expected: FAIL because Ethereum/staged requests are unsupported.

- [ ] **Step 3: Implement exact multi-chain stage execution**

Extend the provider to Ethereum mainnet without changing X Layer defaults. Send
only API-prepared requests, wait for receipts, submit hashes for independent
reconciliation, and require a new preparation after expiry or chain transition.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `pnpm --filter @cobia/web test -- lib/programs/wallet-stage-client.test.ts components/agent/AgentProgramView.test.tsx && pnpm --filter @cobia/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/wallet apps/web/lib/programs apps/web/components/wallet apps/web/components/agent
git commit -m "feat(web): execute verified multi-chain stages"
```

### Task 8: Activate One Real x402 Offer

**Files:**
- Modify: `apps/web/lib/commerce/production-manifest.ts`
- Modify: `apps/web/lib/commerce/production-manifest.test.ts`
- Create: `docs/evidence/x402-mainnet-offer.md`

**Interfaces:**
- Consumes: existing commerce placement verifier and x402 receipt verifier.
- Produces: exactly one independently verified HTTPS X Layer offer or a documented blocking code.

- [ ] **Step 1: Capture official offer and failing manifest test**

Verify endpoint HTTPS, facilitator, USD₮0 EIP-3009 identity/code hash/name/version,
payee, exact amount, product commitment, and immediate receipt semantics. Do not
activate PixelBrief while its resource remains HTTP-only.

- [ ] **Step 2: Run the manifest and placement tests**

Run: `pnpm --filter @cobia/web test -- lib/commerce/production-manifest.test.ts lib/commerce/program-verifier.test.ts lib/commerce/x402-receipt-verifier.test.ts`
Expected: FAIL until a valid entry is present; otherwise record the external blocker.

- [ ] **Step 3: Add the exact entry without fallback**

Keep production empty if no real offer satisfies every check. Never substitute
a fake merchant or weaken HTTPS/evidence rules for the demo.

- [ ] **Step 4: Run the full commerce slice**

Run: `pnpm --filter @cobia/web test -- lib/commerce`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/commerce/production-manifest.ts apps/web/lib/commerce/production-manifest.test.ts docs/evidence/x402-mainnet-offer.md
git commit -m "feat(commerce): register verified mainnet offer"
```

### Task 9: End-to-End Release Gates

**Files:**
- Modify: `docs/coding-agent-sandbox-v1.md`
- Modify: `docs/releases/2026-08-18-general-intent-v3-readiness.md`
- Create: `docs/evidence/general-intent-mainnet-readiness.md`

**Interfaces:**
- Produces: exact live/staged/blocked truth and reproducible gate evidence.

- [ ] **Step 1: Run focused security suites**

Run all new domain, solver, broker, instrument, stage, wallet, commerce, and UI tests.

- [ ] **Step 2: Run workspace gates**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm build && pnpm audit --audit-level high`
Expected: PASS with exact counts recorded.

- [ ] **Step 3: Run opt-in evidence gates**

Run: `pnpm --filter @cobia/web test:integration && pnpm --filter @cobia/web test:fork`
Expected: PASS, or record the exact external RPC/container blocker without claiming readiness.

- [ ] **Step 4: Verify browser paths without broadcasting**

Exercise swap, bridge/acquisition, and x402 review paths on desktop and mobile;
stop at wallet confirmation. Confirm expired/history copy is non-actionable.

- [ ] **Step 5: Commit and release only verified logical groups**

Inspect all tracked/untracked changes, preserve concurrent work, commit logical
conventional groups, rebase safely onto current `main`, push without force,
deploy Vercel production, apply safe migrations, and verify `getcobia.com`.
Never use a mainnet principal transaction as a release test.
