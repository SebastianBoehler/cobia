# General-Intent Mainnet Vertical Slice Plan

Date: 20 August 2026

**Goal:** Demonstrate one wallet-controlled X Layer swap, one asynchronous LI.FI
bridge followed by acquisition of one registered tokenized instrument, and one
exact x402 payment. Every proposal comes from a typed solver harness and every
wallet request comes from an independent verifier.

**Spec:** `../specs/2026-08-20-general-intent-solver-plugins-design.md`

## Non-negotiable boundary

- Mainnet is X Layer `196`; Ethereum is `1`; X Layer testnet is `1952`.
- The agent and server receive no user key, wallet handle, credential RPC URL,
  production send method, or authority to label a proposal safe.
- Solvers emit canonical unsigned programs, artifacts, evidence, or abstention.
- Production execution is only the exact independently verified sequence shown
  to and confirmed by the browser wallet.
- RPC simulation is preferred when it yields complete trace/state-diff evidence.
  A disposable pinned fork is an evidence tool only, never an execution fallback.
- Bridges are asynchronous. Future APY, LP fees, price, shipping, refunds, and
  merchant fulfillment cannot share an atomic guarantee.
- Production instrument and merchant registries remain empty until complete
  evidence passes. No fake demo entry or weakened fallback is allowed.

## Completed checkpoint

- [x] Strict `OpenIntentPolicyV3`, signed solver claims, segmented reputation,
  canonical `TransactionProgramV1`, and commitment tests.
- [x] Open-program sandbox output parser and independent raw EVM verifier with
  policy, owner, code, calldata, approval, state-diff, trace, anchor, freshness,
  outcome, and replay checks.
- [x] Strict LI.FI wire normalization, deployment manifest, deterministic
  verifier, credential-stripping read broker, and harness tool.
- [x] Strict OKX exact-input verifier with committed Builder Code attribution.
- [x] Public intent listing/detail, program projection, signed solver-profile
  registration, SDK/example harness, solver evidence profiles, and docs site.
- [x] Fail-closed tokenized-instrument registry with exact issuer, contract,
  underlying, claim class, restrictions, jurisdiction, official-source, code,
  and expiry requirements. The production registry is intentionally empty.
- [x] x402/UCP discovery and exact placement/settlement primitives. The
  production merchant registry is intentionally empty.

Checkpoint commits: `a1dc3a0`, `905871b`, `affca62`, `80aa915`, and `7c31e11`.

## Release blockers

### 1. Signed community decision intake

**Files**

- `apps/web/lib/solver-exchange/decision-intake.ts`
- `apps/web/lib/solver-exchange/decision-intake.test.ts`
- `apps/web/app/api/intents/[intentId]/decisions/route.ts`
- `apps/web/app/api/intents/[intentId]/decisions/route.test.ts`
- `packages/solver-sdk/src/client.ts`
- `packages/solver-sdk/test/client.test.ts`

**TDD and implementation**

- [ ] Reject unknown solver, wrong signer, replayed nonce, wrong intent/revision,
  expired claim, changed decision, solver-selected snapshot, closed competition,
  oversized artifacts, and solver-authored acceptance.
- [ ] Confirm RED with the focused web and SDK tests.
- [ ] Recover the registered attestation signer and bind the claim's decision
  hash to canonical artifacts plus the coordinator-selected snapshot hash.
- [ ] Persist immutable proposal artifacts and invoke coordinator-owned provider,
  code, anchor, state-diff, and replay dependencies.
- [ ] Publish `attested` only after independent acceptance; otherwise preserve
  typed rejection codes. Do not expose the route if replay is unavailable.
- [ ] Add SDK submission of an already-signed claim; the SDK never accepts a key.

**Gate**

```bash
pnpm --filter @cobia/web test -- lib/solver-exchange/decision-intake.test.ts \
  'app/api/intents/[intentId]/decisions/route.test.ts'
pnpm --filter @cobia/solver-sdk test
pnpm --filter @cobia/web typecheck
pnpm --filter @cobia/solver-sdk typecheck
```

Commit: `feat(exchange): verify signed solver decisions`.

### 2. Immutable stage state and receipt reconciliation

**Files**

- `apps/web/lib/programs/stage-machine.ts`
- `apps/web/lib/programs/stage-machine.test.ts`
- `apps/web/lib/programs/lifi-service.ts`
- `apps/web/app/api/programs/[submissionId]/stages/[stageId]/route.ts`
- `apps/web/app/api/programs/[submissionId]/stages/[stageId]/route.test.ts`
- one additive migration for stage preparations, calls, and receipts

**TDD and implementation**

- [ ] Reject stage skipping, wrong owner proof/chain, stale preparation, changed
  quote, duplicate send/receipt, reorged receipt, spoofed bridge delivery, and
  destination preparation before finality.
- [ ] Persist an immutable preparation commitment for every exact call; approval
  and primary call have separate receipt identities.
- [ ] Return calls only after current account, chain, quote, code, anchor,
  simulation, and accepted-verdict checks.
- [ ] Read receipts independently. Never accept client-supplied calldata or
  client-declared bridge delivery as evidence.

**Gate**

```bash
pnpm --filter @cobia/web test -- lib/programs/stage-machine.test.ts \
  'app/api/programs/[submissionId]/stages/[stageId]/route.test.ts'
pnpm --filter @cobia/web typecheck
```

Commit: `feat(web): orchestrate verified program stages`.

### 3. Exact multi-chain wallet review

**Files**

- `apps/web/lib/wallet/eip1193.ts`
- `apps/web/components/wallet/WalletProvider.tsx`
- `apps/web/lib/programs/wallet-stage-client.ts`
- `apps/web/lib/programs/wallet-stage-client.test.ts`
- `apps/web/components/agent/AgentProgramView.tsx`
- `apps/web/components/agent/AgentProgramView.test.tsx`

**TDD and implementation**

- [ ] Show chain, asset, spend, recipient, approval, minimum output, deadline,
  async warning, and exact instrument identity before every wallet request.
- [ ] Reject account, chain, expiry, code, preparation, or calldata changes at
  send time and require one visible wallet confirmation per request.
- [ ] Support Ethereum `1` without changing X Layer `196` defaults. Send only
  server-prepared requests, wait for receipts, and submit only transaction hashes
  for independent reconciliation.

**Gate**

```bash
pnpm --filter @cobia/web test -- lib/programs/wallet-stage-client.test.ts \
  components/agent/AgentProgramView.test.tsx
pnpm --filter @cobia/web typecheck
```

Commit: `feat(web): execute verified multi-chain stages`.

### 4. Register one real instrument

- [ ] Select the exact token representation, not a ticker or company name.
- [ ] Capture official issuer and restriction sources with hashes, eligibility
  jurisdictions, custody/redemption semantics, proxy implementation, runtime
  code hashes, and evidence expiry.
- [ ] Confirm current transfer eligibility for the selected wallet without
  collecting or storing unnecessary identity data.
- [ ] Add exactly one manifest entry only when every field is independently
  supported; otherwise retain `INSTRUMENT_NOT_REGISTERED`.

Gate: `pnpm --filter @cobia/web test -- lib/instruments/registry.test.ts`.

Commit: `feat(web): register verified tokenized instrument`.

### 5. Register one real HTTPS x402 offer

- [ ] Re-read a live offer and bind HTTPS resource/facilitator, X Layer `196`,
  USDt0 EIP-3009 identity, payee, amount, product commitment, challenge expiry,
  and immediate receipt semantics.
- [ ] Keep PixelBrief blocked while its resource remains HTTP-only; see
  `../../evidence/x402-mainnet-offer.md`.
- [ ] Add exactly one manifest entry only after all checks pass. Payment
  settlement must not be labeled delivery or fulfillment.

Gate: `pnpm --filter @cobia/web test -- lib/commerce`.

Commit: `feat(commerce): register verified mainnet offer`.

## Activation and final release

- [ ] At or after `2026-08-20T12:30:41Z`, reread the X Layer V3 proposals and
  ask the user to execute the reviewed Safe activation batch. Cobia does not sign
  or broadcast it.
- [ ] Run `pnpm executor:v3:verify active` and independently verify the receipt,
  exact calls, capabilities, token limits, canary, pause state, identities, and
  runtime hashes.
- [ ] Use Node 24 and run focused security suites, `pnpm test`, typecheck, lint,
  build, production audit, PostgreSQL integration, Solidity, and real pinned
  Anvil-fork gates. Docker-backed gates must not be skipped in a readiness claim.
- [ ] Inspect all tracked/untracked work, preserve concurrent changes, commit
  logical conventional groups, push `main` without force, apply additive
  migrations through `0019`, deploy Vercel production, and verify desktop/mobile
  UI and public APIs.
- [ ] Run one production coordinator generation and independent replay without a
  principal mainnet transaction.
- [ ] Present one tiny user-approved V3 swap as the first live canary. Bridge,
  instrument, and x402 transactions remain separate explicit user decisions.

Evidence: `../../evidence/general-intent-mainnet-readiness.md`.
