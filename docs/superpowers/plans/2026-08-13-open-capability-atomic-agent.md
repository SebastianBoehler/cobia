# Open-Capability Atomic Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace new V2 candidate markets with a protocol-neutral coding-agent program that can be independently verified, replayed, attested, and atomically executed by its owner wallet.

**Architecture:** A canonical capability program resolves versioned trusted modules which reconstruct protocol calls and semantic evidence. A Safe-governed risk manager and generic atomic executor enforce active permissions, token-specific caps, nonces, refunds, and final balance constraints; unsupported actions fail closed with no legacy fallback.

**Tech Stack:** TypeScript, Zod, viem, Next.js 16, PostgreSQL/Drizzle, Vercel Sandbox, OpenAI tool orchestration, Solidity 0.8.30, Foundry, Anvil, Vitest.

## Global Constraints

- X Layer mainnet is chain `196`; testnet is `1952` and is never protocol-execution evidence.
- The sandbox receives no private key, signing method, credential RPC URL, production send method, or browser wallet handle.
- New V2 intents use only the coding-agent path; unsupported proposals reject with no deterministic, selector-agent, raw-calldata, or historical-route fallback.
- The core program/executor are protocol-neutral; initial trusted modules are Uniswap exact input, Curve exact input, and Aave supply.
- Production principal transactions are signed and sent only by the owner browser wallet.
- Risk-increasing governance changes wait 48 hours; emergency restrictions are immediate.
- Handwritten source files stay below 300 lines.

---

### Task 1: Canonical capability program and registry

**Files:**
- Create: `packages/solvers/src/capabilities/program.ts`
- Create: `packages/solvers/src/capabilities/module.ts`
- Create: `packages/solvers/src/capabilities/registry.ts`
- Test: `packages/solvers/test/capability-program.test.ts`
- Modify: `packages/solvers/src/index.ts`

**Interfaces:**
- Produces: `CapabilityProgramV1Schema`, `capabilityProgramCommitmentV1`, `CapabilityModuleV1`, and `createCapabilityRegistryV1(modules)`.

- [ ] Write failing tests that canonical programs accept unknown module IDs structurally, reject noncanonical JSON/numbers/value, cap actions/constraints at eight, and resolve only an exact `id@version` module key.
- [ ] Run `pnpm --filter @cobia/solvers test -- capability-program.test.ts`; expect missing exports.
- [ ] Implement strict schemas and registry lookup without protocol-name unions in the core.
- [ ] Run the focused test and `pnpm --filter @cobia/solvers typecheck`; expect PASS.
- [ ] Commit with `feat(solvers): define open capability programs`.

### Task 2: Trusted Swaps and Aave capability modules

**Files:**
- Create: `apps/web/lib/capabilities/aave-supply.ts`
- Create: `apps/web/lib/capabilities/uniswap-exact-input.ts`
- Create: `apps/web/lib/capabilities/curve-exact-input.ts`
- Create: `apps/web/lib/capabilities/registry.ts`
- Test: `apps/web/lib/capabilities/modules.test.ts`

**Interfaces:**
- Consumes: `CapabilityModuleV1` and `PROTOCOL_REGISTRY`.
- Produces: `productionCapabilityRegistryV1` and independently compiled calls, flows, deployments, and evidence predicates.

- [ ] Write failing table tests for correct calldata plus adversarial recipient, amount, token, fee/index, target, proxy/code identity, selector, and allowance expansion cases.
- [ ] Run `pnpm --filter @cobia/web test -- lib/capabilities/modules.test.ts`; expect module import failures.
- [ ] Implement one focused module per capability and a registry containing only the three active versions.
- [ ] Run focused tests, web typecheck, and `git diff --check`; expect PASS.
- [ ] Commit with `feat(verifier): add trusted DeFi capabilities`.

### Task 3: Generic verifier and asset-flow proof

**Files:**
- Create: `packages/solvers/src/capabilities/asset-flow.ts`
- Modify: `packages/solvers/src/coding-agent-proposal.ts`
- Modify: `packages/solvers/src/coding-agent-verifier.ts`
- Test: `packages/solvers/test/capability-asset-flow.test.ts`
- Test: `packages/solvers/test/coding-agent-verifier.test.ts`

**Interfaces:**
- Consumes: canonical program, module registry, manifest, policy, and replay callback.
- Produces: `verifyCapabilityProgramV1(input)` returning compiled actions, derived constraints, and stable rejection codes only after replay.

- [ ] Write failing tests proving unknown modules, raw calls, overspend, unavailable intermediate output, extra/missing calls, stale/reorged blocks, deployment/proxy changes, spoofed evidence, and replay mismatch all reject.
- [ ] Run both focused solver tests; expect the old call-array verifier to fail the new contract.
- [ ] Replace hardcoded Aave decoding with module compilation and protocol-neutral asset conservation; preserve exact evidence comparison.
- [ ] Run all solver tests and typecheck; expect PASS.
- [ ] Commit with `feat(verifier): verify composed capability programs`.

### Task 4: Configurable Safe-governed risk manager

**Files:**
- Create: `contracts/src/CobiaRiskManagerV1.sol`
- Create: `contracts/test/CobiaRiskManagerV1.t.sol`
- Create: `contracts/test/CobiaRiskManagerInvariant.t.sol`

**Interfaces:**
- Produces: access checks, current verifier, token enablement, token limits, usage consumption, 48-hour proposals, and immediate emergency controls for the executor.

- [ ] Write failing Foundry tests for Safe ownership, allow/open modes, immediate deny/pause/reduction/disable, delayed open/token/increase/verifier activation, proposal replacement, heterogeneous token accounting, and unauthorized mutation.
- [ ] Run `pnpm contracts:test -- --match-contract CobiaRiskManager`; expect missing contracts.
- [ ] Implement the smallest manager satisfying the transition table, keeping each contract under 300 lines.
- [ ] Add invariant tests that no path bypasses pause/deny/token limits and risk increases cannot activate early.
- [ ] Run contract tests and `forge fmt --check`; expect PASS.
- [ ] Commit with `feat(contracts): add delayed atomic risk controls`.

### Task 5: Protocol-neutral atomic executor V2

**Files:**
- Create: `contracts/src/CobiaExecutorV2.sol`
- Create: `contracts/test/CobiaExecutorV2.t.sol`
- Create: `contracts/test/CobiaExecutorV2Security.t.sol`
- Create: `contracts/test/CobiaExecutorV2Invariant.t.sol`
- Modify: `apps/web/lib/atomic-execution/types.ts`
- Modify: `apps/web/lib/atomic-execution/project-route.ts`
- Test: `apps/web/lib/atomic-execution/project-route.test.ts`

**Interfaces:**
- Consumes: compiled capability actions, `CobiaRiskManagerV1`, and `CobiaAdapterRegistry`.
- Produces: exact `ExecutionRouteV2`, EIP-712 authorization, ABI encoder, and one atomic `execute` call.

- [ ] Write failing tests for arbitrary registered capability IDs while rejecting wrong owner/chain/signer/nonce/value/token/target/selector/code hash, cap expansion, retained approvals, missing refunds, reentrancy, and final-delta failure.
- [ ] Run focused Foundry and TypeScript tests; expect missing V2 interfaces.
- [ ] Implement generic dispatch and projection with no protocol branch in executor code.
- [ ] Run contract unit/fuzz/invariant tests and atomic TypeScript tests; expect PASS.
- [ ] Commit with `feat(execution): add configurable atomic program executor`.

### Task 6: Agent job persistence and coordinator

**Files:**
- Create: `apps/web/lib/db/agent-program-schema.ts`
- Create: `apps/web/lib/db/agent-programs.ts`
- Create: `apps/web/drizzle/0008_agent_programs.sql`
- Create: `apps/web/lib/db/agent-programs.integration.test.ts`
- Create: `apps/web/lib/coding-agent-sandbox/coordinator.ts`
- Create: `apps/web/lib/coding-agent-sandbox/coordinator.test.ts`
- Modify: `apps/web/lib/runtime/market.ts`

**Interfaces:**
- Produces: immutable job/provenance/program/verdict/replay/authorization records and an agent-only `openQuoteMarketV2`.

- [ ] Write failing repository tests for state transitions and immutable commitment binding, plus coordinator tests proving model/RPC/verifier credentials never enter sandbox inputs or logs.
- [ ] Run focused integration/unit tests; expect missing schema and coordinator.
- [ ] Implement the migration, repository, authenticated bounded sandbox/model tool loop, verification, replay, and post-verification attestation.
- [ ] Remove deterministic and candidate-selector solvers from new V2 market creation; propagate explicit rejection state without fallback.
- [ ] Run focused tests, migrations against disposable PostgreSQL, and typecheck; expect PASS.
- [ ] Commit with `feat(agent): persist verified sandbox programs`.

### Task 7: Owner-only atomic execution API and UI

**Files:**
- Create: `apps/web/app/api/agent-programs/[programId]/route.ts`
- Create: `apps/web/app/api/agent-programs/[programId]/authorization/route.ts`
- Create: `apps/web/components/routes/AtomicAgentExecution.tsx`
- Create: `apps/web/components/routes/AtomicAgentExecution.test.tsx`
- Create: `apps/web/lib/atomic-execution/client.ts`
- Modify: `apps/web/components/routes/PurchasedRouteView.tsx`

**Interfaces:**
- Consumes: owner proof, current governance/deployment reads, verified program record, and browser EIP-1193 wallet.
- Produces: exact approval, one atomic executor transaction, receipt reconciliation, and exact revocation when approval survives failure.

- [ ] Write failing API/UI tests for wrong wallet, wrong chain, stale authorization, changed governance/code, unlimited approval, calldata mismatch, rejected wallet request, ambiguous receipt, and approval revocation.
- [ ] Run focused web tests; expect missing routes/component/client.
- [ ] Implement no-store owner-only APIs and UI states that distinguish authored, verified, replayed, approved, submitted, confirmed, reverted, and approval-remains.
- [ ] Keep historical route rendering read-only and never invoke it as an execution fallback.
- [ ] Run focused tests, accessibility assertions, typecheck, lint, and build; expect PASS.
- [ ] Commit with `feat(web): execute verified agent programs atomically`.

### Task 8: Fork gate, release configuration, and paused deployment packet

**Files:**
- Create: `apps/web/lib/coding-agent-sandbox/atomic-program.fork.test.ts`
- Create: `contracts/script/DeployAtomicV2.s.sol`
- Create: `docs/runbooks/atomic-agent-mainnet.md`
- Modify: `.env.example`

**Interfaces:**
- Produces: reproducible chain-196 swap-to-Aave fork evidence and a Safe-owned paused deployment command/approval sheet without broadcasting it.

- [ ] Write a failing fork test that compiles one generated program, independently verifies it, replays it, executes V2 atomically, and matches final balances/events/commitments.
- [ ] Run the opt-in fork test; expect missing deployment and orchestration wiring.
- [ ] Implement deterministic deployment/config validation and document exact Safe, signer, tokens, permissions, caps, gas, hashes, pause, and canary approvals required.
- [ ] Run full unit/integration/contract/fork/typecheck/lint/build/audit/diff/LOC gates; expect no high-severity or behavioral failure.
- [ ] Commit with `test(fork): prove atomic agent program execution`.
- [ ] Push and deploy the web app with executor controls still paused; do not deploy contracts or broadcast a principal transaction without a separate explicit approval.
