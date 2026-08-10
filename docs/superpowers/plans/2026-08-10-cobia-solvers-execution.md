# Cobia Solvers and Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the allocation-only quote with typed competing routes over real X Layer Aave V3 and Uniswap V3 state, then prepare capped atomic execution only after balance and simulation checks.

**Architecture:** Domain-owned `RoutePlan` actions carry no arbitrary calldata. Direct protocol readers construct immutable snapshots, four deterministic solvers propose plans, and a verifier resolves registered adapters, recomputes costs, checks wallet eligibility, and simulates the exact transaction. Foundry contracts enforce the same adapter and spending boundaries on-chain.

**Tech Stack:** TypeScript 6, Zod 4, viem 2, Next.js 16 APIs, PostgreSQL, Vitest, Foundry/Solidity.

## Global Constraints

- Only authoritative X Layer deployments may become registered adapters.
- Solvers submit typed actions, never target addresses, selectors, or calldata.
- AI may annotate risk or reject evidence; it cannot author executable fields.
- No-action must win when incremental yield does not exceed costs and uncertainty.
- Execution stays disabled until balance, gas, freshness, allowance, and simulation checks pass.
- Beta contracts enforce per-transaction and per-day caps and never retain principal after an atomic call.

---
### Task 1: Define typed route plans and eligibility states

**Files:**
- Create: `packages/domain/src/route-plan.ts`
- Create: `packages/domain/src/eligibility.ts`
- Modify: `packages/domain/src/index.ts`
- Create: `packages/domain/test/route-plan.test.ts`
**Interfaces:**
- Produces: `RoutePlanSchema`, `RouteActionSchema`, `RouteEligibilitySchema`, and their inferred TypeScript types.
- [ ] **Step 1: Write failing schema tests**
```ts
it("rejects solver-supplied targets and calldata", () => {
  expect(() => RoutePlanSchema.parse({ ...fixturePlan, actions: [{
    kind: "aave-v3-supply", adapterId: "aave-v3@1", assetId: "xlayer:usdt",
    amountAtomic: "1000000", target: attacker, calldata: "0xdeadbeef",
  }] })).toThrow();
});

it("requires every route edge to conserve amounts", () => {
  expect(validateConservation(nonConservingPlan)).toEqual({ ok: false, code: "AMOUNT_MISMATCH" });
});
```
- [ ] **Step 2: Run tests and confirm missing route schemas fail**

Run: `pnpm --filter @cobia/domain test -- route-plan.test.ts`
Expected: FAIL because the schemas do not exist.
- [ ] **Step 3: Implement the discriminated action union**
```ts
export const RouteActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("hold"), adapterId: z.literal("hold@1"), assetId: AssetIdSchema, amountAtomic: AtomicSchema }),
  z.object({ kind: z.literal("aave-v3-supply"), adapterId: z.literal("aave-v3@1"), assetId: AssetIdSchema, amountAtomic: AtomicSchema }),
  z.object({ kind: z.literal("aave-v3-withdraw"), adapterId: z.literal("aave-v3@1"), assetId: AssetIdSchema, amountAtomic: AtomicSchema }),
  z.object({ kind: z.literal("uniswap-v3-exact-input"), adapterId: z.literal("uniswap-v3@1"), tokenIn: AssetIdSchema, tokenOut: AssetIdSchema, amountInAtomic: AtomicSchema, minimumOutAtomic: AtomicSchema, fee: z.union([z.literal(100), z.literal(500), z.literal(3000), z.literal(10000)]) }),
]);
```
- [ ] **Step 4: Run tests and commit**

Run: `pnpm --filter @cobia/domain test && pnpm --filter @cobia/domain typecheck`
Expected: PASS.
```bash
git add packages/domain
git commit -m "feat(domain): add typed route plans"
```
### Task 2: Add authoritative Aave and Uniswap readers

**Files:**
- Create: `apps/web/lib/adapters/registry.ts`
- Create: `apps/web/lib/adapters/aave-v3-reader.ts`
- Create: `apps/web/lib/adapters/uniswap-v3-reader.ts`
- Create: `apps/web/lib/adapters/readers.test.ts`
- Modify: `apps/web/lib/orchestrator/capture-snapshot.ts`
**Interfaces:**
- Produces: `readAaveReserves(client, assets)`, `readAavePositions(client, owner)`, `quoteUniswapExactInput(client, quote)`, and `resolvePool(client, tokenA, tokenB, fee)`.
- [ ] **Step 1: Write failing reader tests against recorded RPC responses**
```ts
it("rejects a pool address not returned by the official factory", async () => {
  rpc.getPool.mockResolvedValue(officialPool);
  await expect(resolvePool(rpc, usdg, usdt, 100, replacementPool)).rejects.toThrow("factory");
});

it("rejects paused or frozen Aave reserves", async () => {
  rpc.getReserveData.mockResolvedValue({ ...reserve, paused: true });
  await expect(readAaveReserves(rpc, [usdt])).rejects.toThrow("paused");
});
```
- [ ] **Step 2: Run tests and confirm failure**

Run: `pnpm --filter @cobia/web test -- lib/adapters/readers.test.ts`
Expected: FAIL because the readers are absent.
- [ ] **Step 3: Register exact deployment identities and read direct state**
```ts
export const XLAYER_ADAPTER_REGISTRY = {
  "uniswap-v3@1": {
    factory: "0x4B2ab38DBF28D31D467aA8993f6c2585981D6804",
    quoterV2: "0xd1b797d92d87b688193a2b976efc8d577d204343",
    router: "0x4f0c28f5926afda16bf2506d5d9e57ea190f9bca",
  },
} as const;
```
- [ ] **Step 4: Verify readers and commit**

Run: `pnpm --filter @cobia/web test -- lib/adapters/readers.test.ts && pnpm --filter @cobia/web typecheck`
Expected: PASS; failed RPC calls remain explicit failures.
```bash
git add apps/web/lib/adapters apps/web/lib/orchestrator/capture-snapshot.ts
git commit -m "feat(adapters): read X Layer protocols directly"
```
### Task 3: Implement four independent route solvers

**Files:**
- Create: `packages/solvers/src/no-action.ts`
- Create: `packages/solvers/src/direct-lend.ts`
- Create: `packages/solvers/src/swap-then-lend.ts`
- Create: `packages/solvers/src/split-optimizer.ts`
- Create: `packages/solvers/src/cost-model.ts`
- Modify: `packages/solvers/src/research.ts`
- Modify: `packages/solvers/src/index.ts`
- Create: `packages/solvers/test/route-solvers.test.ts`
**Interfaces:**
- Consumes: `RouteSnapshot`, policy amount, horizon, registered asset and adapter IDs.
- Produces: four `RouteSolver` implementations returning signed `RoutePlan` objects.
- The research solver becomes `annotateRisk(plan, evidence): RiskAnnotation`; its output can only add evidence, lower a score, or block a registered protocol.
- [ ] **Step 1: Write failing solver table tests**
```ts
it.each([
  ["short horizon with high gas", costlySnapshot, "no-action"],
  ["same-asset reserve", directSnapshot, "direct-lend"],
  ["profitable USDG conversion", swapSnapshot, "swap-then-lend"],
  ["capacity-limited reserve", splitSnapshot, "split-optimizer"],
])("selects %s", async (_name, snapshot, expected) => {
  expect((await compete(snapshot)).winner.solverId).toBe(expected);
});
```
- [ ] **Step 2: Run tests and confirm unavailable solvers fail**

Run: `pnpm --filter @cobia/solvers test -- route-solvers.test.ts`
Expected: FAIL.
- [ ] **Step 3: Implement one algorithm per file using a shared cost model**
```ts
export function netReturnAtomic(input: {
  principalAtomic: bigint; apyBps: number; horizonDays: number;
  gasAtomic: bigint; swapCostAtomic: bigint; platformFeeAtomic: bigint; uncertaintyAtomic: bigint;
}): bigint {
  const gross = input.principalAtomic * BigInt(input.apyBps) * BigInt(input.horizonDays) / 10_000n / 365n;
  return gross - input.gasAtomic - input.swapCostAtomic - input.platformFeeAtomic - input.uncertaintyAtomic;
}
```
- [ ] **Step 4: Run solver tests and commit**

Run: `pnpm --filter @cobia/solvers test && pnpm --filter @cobia/solvers typecheck`
Expected: PASS with stable tie-breaking by solver ID.
```bash
git add packages/solvers
git commit -m "feat(solvers): compete over typed yield routes"
```
### Task 4: Verify routes and compute wallet eligibility

**Files:**
- Create: `packages/domain/src/verify-route.ts`
- Create: `packages/domain/test/verify-route.test.ts`
- Create: `apps/web/lib/execution/check-eligibility.ts`
- Create: `apps/web/lib/execution/check-eligibility.test.ts`
- Modify: `apps/web/lib/orchestrator/run-market.ts`
**Interfaces:**
- Produces: `verifyRoutePlan(plan, snapshot, policy)` and `checkWalletEligibility(plan, owner, client)`.
- [ ] **Step 1: Write failing correctness and shortfall tests**
```ts
it("reports the exact token shortfall", async () => {
  balances.set(usdt, 10_000_000n);
  expect(await checkWalletEligibility(planFor25Usdt, owner, client)).toMatchObject({
    state: "insufficient_balance", shortfalls: [{ assetId: "xlayer:usdt", amountAtomic: "15000000" }],
  });
});
```
- [ ] **Step 2: Run focused tests and confirm failure**

Run: `pnpm --filter @cobia/domain test -- verify-route.test.ts && pnpm --filter @cobia/web test -- lib/execution/check-eligibility.test.ts`
Expected: FAIL.
- [ ] **Step 3: Implement verification and the two-stage state model**
```ts
export type ExecutionState =
  | { state: "policy_invalid"; reasons: string[] }
  | { state: "insufficient_balance"; shortfalls: AssetShortfall[] }
  | { state: "needs_simulation" }
  | { state: "ready_to_execute"; simulationBlock: string; transaction: PreparedTransaction };
```
- [ ] **Step 4: Run domain, web, and orchestrator tests; commit**

Run: `pnpm --filter @cobia/domain test && pnpm --filter @cobia/web test -- lib/execution/check-eligibility.test.ts lib/orchestrator/run-market.test.ts`
Expected: PASS and no quote uses the old generic `executable` label in user-facing copy.
```bash
git add packages/domain apps/web/lib/execution apps/web/lib/orchestrator
git commit -m "feat(verifier): separate policy and wallet eligibility"
```
### Task 5: Build and verify capped atomic executor contracts

**Files:**
- Create: `contracts/foundry.toml`
- Create: `contracts/src/AdapterRegistry.sol`
- Create: `contracts/src/CobiaExecutor.sol`
- Create: `contracts/src/adapters/AaveV3Adapter.sol`
- Create: `contracts/src/adapters/UniswapV3Adapter.sol`
- Create: `contracts/src/ExecutionLedger.sol`
- Create: `contracts/test/CobiaExecutor.t.sol`
- Create: `contracts/test/CobiaExecutorInvariant.t.sol`
**Interfaces:**
- Produces: `execute(Route calldata route, bytes32 commitment)` with registered adapter dispatch and cap enforcement.
- [ ] **Step 1: Write failing Foundry unit and invariant tests**
```solidity
function test_RevertsForUnregisteredAdapter() public {
    vm.expectRevert(AdapterRegistry.UnknownAdapter.selector);
    executor.execute(routeUsing(address(0xBEEF)), routeCommitment);
}

function invariant_ExecutorRetainsNoPrincipal() public view {
    assertEq(inputToken.balanceOf(address(executor)), 0);
}
```
- [ ] **Step 2: Run Foundry and confirm missing contracts fail**

Run: `cd contracts && forge test -vvv`
Expected: FAIL because contracts are absent.
- [ ] **Step 3: Implement registry, caps, recipient enforcement, and atomic adapter dispatch**
```solidity
if (route.amountIn > perTransactionCap[route.inputToken]) revert TransactionCapExceeded();
if (spentToday[day][route.inputToken] + route.amountIn > dailyCap[route.inputToken]) revert DailyCapExceeded();
if (route.recipient != msg.sender) revert InvalidRecipient();
```
- [ ] **Step 4: Run unit, fuzz, invariant, and X Layer fork tests**

Run: `cd contracts && forge test -vvv`
Expected: PASS; the executor retains no principal after successful and reverted calls.
- [ ] **Step 5: Commit contracts**
```bash
git add contracts
git commit -m "feat(contracts): add capped atomic route executor"
```
### Task 6: Add simulation and execution APIs plus route controls

**Files:**
- Create: `apps/web/lib/execution/prepare-transaction.ts`
- Create: `apps/web/app/api/routes/[routeId]/simulate/route.ts`
- Create: `apps/web/app/api/routes/[routeId]/execute/route.ts`
- Modify: `apps/web/components/routes/PurchasedRouteView.tsx`
- Create: `apps/web/components/routes/ExecutionPanel.tsx`
- Create: `apps/web/components/routes/ExecutionPanel.test.tsx`
**Interfaces:**
- Produces: exact-amount approval, simulation response, and prepared transaction for the connected buyer only.
- [ ] **Step 1: Write failing insufficient-funds and ready-state tests**
```tsx
it("shows a shortfall instead of execute", () => {
  render(<ExecutionPanel eligibility={shortfallFixture} />);
  expect(screen.getByText("15 USDT more required")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Execute route" })).not.toBeInTheDocument();
});
```
- [ ] **Step 2: Run the component test and confirm failure**

Run: `pnpm --filter @cobia/web test -- components/routes/ExecutionPanel.test.tsx`
Expected: FAIL.
- [ ] **Step 3: Implement simulation-first controls and explicit activity transitions**
```ts
const simulation = await publicClient.simulateContract({ ...prepared, account: owner });
await activity.appendActivity({ kind: "simulation", status: "confirmed", detail: { blockNumber: block.toString() } });
return { state: "ready_to_execute", simulationBlock: block.toString(), request: simulation.request };
```
- [ ] **Step 4: Run complete verification and browser test the real wallet flow**

Run: `pnpm test && pnpm lint && pnpm typecheck && pnpm build && (cd contracts && forge test -vvv)`
Expected: PASS. Browser flow must show a route shortfall for the current 10 USDT wallet and must not offer execution for the stored 25,000 USDT request.
- [ ] **Step 5: Commit the execution surface**
```bash
git add apps/web/lib/execution apps/web/app/api/routes apps/web/components/routes
git commit -m "feat(execution): simulate and prepare capped routes"
```
