# Cobia Verified Adapter Market Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let deterministic and bounded agentic solvers search a broad X Layer action graph without granting model output or opaque API calldata execution authority.

**Architecture:** Every integration supplies a versioned manifest, pinned deployment identities, block-bounded opportunity reader, typed action codec, deterministic calldata builder, simulation decoder, and postcondition validator. A generic graph engine combines compatible asset/position edges; the model only ranks graph-produced candidates and independent verification reconstructs every action.

**Tech Stack:** TypeScript 6, Zod, viem, Vitest, existing V2 domain/solver packages, X Layer RPC, official protocol ABIs, optional OKX OnchainOS quote API with local validation.

## Global Constraints

- Adapter IDs are exact versioned literals and registry changes alter a signed registry hash.
- Technical claims use official documentation, source, deployed bytecode, and fixed-block reads.
- API calldata is never executable until target, selector, tokens, amounts, recipient, deadline, slippage, code, and simulation pass locally.
- Missing, stale, rate-limited, malformed, reverted, or unsupported integrations fail closed and never become fallback data.
- APY remains estimated pre-gas unless gas is converted with a pinned asset price; future yield is never guaranteed.
- Agentic output is advisory selection over candidate IDs and explanations; it cannot introduce actions.
- No handwritten source file exceeds 300 lines.

---

### Task 1: Adapter manifest contract

**Files:**
- Create: `apps/web/lib/adapters/manifest.ts`
- Create: `apps/web/lib/adapters/manifest.test.ts`
- Create: `apps/web/lib/adapters/catalog.ts`
- Modify: `apps/web/lib/adapters/registry.ts`

**Interfaces:**
- Produces: `AdapterManifestV1<Opportunity,Action,Quote>` and `adapterCatalog`.

- [ ] **Step 1: Write RED manifest tests**

```ts
interface AdapterManifestV1<O, A, Q> {
  readonly id: AdapterId;
  readonly chainId: 196;
  readonly deployments: readonly PinnedDeployment[];
  read(input: AdapterReadInput): Promise<readonly O[]>;
  action: z.ZodType<A>;
  build(input: AdapterBuildInput<A>): OwnerTransactionV2;
  validateQuote(input: AdapterQuoteValidation<Q>): Q;
  validateReceipt(input: AdapterReceiptValidation<A>): ExecutionProtocolEvidenceV2;
}
```

Reject duplicate IDs, chain mismatch, unsorted deployments, empty runtime hash,
missing action codec, registry/catalog ID drift, and catalog hash drift.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @cobia/web exec vitest run lib/adapters/manifest.test.ts`

Expected: missing manifest module.

- [ ] **Step 3: Implement and migrate existing adapters**

Expose Aave V3, Curve StableSwap NG, and Uniswap V3 manifests using the existing
readers/builders/validators; do not duplicate ABIs or code hashes.

- [ ] **Step 4: Run GREEN**

Run adapter, execution, domain, and solver suites plus typecheck.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/adapters
git commit -m "refactor(adapters): define verified integration manifests"
```

### Task 2: Asset and position graph

**Files:**
- Create: `packages/domain/src/route-graph-v1.ts`
- Create: `packages/domain/test/route-graph-v1.test.ts`
- Create: `packages/solvers/src/graph-search-v1.ts`
- Create: `packages/solvers/test/graph-search-v1.test.ts`

**Interfaces:**
- Produces: canonical graph nodes, edges, and bounded candidate search.
- Consumes: manifest opportunities from one signed snapshot.

- [ ] **Step 1: Write RED graph tests**

Model nodes as `(chainId, assetOrPosition, ownerSemantics)` and edges with exact
input domain, output asset/position, amount function, cost estimate, expiry, and
adapter/action references. Test direct Aave, Curve-to-Aave,
Uniswap-to-Aave, one-sided LP, a two-way cycle rejection, split conservation,
maximum four actions, maximum three branches, and deterministic tie ordering.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @cobia/domain test -- route-graph-v1 && pnpm --filter @cobia/solvers test -- graph-search-v1`

Expected: missing graph modules.

- [ ] **Step 3: Implement bounded search**

Use integer arithmetic only. Search simple paths up to four edges and split only
at explicit allocation edges whose atomic inputs sum exactly to the signed
deployment amount. Deduplicate by canonical action commitment.

- [ ] **Step 4: Run GREEN and mutation cases**

Mutate units, asset identity, amount, branch sum, action order, quote expiry,
adapter ID, and registry hash; each mutation must reject.

- [ ] **Step 5: Commit**

```bash
git add packages/domain packages/solvers
git commit -m "feat(solvers): search verified route graphs"
```

### Task 3: Bounded agentic candidate selector

**Files:**
- Modify: `apps/web/lib/runtime/market.ts`
- Modify: agentic solver implementation and tests
- Create: `packages/solvers/src/agentic-selection-v1.ts`
- Create: `packages/solvers/test/agentic-selection-v1.test.ts`

**Interfaces:**
- Consumes: frozen candidate summaries with opaque candidate IDs.
- Produces: selected candidate ID, explanation, cited risk flags, and model metadata.

- [ ] **Step 1: Write RED authority tests**

Return model outputs containing unknown candidate, changed APY, calldata, target,
allocation, fake evidence URL, and critical risk. Assert unknown/changed data is
ignored or rejected and never reaches a signed bundle. A synchronous model
throw and timeout must not abort the deterministic solver.

- [ ] **Step 2: Run RED**

Run solver and runtime agentic suites.

- [ ] **Step 3: Implement structured selection**

The model schema contains only `candidateId`, `explanation`, and advisory risk
claims. The signed route is reconstructed from the frozen deterministic
candidate by ID and independently verified. Preserve no-model/no-key behavior as
an explicit solver failure, not a fake agentic quote.

- [ ] **Step 4: Run GREEN**

Run domain, solver, web runtime, and API suites.

- [ ] **Step 5: Commit**

```bash
git add packages/solvers apps/web/lib/runtime
git commit -m "feat(solvers): constrain agentic graph selection"
```

### Task 4: OKX DEX aggregate quote adapter

**Files:**
- Create: `apps/web/lib/adapters/okx-dex-client.ts`
- Create: `apps/web/lib/adapters/okx-dex-client.test.ts`
- Create: `apps/web/lib/adapters/okx-dex-adapter.ts`
- Create: `apps/web/lib/adapters/okx-dex-adapter.test.ts`
- Modify: `apps/web/lib/adapters/catalog.ts`

**Interfaces:**
- Consumes: official OKX `/quote` and `/swap` responses for chain 196.
- Produces: locally validated exact-input opportunity and action, initially with `disableRFQ=true`.

- [ ] **Step 1: Write RED API-boundary tests**

Reject wrong chain/token/input/output/slippage, missing expiry, price-impact cap,
router without code, router rotation absent from fresh official metadata,
unknown selector, Permit2 field, arbitrary approval, recipient mismatch, native
value, response mutation, 429, auth failure, and quote/swap disagreement.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @cobia/web exec vitest run lib/adapters/okx-dex*`

Expected: modules absent.

- [ ] **Step 3: Implement signed REST calls and local decoding**

Reuse the existing OKX request signer. Hash the exact response, require fresh
chain metadata and deployed code, decode only reviewed router selectors, and
project the decoded action through the same manifest/verifier boundary. Do not
use token metadata or USD prices from the response as authoritative.

- [ ] **Step 4: Add fixed-response and live opt-in checks**

Unit tests use committed redacted fixtures. An opt-in live command requests a
quote only, performs no wallet signing, and records chain, router, selector,
amounts, and code hash without credentials.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/adapters
git commit -m "feat(adapters): validate OKX DEX aggregate quotes"
```

### Task 5: Simulation evidence as a first-class artifact

**Files:**
- Create: `packages/domain/src/simulation-v1.ts`
- Create: `packages/domain/test/simulation-v1.test.ts`
- Create: `apps/web/lib/simulation/verify-trace.ts`
- Create: `apps/web/lib/simulation/verify-trace.test.ts`
- Modify: persistence schemas through a generated migration

**Interfaces:**
- Produces: canonical `SimulationEvidenceV1` committed by atomic authorization.

- [ ] **Step 1: Write RED evidence tests**

Bind chain, fork block number/hash, registry hash, route hash, transaction hash,
status, gas, ordered calls, token deltas, protocol events, final constraints,
runner version, and timestamp. Reject missing call attribution, wrong block,
unmatched event, hidden value, failed constraint, and cross-route replay.

- [ ] **Step 2: Run RED**

Run domain simulation and web trace suites.

- [ ] **Step 3: Implement canonical evidence and storage**

Persist evidence only after local recomputation. Do not treat provider “success”
or `eth_estimateGas` as simulation proof.

- [ ] **Step 4: Run GREEN including disposable PostgreSQL**

Run domain tests, web tests, and integration lane; assert exact round-trip and
uniqueness by route hash plus block hash.

- [ ] **Step 5: Commit**

```bash
git add packages/domain apps/web/lib/simulation apps/web/lib/db apps/web/drizzle
git commit -m "feat(simulation): persist route-bound execution evidence"
```

### Task 6: Protocol onboarding and truth gates

**Files:**
- Create: `docs/runbooks/protocol-onboarding.md`
- Modify: `docs/architecture/protocol-integrations.md`
- Create: `apps/web/lib/adapters/catalog.test.ts`

**Interfaces:**
- Produces: one mandatory checklist and a catalog-derived truth table.

- [ ] **Step 1: Encode the onboarding checklist in tests**

Every catalog entry must have official docs/source links, license, chain and
addresses, fixed block/hash, runtime hashes, proxy implementation evidence,
ABI source, reader tests, action decoder tests, fork proof, failure modes,
postconditions, maintenance owner, and product copy label.

- [ ] **Step 2: Generate the public truth table from the catalog**

Statuses are only `live-read`, `fork-executed`, `beta-executable`,
`historical`, or `unimplemented`. The product and README import generated data
or share the same source; they do not hand-maintain breadth claims.

- [ ] **Step 3: Run full gates**

Run frozen install, all unit/integration/fork/atomic-fork tests, typecheck, lint,
build, production audit, Drizzle check, diff check, and LOC check.

- [ ] **Step 4: Commit**

```bash
git add docs apps/web/lib/adapters/catalog.test.ts
git commit -m "docs(adapters): gate verified protocol onboarding"
```
