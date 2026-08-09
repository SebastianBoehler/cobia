# Cobia Product and Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the light-first Cobia request and quote-market interface, complete the winner-pay/reveal Agentic Wallet loop, deploy publicly, and produce reproducible hackathon evidence.

**Architecture:** The browser renders a server-derived registry of trusted comparison blocks; model output can supply text but never markup or components. Agentic Wallet receives explicit contract calls, while the page verifies selection and execution directly from X Layer. Outcome observations compare predicted and current position data without claiming guaranteed returns.

**Tech Stack:** Next.js, React, Tailwind CSS, Playwright 1.62.1, Testing Library 16.3.2, Viem, Vercel-compatible Node runtime.

## Global Constraints

- Use the constraints in `../2026-08-09-cobia-mvp.md`.
- Do not display investment advice, guaranteed returns, fabricated confidence, or hidden risk scores.
- No arbitrary model-generated HTML, React, CSS, URLs, or transaction payloads.
- Every material number exposes its source time; every onchain state exposes an Explorer link.
- Use Geist Sans/Mono, the light semantic token system, progressive disclosure,
  and the single animated route thread from the approved brand design.

---

### Task 1: Build the request experience

**Files:**
- Create: `apps/web/app/page.tsx`
- Create: `apps/web/app/requests/new/page.tsx`
- Create: `apps/web/components/request/PolicyForm.tsx`
- Create: `apps/web/components/request/PolicySummary.tsx`
- Create: `apps/web/components/request/AgenticWalletPrompt.tsx`
- Create: `apps/web/components/request/PolicyForm.test.tsx`

**Interfaces:**
- Consumes `POST /api/requests`.
- Produces a policy form with wallet, principal, exposure, minimum TVL/APY, and deadline.

- [ ] **Step 1: Write interaction tests**

Test invalid address, non-integer atoms, exposure outside `1..10_000`, deadline
over 24 hours, missing acknowledgement, API failure, and successful creation.
Assert submission remains disabled until the exact policy summary is visible.

- [ ] **Step 2: Implement the form**

Use human decimal inputs only at the UI boundary and convert once to atomic
integer strings. Show the configured asset and decimals from the server, not a
user-editable token address. Require acknowledgement that Cobia presents
machine-generated research and that execution can lose value.

- [ ] **Step 3: Render the free request handoff**

After creation, show request ID, policy commitment, competition state, and a
copyable Agentic Wallet instruction for inspecting the request. State that
principal remains in the wallet and payment occurs only after selecting a
verified quote. Never display secret-bearing CLI arguments.

- [ ] **Step 4: Verify and commit**

```bash
pnpm --filter @cobia/web vitest run components/request/PolicyForm.test.tsx
git add apps/web/app apps/web/components/request
git commit -m "feat(ui): create transparent allocation requests"
```

### Task 2: Build the safe generative result surface

**Files:**
- Create: `apps/web/lib/presentation/blocks.ts`
- Create: `apps/web/lib/presentation/build-blocks.ts`
- Create: `apps/web/lib/presentation/build-blocks.test.ts`
- Create: `apps/web/app/requests/[id]/page.tsx`
- Create: `apps/web/components/results/BlockRenderer.tsx`
- Create: `apps/web/components/results/OverviewBlock.tsx`
- Create: `apps/web/components/results/ConstraintMatrixBlock.tsx`
- Create: `apps/web/components/results/DisagreementBlock.tsx`
- Create: `apps/web/components/results/EvidenceBlock.tsx`
- Create: `apps/web/components/results/ProvenanceBlock.tsx`

**Interfaces:**
- Produces closed union `ResultBlock = QuoteOverview | ConstraintMatrix |
  RejectedRoute | SolverDisagreement | EvidenceSummary | PaymentReceipt |
  SimulationChanges | ExecutionProof`.
- Consumes only validated public request JSON.

- [ ] **Step 1: Test block selection**

Test collecting, verifying, agreeing quotes, allocation disagreement, risk
disagreement, rejected bundle, partial solver failure, selected, payment
pending, paid, revealed, and executed states. Unknown block types must fail
TypeScript exhaustiveness.

- [ ] **Step 2: Implement deterministic block generation**

Choose block order from actual result differences. If solvers agree, omit the
disagreement block. If any bundle is invalid, place the constraint matrix first.
Evidence URLs pass through a server allowlist of `https:` only and render with
host, retrieval date, claim, and content hash.

- [ ] **Step 3: Implement accessible components**

Use semantic headings, table captions, keyboard-visible focus, text labels in
addition to color, responsive single-column fallback, and `aria-live="polite"`
for state changes. Do not use a generic chatbot layout.

- [ ] **Step 4: Verify and commit**

```bash
pnpm --filter @cobia/web vitest run lib/presentation/build-blocks.test.ts
pnpm --filter @cobia/web lint
git add apps/web/lib/presentation apps/web/app/requests apps/web/components/results
git commit -m "feat(ui): render solver competition from trusted blocks"
```

### Task 3: Complete selection and rehearse Agentic Wallet execution

**Files:**
- Create: `apps/web/components/results/ExecutionPanel.tsx`
- Create: `apps/web/components/results/ExecutionPanel.test.tsx`
- Create: `apps/web/lib/chain/execution-state.ts`
- Create: `apps/web/lib/chain/execution-state.test.ts`
- Create: `scripts/e2e-selection-testnet.ts`
- Create: `scripts/e2e-execution-fork.ts`

**Interfaces:**
- Consumes selected quote, paid reveal API, and execution action list.
- Produces one x402 payment instruction followed by one constrained Agentic
  Wallet execution instruction and verifies resulting chain state.

- [ ] **Step 1: Test execution gating**

The execution panel is disabled before paid reveal and for collecting,
verifying, partial, invalid, stale, or uncommitted requests. On chain `1952` it
exposes selection/payment/reveal proof only. On chain `196`
it displays exact asset, amount, exposure, selected solver, contracts, deadline,
and all three calls before enabling execution copy.

- [ ] **Step 2: Create the execution instruction**

Tell Agentic Wallet to verify chain ID and each target, simulate all calls, then
execute ledger selection, exact token approval, and executor supply in sequence.
The instruction includes ABI-decoded descriptions and API-generated calldata;
it never asks the agent to infer amounts or addresses.

- [ ] **Step 3: Verify state from RPC**

Poll transaction receipts and ledger events. Require selected bundle equality,
`ExecutionRecorded`, executor underlying balance zero, allowances zero, and an
increased Aave position-token balance for the policy owner.

- [ ] **Step 4: Run selection on testnet and execution on a mainnet fork**

```bash
pnpm tsx scripts/e2e-selection-testnet.ts
pnpm tsx scripts/e2e-execution-fork.ts
```

Expected: testnet prints a real selection transaction link; the fork run prints
approval/execution receipts against verified mainnet Aave bytecode and exits `0`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/results apps/web/lib/chain scripts/e2e-selection-testnet.ts scripts/e2e-execution-fork.ts
git commit -m "feat(execution): close the agentic wallet loop"
```

### Task 4: Record measurable outcome observations

**Files:**
- Create: `apps/web/lib/outcomes/observe.ts`
- Create: `apps/web/lib/outcomes/observe.test.ts`
- Create: `apps/web/app/api/requests/[id]/outcome/route.ts`
- Create: `apps/web/components/results/OutcomeBlock.tsx`

**Interfaces:**
- Produces `observeOutcome(requestId): Promise<OutcomeObservation>`.
- Observation contains block/time, position balance, current APY, predicted APY, delta, and commitment.

- [ ] **Step 1: Write outcome tests**

Test no execution, wrong owner, position-token mismatch, unchanged position,
OKX product unavailable, negative APY delta, repeat observation at same block,
and a valid later observation.

- [ ] **Step 2: Implement read-only observation**

Read the execution event and position balance at a confirmed block, fetch current
OKX product detail, calculate integer APY delta, persist the observation, and
write only its commitment/block to the ledger. Label it an observation—not
realized profit—until enough time has elapsed for balance growth measurement.

- [ ] **Step 3: Render provenance and commit**

```bash
pnpm --filter @cobia/web vitest run lib/outcomes/observe.test.ts
git add apps/web/lib/outcomes apps/web/app/api/requests apps/web/components/results/OutcomeBlock.tsx
git commit -m "feat(outcomes): track solver decisions after execution"
```

### Task 5: Add browser-level acceptance tests

**Files:**
- Create: `apps/web/playwright.config.ts`
- Create: `apps/web/e2e/request-flow.spec.ts`
- Create: `apps/web/e2e/accessibility.spec.ts`

**Interfaces:**
- Verifies the deployed HTTP/UI story without providing a mock runtime mode.

- [ ] **Step 1: Install and configure Playwright**

```bash
pnpm --filter @cobia/web add -D @playwright/test@1.62.1
pnpm exec playwright install chromium
```

- [ ] **Step 2: Test the public testnet flow**

Use a pre-created real paid testnet request ID supplied through
`E2E_REQUEST_ID`. Verify policy, payment receipt, two solver cards, invalid
bundle rejection, evidence links, selected bundle, and testnet Explorer links.
Fail when the ID is absent; do not substitute seeded data.

- [ ] **Step 3: Test accessibility and mobile layout**

Run keyboard traversal, visible focus, heading order, table labels, color-independent
verdict text, and viewports `390x844` and `1440x900`.

- [ ] **Step 4: Commit**

```bash
E2E_REQUEST_ID="$TESTNET_REQUEST_ID" pnpm --filter @cobia/web playwright test
git add apps/web/playwright.config.ts apps/web/e2e
git commit -m "test(ui): cover the public solver-market journey"
```

### Task 6: Deploy, run mainnet gate, and prepare submission

**Files:**
- Create: `README.md`
- Create: `docs/architecture.md`
- Create: `docs/demo-script.md`
- Create: `docs/security.md`
- Create: `docs/evidence/mainnet.md` after approved execution
- Create: `contracts/deployments/196.json` after approved deployment

**Interfaces:**
- Produces public application, reproducible repository, demo evidence, and submission checklist.

- [ ] **Step 1: Deploy infrastructure without mainnet writes**

Provision PostgreSQL, set validated secrets, deploy the Node runtime, run
migrations, and verify `/api/health` checks database, OKX API, RPC chain ID, and
contract bytecode. Redact secrets from deployment logs.

- [ ] **Step 2: Run the clean-room testnet rehearsal**

```bash
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test
pnpm e2e:testnet
E2E_REQUEST_ID="$TESTNET_REQUEST_ID" pnpm --filter @cobia/web playwright test
```

Expected: all commands pass from a clean checkout and a new browser session.

- [ ] **Step 3: Present the exact mainnet change set for approval**

Show verified asset/Aave addresses, deterministic contract addresses, bytecode
hashes, winning solver recipient, treasury, `0.10` payment, 90/10 split, wallet,
principal cap, expected approvals, and Explorer URLs. Wait for explicit approval.

- [ ] **Step 4: After approval, deploy and execute the smallest practical value**

Deploy/verify contracts on chain `196`, create and pay one request through
Agentic Wallet, select a valid bundle, execute Aave supply, and capture every
public hash. Stop immediately on address, simulation, risk-grade, or amount mismatch.

- [ ] **Step 5: Produce submission assets**

README includes problem, why AI, why deterministic enforcement, architecture,
setup, tests, contract addresses, payment economics, and limitations. Record a
90-second demo following create → pay → compete → reject → select → execute →
observe. Complete the dedicated X account and submission form manually or only
after separate explicit authorization.

- [ ] **Step 6: Final verification and commit**

```bash
git diff --check
pnpm lint && pnpm typecheck && pnpm test
pnpm verify:deployment --network xlayer-mainnet
git add README.md docs contracts/deployments/196.json
git commit -m "docs: prepare cobia hackathon submission"
```
