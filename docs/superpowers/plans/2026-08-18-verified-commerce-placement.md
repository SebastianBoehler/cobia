# Verified Commerce Placement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let solvers propose bounded commerce placements from immutable offers while an independent verifier constrains payment, merchant, product commitment, recipient, deadline, and receipt evidence before the user wallet authorizes an exact X Layer action.

**Architecture:** A commerce policy references one immutable offer commitment. Solvers provide typed parameters only. A verifier-owned merchant capability manifest compiles direct-contract calls or exact x402 authorization requirements. Direct calls use the existing V3 user-wallet path; x402 uses one short-lived owner-signed EIP-3009 authorization or an owner-broadcast settlement transaction. Append-only placement records and chain evidence determine the truthful terminal state.

**Tech Stack:** TypeScript 5, Zod, viem, Vitest, Next.js App Router, Drizzle/PostgreSQL, Foundry/Anvil, React Testing Library, pnpm workspace.

**Spec:** `docs/superpowers/specs/2026-08-18-x402-commerce-discovery-design.md`

## Global Constraints

- No principal key, seed, browser wallet handle, signing method, or credential-bearing RPC enters the sandbox or server.
- The user wallet signs/broadcasts only the exact independently verified action; the server cannot expand payee, amount, asset, target, selector, recipient, quantity, or deadline.
- Only chain `196`, exact payment, zero native value, one asset, one merchant, and one receipt recipient are executable in v1.
- Permit2, delegation, split payments, subscriptions, refunds, shipping/tracking, buyer PII, and asynchronous commerce are rejected.
- Payment settlement is not called order issuance unless the independently configured receipt evidence verifies.
- No mainnet principal transaction is broadcast by tests or release tooling.
- Files remain below the 300 LOC soft limit; legacy MPP route purchase code is not a fallback.

## File Map

- `packages/domain/src/commerce-order-policy.ts`: signed policy and commitment.
- `packages/solvers/src/capabilities/commerce-order.ts`: typed solver proposal.
- `apps/web/lib/capabilities/commerce-order.ts`: verifier-owned compilation.
- `apps/web/lib/commerce/merchant-manifest.ts`: trusted semantic registry.
- `apps/web/lib/commerce/x402-authorization.ts`: exact EIP-3009 typed data and validation.
- `apps/web/lib/commerce/receipt-verifier.ts`: settlement/event/token evidence.
- `apps/web/lib/db/commerce-placement-schema.ts`: append-only placement lifecycle.
- `apps/web/app/api/commerce/placements/*`: prepare/submit/read endpoints.

---

### Task 1: Commerce Policy and Solver Proposal

**Files:**
- Create: `packages/domain/src/commerce-order-policy.ts`
- Create: `packages/domain/test/commerce-order-policy.test.ts`
- Modify: `packages/domain/src/index.ts`
- Create: `packages/solvers/src/capabilities/commerce-order.ts`
- Create: `packages/solvers/test/commerce-order.test.ts`
- Modify: `packages/solvers/src/index.ts`

**Interfaces:**
- Produces: `CommerceOrderPolicyV1Schema`, `CommerceOrderProgramV1Schema`, `commerceOrderPolicyCommitmentV1`, and `commerceOrderProgramCommitmentV1`.

- [ ] **Step 1: Write failing domain and solver tests**

Cover exact offer/manifest commitments, owner, receipt recipient, asset/max atomic payment, quantity, action/gas limits, deadline, nonce, evidence profile, and `commerce.order.place@1`. Reject chain mismatch, expired policy, zero/expanded quantity, asset/payee/recipient changes, excessive gas/actions, arbitrary calldata, unknown capability, and a program that references any offer other than the policy offer.

- [ ] **Step 2: Confirm RED**

Run: `pnpm --filter @cobia/domain test -- commerce-order-policy.test.ts && pnpm --filter @cobia/solvers test -- commerce-order.test.ts`

- [ ] **Step 3: Implement strict canonical schemas**

The program contains only `offerCommitment`, `quantity`, `orderCommitment`, `evidenceProfile`, and capability identity. It contains no target, selector, calldata, payee, asset, amount, or endpoint.

- [ ] **Step 4: Confirm GREEN**

Run: `pnpm --filter @cobia/domain test -- commerce-order-policy.test.ts && pnpm --filter @cobia/solvers test -- commerce-order.test.ts && pnpm --filter @cobia/domain typecheck && pnpm --filter @cobia/solvers typecheck`

- [ ] **Step 5: Commit**

```bash
git add packages/domain packages/solvers
git commit -m "feat(solvers): define bounded commerce programs"
```

### Task 2: Verifier-Owned Merchant Capability

**Files:**
- Create: `apps/web/lib/commerce/merchant-manifest.ts`
- Create: `apps/web/lib/commerce/merchant-manifest.test.ts`
- Create: `apps/web/lib/capabilities/commerce-order.ts`
- Create: `apps/web/lib/capabilities/commerce-order.test.ts`
- Modify: `apps/web/lib/capabilities/registry.ts`

**Interfaces:**
- Produces: `CommerceMerchantManifestV1Schema`, `compileCommerceOrderActionV1`, and a `CapabilityModuleV1` with id `commerce.order.place`, version `1`.

- [ ] **Step 1: Write failing manifest/compiler tests**

Require runtime code hash and optional proxy implementation hash, exact selector, ABI parameter positions, fixed merchant/payee/asset, quantity bounds, receipt event topic or ERC-721/ERC-1155 contract/token binding, and placement mode `direct-contract | x402-exact`. Mutate each trusted field and assert a stable rejection code. Reject ABI-only entries, arbitrary dynamic calldata, native value, and unbound recipient fields.

- [ ] **Step 2: Confirm RED**

Run: `pnpm --filter @cobia/web test -- lib/commerce/merchant-manifest.test.ts lib/capabilities/commerce-order.test.ts`

- [ ] **Step 3: Implement compilation and registry integration**

Resolve the offer and manifest by commitment, verify equality for merchant/product/payment fields, ABI-encode only documented fixed layouts, and return an exact asset-flow declaration plus receipt evidence requirement.

- [ ] **Step 4: Confirm GREEN**

Run: `pnpm --filter @cobia/web test -- lib/commerce/merchant-manifest.test.ts lib/capabilities/commerce-order.test.ts lib/capabilities/modules.test.ts`

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/capabilities apps/web/lib/commerce
git commit -m "feat(web): compile verified commerce placements"
```

### Task 3: Independent Proposal Verification

**Files:**
- Create: `apps/web/lib/commerce/program-verifier.ts`
- Create: `apps/web/lib/commerce/program-verifier.test.ts`
- Modify: `apps/web/lib/runtime/general-coding-agent.ts`
- Modify: `apps/web/lib/runtime/general-coding-agent.test.ts`

**Interfaces:**
- Consumes: immutable offer, policy, solver program, merchant manifest, pinned block, and replay evidence.
- Produces: `verifyCommerceProgramV1(input)` returning accepted canonical projection or stable rejection codes.

- [ ] **Step 1: Write failing adversarial verifier tests**

Cover offer expiry/source hash, policy signature/commitment, owner/recipient, chain, manifest/code/proxy identity, selector, value, amount/asset/payee, deadline, nonce, action/gas bounds, forbidden targets/assets, receipt binding, stale block, reorg, mutable evidence, spoofed trace, and replay mismatch. Require the verifier to recompile and compare exact bytes.

- [ ] **Step 2: Confirm RED**

Run: `pnpm --filter @cobia/web test -- lib/commerce/program-verifier.test.ts lib/runtime/general-coding-agent.test.ts`

- [ ] **Step 3: Implement fail-closed verification**

The sandbox receives only the canonical offer/policy, public wallet state, trusted manifest, and brokered read-only RPC descriptor. Agent rationale and fetched docs are provenance, never trust evidence. Return no authorization verdict from the sandbox runner.

- [ ] **Step 4: Confirm GREEN**

Run: `pnpm --filter @cobia/web test -- lib/commerce/program-verifier.test.ts lib/runtime/general-coding-agent.test.ts`

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/commerce apps/web/lib/runtime
git commit -m "feat(web): verify commerce solver programs"
```

### Task 4: Exact x402 Authorization

**Files:**
- Create: `apps/web/lib/commerce/x402-authorization.ts`
- Create: `apps/web/lib/commerce/x402-authorization.test.ts`
- Create: `apps/web/lib/commerce/x402-facilitator.ts`
- Create: `apps/web/lib/commerce/x402-facilitator.test.ts`

**Interfaces:**
- Produces: `buildX402AuthorizationRequestV1`, `verifyX402AuthorizationV1`, `verifyOwnerSettlementHashV1`, and bounded facilitator `verify/settle` calls.

- [ ] **Step 1: Write failing security tests**

Accept only exact EIP-3009 authorization for policy owner, fixed token/payee/value, one random nonce, `validAfter <= now`, short `validBefore`, chain `196`, and canonical domain. Reject Permit2/delegation, signature malleability, replay, altered casing/encoding, amount/payee/asset expansion, stale authorization, wrong token domain, facilitator redirect, credential leak, response mutation, and a transaction hash not sent by the owner or not matching exact settlement logs.

- [ ] **Step 2: Confirm RED**

Run: `pnpm --filter @cobia/web test -- lib/commerce/x402-authorization.test.ts lib/commerce/x402-facilitator.test.ts`

- [ ] **Step 3: Implement exact typed-data validation and broker**

Reuse only pure EIP-3009 primitives where byte-for-byte applicable; do not import the legacy MPP lifecycle. The facilitator request is constructed from independently resolved offer/policy fields, never from browser-supplied payment requirements.

- [ ] **Step 4: Confirm GREEN**

Run: `pnpm --filter @cobia/web test -- lib/commerce/x402-authorization.test.ts lib/commerce/x402-facilitator.test.ts`

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/commerce
git commit -m "feat(web): authorize exact x402 settlements"
```

### Task 5: Placement Persistence and API

**Files:**
- Create: `apps/web/lib/db/commerce-placement-schema.ts`
- Create: `apps/web/lib/db/commerce-placements.ts`
- Create: `apps/web/lib/db/commerce-placements.integration.test.ts`
- Create: `apps/web/drizzle/0018_commerce_placements.sql`
- Modify: `apps/web/lib/db/schema.ts`
- Create: `apps/web/app/api/commerce/placements/route.ts`
- Create: `apps/web/app/api/commerce/placements/route.test.ts`
- Create: `apps/web/app/api/commerce/placements/[placementId]/authorization/route.ts`
- Create: `apps/web/app/api/commerce/placements/[placementId]/authorization/route.test.ts`
- Create: `apps/web/app/api/commerce/placements/[placementId]/settlement/route.ts`
- Create: `apps/web/app/api/commerce/placements/[placementId]/settlement/route.test.ts`

**Interfaces:**
- Produces: append-only states `prepared | authorizing | submitted | confirmed | rejected` and authenticated prepare/authorization/settlement endpoints.

- [ ] **Step 1: Write failing integration and route tests**

Cover immutable offer/policy/program commitments, authenticated owner, monotonic state, idempotency, concurrent submissions, exact signature/hash binding, replay prevention, terminal rejection details, row locks, and no storage of raw private credentials or buyer PII.

- [ ] **Step 2: Confirm RED**

Run: `pnpm --filter @cobia/web test:integration -- lib/db/commerce-placements.integration.test.ts && pnpm --filter @cobia/web test -- app/api/commerce/placements`

- [ ] **Step 3: Implement migration, repository, and routes**

Store only canonical commitments, public addresses, exact authorization hash, public transaction hash, state, rejection code, and timestamps. Return conflicts for stale state and never retry settlement silently.

- [ ] **Step 4: Confirm GREEN**

Run: `pnpm --filter @cobia/web test:integration -- lib/db/commerce-placements.integration.test.ts && pnpm --filter @cobia/web test -- app/api/commerce/placements`

- [ ] **Step 5: Commit**

```bash
git add apps/web/drizzle apps/web/lib/db apps/web/app/api/commerce
git commit -m "feat(web): persist commerce placements"
```

### Task 6: Receipt Evidence and Fresh Fork Reproduction

**Files:**
- Create: `apps/web/lib/commerce/receipt-verifier.ts`
- Create: `apps/web/lib/commerce/receipt-verifier.test.ts`
- Create: `apps/web/lib/commerce/commerce-fork-replay.ts`
- Create: `apps/web/lib/commerce/commerce-fork-replay.fork.test.ts`
- Create: `contracts/test/utils/CommerceReceiptMerchant.sol`
- Create: `contracts/test/CommerceReceiptMerchant.t.sol`

**Interfaces:**
- Produces: `verifyCommerceReceiptV1` and `replayCommercePlacementV1` with immutable trace/state-diff/block commitments.

- [ ] **Step 1: Write failing evidence tests**

Cover required event issuer/topic/indexed owner/order commitment, ERC-721 ownership, ERC-1155 balance increase, exact x402 settlement, missing/spoofed logs, unrelated NFT, wrong recipient, reverted tx, stale anchor, reorged block, code upgrade, trace mutation, and payment-only evidence being labeled `payment-settled` rather than `onchain-order`.

- [ ] **Step 2: Confirm RED**

Run: `pnpm --filter @cobia/web test -- lib/commerce/receipt-verifier.test.ts && X_LAYER_FORK=1 pnpm --filter @cobia/web test -- lib/commerce/commerce-fork-replay.fork.test.ts`

- [ ] **Step 3: Implement verification and replay**

Verify code identities at the pinned block, broadcast only to disposable Anvil, reproduce exact compiled calls, and commit block hash, transaction bytes, trace hash, state-diff hash, and evidence observations. Always stop the fork in `finally`.

- [ ] **Step 4: Confirm GREEN**

Run: `pnpm --filter @cobia/web test -- lib/commerce/receipt-verifier.test.ts && X_LAYER_FORK=1 pnpm --filter @cobia/web test -- lib/commerce/commerce-fork-replay.fork.test.ts && scripts/forge.sh test --match-path test/CommerceReceiptMerchant.t.sol -vv`

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/commerce contracts/test
git commit -m "feat(commerce): verify placement receipts"
```

### Task 7: Wallet Execution and Truthful UI

**Files:**
- Create: `apps/web/components/commerce/CommercePlacementView.tsx`
- Create: `apps/web/components/commerce/CommercePlacementView.test.tsx`
- Create: `apps/web/app/commerce/placements/[placementId]/page.tsx`
- Modify: `apps/web/components/intents/IntentComposer.tsx`
- Modify: `apps/web/components/intents/IntentComposer.test.tsx`
- Modify: `apps/web/lib/execution-v2/mainnet-execution-client.ts`
- Modify: `apps/web/lib/execution-v2/mainnet-execution-client.test.ts`

**Interfaces:**
- Consumes: accepted verifier projection and placement APIs.
- Produces: exact wallet confirmation flow for direct V3 or x402 authorization/hash submission.

- [ ] **Step 1: Write failing UI/execution tests**

Assert selected offers are resolved server-side, the user sees exact merchant/product/quantity/payment/recipient/deadline/evidence, chain mismatch blocks, wallet confirmation is explicit, direct calls equal verified bytes, x402 typed data equals verified authorization, stale offers require re-verification, and terminal copy distinguishes `Order issued`, `Payment settled`, and rejection.

- [ ] **Step 2: Confirm RED**

Run: `pnpm --filter @cobia/web test -- components/commerce/CommercePlacementView.test.tsx components/intents/IntentComposer.test.tsx lib/execution-v2/mainnet-execution-client.test.ts`

- [ ] **Step 3: Implement the user-wallet-only flow**

Do not add a server signer or automatic production broadcaster. Preserve guarded per-transaction confirmation, receipt attribution, reconciliation, security headers, and exact verified sequence checks.

- [ ] **Step 4: Confirm GREEN**

Run: `pnpm --filter @cobia/web test -- components/commerce/CommercePlacementView.test.tsx components/intents/IntentComposer.test.tsx lib/execution-v2/mainnet-execution-client.test.ts && pnpm --filter @cobia/web typecheck && pnpm --filter @cobia/web lint`

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/commerce apps/web/components apps/web/lib/execution-v2
git commit -m "feat(web): confirm verified commerce placements"
```

### Task 8: Release Gate Without Principal Broadcast

- [ ] Run every focused test from Tasks 1–7.
- [ ] Run `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.
- [ ] Run PostgreSQL integration suites and the opt-in pinned X Layer Anvil fork test.
- [ ] Run `scripts/forge.sh test -vv`, `git diff --check`, dependency audit, and changed-file LOC checks.
- [ ] Verify production merchant manifests contain real code/proxy/event/token identities; otherwise keep commerce execution disabled while discovery remains visible.
- [ ] Verify no server-side principal signer/send method, unrestricted mainnet RPC, secret, buyer PII, or mainnet principal test exists.
- [ ] Keep V3 production paused until its separate Safe activation gate is independently complete.
