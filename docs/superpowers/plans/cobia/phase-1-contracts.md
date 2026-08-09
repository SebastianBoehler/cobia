# Cobia Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy a minimal event ledger and a constrained Aave V3 supply path whose safety properties are covered by unit, fuzz, and invariant tests.

**Architecture:** `CobiaLedger` owns provenance while `CobiaExecutor` owns policy enforcement. The executor has one immutable adapter; the adapter has one immutable Aave pool and no generic call surface. Network addresses are discovered and verified before deployment, then committed as deployment evidence.

**Tech Stack:** Solidity 0.8.30, Foundry, OpenZeppelin Contracts 5.x, Viem.

## Global Constraints

- Use the constraints in `../2026-08-09-cobia-mvp.md`.
- No upgradeability, proxy, owner-controlled target changes, arbitrary calldata, or token rescue function in MVP.
- Production deployment arguments must be committed in `contracts/deployments/<chainId>.json` with source URLs and bytecode checks.

---

### Task 1: Implement the provenance ledger

**Files:**
- Create: `contracts/foundry.toml`
- Create: `contracts/src/interfaces/ICobiaLedger.sol`
- Create: `contracts/src/CobiaLedger.sol`
- Create: `contracts/test/CobiaLedger.t.sol`

**Interfaces:**
- Produces `openRequest`, `commitBundle`, `commitVerification`, `selectBundle`,
  `recordPayment`, `recordReveal`, `recordExecution`, and `recordOutcome`.
- Produces getters `requestOwner(bytes32)`, `policyHash(bytes32)`, and `selectedBundle(bytes32)`.

- [ ] **Step 1: Initialize Foundry and dependencies**

```bash
forge init contracts --force --no-commit
cd contracts
forge install OpenZeppelin/openzeppelin-contracts@v5.4.0 --no-commit
rm -f src/Counter.sol test/Counter.t.sol script/Counter.s.sol
```

- [ ] **Step 2: Write failing lifecycle tests**

```solidity
function test_onlyRequestOwnerSelectsCommittedBundle() public {
  vm.prank(recorder);
  ledger.openRequest(REQUEST_ID, owner, POLICY_HASH, 1_234);
  vm.prank(recorder);
  ledger.commitBundle(REQUEST_ID, SOLVER_ID, BUNDLE_HASH, EVIDENCE_ROOT);
  vm.prank(owner);
  ledger.selectBundle(REQUEST_ID, BUNDLE_HASH);
  assertEq(ledger.selectedBundle(REQUEST_ID), BUNDLE_HASH);
}
```

Also test duplicate request IDs, unknown requests, uncommitted selections,
double selection, payment before selection, reveal before payment, payment
receipt replay, unauthorized execution recorder, and outcome writes before
execution.

- [ ] **Step 3: Verify the tests fail**

```bash
cd contracts && forge test --match-contract CobiaLedgerTest -vv
```

Expected: compilation fails because `CobiaLedger` is missing.

- [ ] **Step 4: Implement event-oriented state transitions**

```solidity
interface ICobiaLedger {
  function openRequest(bytes32 requestId, address owner, bytes32 policyHash_, uint64 snapshotBlock) external;
  function commitBundle(bytes32 requestId, bytes32 solverId, bytes32 bundleHash, bytes32 evidenceRoot) external;
  function commitVerification(bytes32 requestId, bytes32 bundleHash, bytes32 verdictHash, bool executable) external;
  function selectBundle(bytes32 requestId, bytes32 bundleHash) external;
  function recordPayment(bytes32 requestId, bytes32 bundleHash, bytes32 receiptHash, bytes32 txHash) external;
  function recordReveal(bytes32 requestId, bytes32 bundleHash, bytes32 revealHash) external;
  function recordExecution(bytes32 requestId, bytes32 bundleHash, address asset, uint256 amount) external;
}
```

Store only lifecycle guards and commitments; emit the complete public fields.
An immutable recorder may open requests, commit bundles/verdicts, record
payments/reveals, and record outcomes; only the declared request owner may
select. Payment must reference the selected bundle and reveal must follow a
payment. Set the immutable
executor exactly once in the constructor. Permit a zero executor only on chain
`1952`; require a nonzero executor on chain `196`.

- [ ] **Step 5: Verify and commit**

```bash
cd contracts && forge fmt --check && forge test --match-contract CobiaLedgerTest -vv
git add contracts
git commit -m "feat(contracts): add cobia provenance ledger"
```

### Task 2: Implement the constrained Aave supply path

**Files:**
- Create: `contracts/src/interfaces/IAavePool.sol`
- Create: `contracts/src/interfaces/ICobiaAdapter.sol`
- Create: `contracts/src/adapters/AaveV3SupplyAdapter.sol`
- Create: `contracts/src/CobiaExecutor.sol`
- Create: `contracts/test/CobiaExecutor.t.sol`
- Modify: `packages/domain/src/policy.ts`
- Modify: `packages/domain/test/domain.test.ts`

**Interfaces:**
- Produces Solidity `Policy` with the same field order as TypeScript `policyCommitment`.
- Produces `executeAaveSupply(Policy calldata, bytes32 bundleHash, uint256 amount)`.
- Produces adapter `supply(address asset, uint256 amount, address beneficiary)`.

- [ ] **Step 1: Fix the cross-runtime policy tuple**

```solidity
struct Policy {
  bytes32 requestId;
  address owner;
  uint256 chainId;
  address asset;
  uint128 principalAtomic;
  uint16 maxProtocolExposureBps;
  uint128 minTvlUsdE6;
  uint32 minNetApyBps;
  uint32 maxSnapshotAgeSec;
  uint64 deadline;
}
```

TypeScript must hash the ABI-encoded tuple with Keccak-256. Add one golden vector
whose expected hash is produced by both Foundry and Vitest.

- [ ] **Step 2: Write failing executor tests**

Cover successful supply plus wrong sender, wrong chain, expired policy, policy
hash mismatch, unselected bundle, amount above principal, amount above exposure,
unsupported asset, adapter revert, and reentrancy. Assert approvals return to
zero and the beneficiary—not the executor—receives the aToken.

- [ ] **Step 3: Implement the adapter**

```solidity
function supply(address asset, uint256 amount, address beneficiary) external {
  IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
  IERC20(asset).forceApprove(address(POOL), amount);
  POOL.supply(asset, amount, beneficiary, 0);
  IERC20(asset).forceApprove(address(POOL), 0);
}
```

Restrict `msg.sender` to the immutable executor and use custom errors.

- [ ] **Step 4: Implement the executor**

Verify the ledger policy commitment and selection, calculate
`maxAmount = principalAtomic * maxProtocolExposureBps / 10_000`, pull exactly
`amount`, approve only the adapter, call `supply`, clear approval, then call
`ledger.recordExecution`. Guard with `nonReentrant`.

- [ ] **Step 5: Run focused and cross-runtime tests**

```bash
cd contracts && forge test --match-contract CobiaExecutorTest -vv
pnpm --filter @cobia/domain test
```

Expected: all safety cases and the shared policy hash vector pass.

- [ ] **Step 6: Commit**

```bash
git add contracts packages/domain
git commit -m "feat(contracts): constrain aave execution by policy"
```

### Task 3: Add fuzz and invariant coverage

**Files:**
- Create: `contracts/test/invariant/ExecutorHandler.sol`
- Create: `contracts/test/invariant/CobiaExecutor.invariant.t.sol`

**Interfaces:**
- Tests existing contracts without changing their public surface.

- [ ] **Step 1: Build a bounded handler**

The handler opens requests, commits/selects bundles, approves tokens, executes
bounded supplies, advances time, and attempts invalid calls from arbitrary
addresses. Bound principal to `1..1_000_000e6` and exposure to `1..10_000` bps.

- [ ] **Step 2: Assert invariants**

```solidity
function invariant_executorNeverRetainsUnderlying() public view {
  assertEq(asset.balanceOf(address(executor)), 0);
}

function invariant_totalSuppliedNeverExceedsSelectedPolicyCaps() public view {
  assertLe(handler.totalSupplied(), handler.totalAuthorized());
}
```

Also assert adapter/executor allowances are zero after every completed call and
no execution exists without a selected committed bundle.

- [ ] **Step 3: Run a meaningful campaign**

```bash
cd contracts && forge test --match-path 'test/invariant/*' --fuzz-runs 10000 -vv
```

Expected: four invariants pass across 10,000 runs.

- [ ] **Step 4: Commit**

```bash
git add contracts/test/invariant
git commit -m "test(contracts): prove executor safety invariants"
```

### Task 4: Resolve mainnet addresses and rehearse provenance on testnet

**Files:**
- Create: `scripts/resolve-xlayer-contracts.ts`
- Create: `contracts/script/Deploy.s.sol`
- Create: `contracts/deployments/1952.json`
- Create: `scripts/verify-deployment.ts`
- Create: `docs/evidence/xlayer-testnet-contracts.md`

**Interfaces:**
- Produces verified mainnet protocol inputs and a testnet deployment file containing the provenance ledger.

- [ ] **Step 1: Resolve and verify live protocol addresses**

The resolver combines the passed OKX investment detail with the Aave X Layer
market configuration, then uses RPC to require non-empty bytecode, `POOL` reserve
support for the asset, matching decimals/symbol, and chain ID. If any assertion
fails, it exits non-zero and writes nothing.

- [ ] **Step 2: Add a deterministic deployment script**

For mainnet/fork, deploy ledger, predict executor, deploy adapter bound to that executor and the
verified pool, deploy executor bound to ledger/adapter/asset, and assert the
ledger's immutable executor. Use network-specific `CREATE2` salts derived from
the chain ID and release name `cobia-v1`.

- [ ] **Step 3: Deploy the ledger and verify on X Layer testnet**

```bash
pnpm tsx scripts/resolve-xlayer-contracts.ts --chain 196
cd contracts && forge script script/Deploy.s.sol:Deploy --rpc-url "$XLAYER_TESTNET_RPC_URL" --broadcast --verify -vv
pnpm verify:deployment --network xlayer-testnet
```

Expected: ledger bytecode and constructor arguments match, and evidence contains
its Explorer transaction link. The testnet deployment does not deploy an Aave
adapter or claim testnet Aave support; its executor constructor argument is zero.

- [ ] **Step 4: Rehearse selection on testnet and execution on a mainnet fork**

On testnet, run open/commit/select with real x402 test assets. Then fork X Layer
mainnet at a recorded block and run open/commit/select/approve/execute against
the real Aave pool using a funded test account. Assert the beneficiary receives
the position token and the ledger emits `ExecutionRecorded`.

```bash
git add contracts/deployments/1952.json contracts/script scripts docs/evidence
git commit -m "feat(chain): deploy cobia contracts to x layer testnet"
```
