# Cobia Atomic Executor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute a verified Aave or exact-input-swap-to-Aave route as one capped X Layer transaction whose complete state change reverts when any signed bound fails.

**Architecture:** A non-upgradeable executor pulls one supported six-decimal stablecoin, invokes only delayed-registry permissions, validates typed final balance constraints, refunds residual assets, and records commitments. A server verifier projects the existing branded V2 verdict into an EIP-712 authorization and the browser submits the exact reviewed calldata.

**Tech Stack:** Solidity 0.8.30, OpenZeppelin Contracts 5.6.1, Foundry in the existing digest-pinned container, viem, TypeScript 6, Vitest 4, Next.js 16.

## Global Constraints

- Chain 1952 is testnet evidence; chain 196 is the real protocol execution chain.
- Initial caps are 10,000,000 atomic per route, 50,000,000 per wallet per UTC day, and 250,000,000 cumulative.
- Initial atomic routes are direct Aave, Curve-to-Aave, and Uniswap-to-Aave; LP NFT mint remains guided.
- No arbitrary target, selector, asset, native value, delegatecall, proxy upgrade, model-authored calldata, or fallback protocol.
- The verifier must bind policy, snapshot, bundle, route, simulation, owner, executor, chain, deadline, and nonce.
- Every behavioral change starts with a failing test and ends with the narrow test, full affected suite, typecheck, lint, and diff check.
- No handwritten source file exceeds 300 lines.

---

### Task 1: Reproducible Solidity toolchain

**Files:**
- Create: `contracts/foundry.toml`
- Create: `contracts/src/interfaces/IERC20Minimal.sol`
- Create: `scripts/forge.sh`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Test: `contracts/test/Toolchain.t.sol`

**Interfaces:**
- Consumes: digest-pinned Foundry image `ghcr.io/foundry-rs/foundry:stable@sha256:043752653d5be351c71709091b3db97c4421c907eb40ea294195e7f532aadf46`.
- Produces: `pnpm contracts:test` and Solidity imports from `@openzeppelin/contracts` 5.6.1.

- [ ] **Step 1: Write the failing toolchain test**

```solidity
contract ToolchainTest is Test {
    function test_chainIdsRemainExplicit() public pure {
        assertEq(uint256(1952), 1952);
        assertEq(uint256(196), 196);
    }
}
```

- [ ] **Step 2: Run the missing command and capture RED**

Run: `pnpm contracts:test`

Expected: FAIL because the root script and `contracts/foundry.toml` do not exist.

- [ ] **Step 3: Add the pinned wrapper and compiler configuration**

`scripts/forge.sh` must mount the repository at `/workspace`, set the working
directory to `/workspace/contracts`, and pass all arguments to `forge`. Configure
`solc_version = "0.8.30"`, optimizer runs `200`, `evm_version = "cancun"`, and the
OpenZeppelin remapping into `../node_modules/@openzeppelin/contracts/`.

- [ ] **Step 4: Install the exact dependency and run GREEN**

Run:

```bash
pnpm add -Dw @openzeppelin/contracts@5.6.1
pnpm contracts:test
pnpm install --frozen-lockfile
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml contracts scripts/forge.sh
git commit -m "build(contracts): add pinned Foundry toolchain"
```

### Task 2: Delayed adapter permission registry

**Files:**
- Create: `contracts/src/CobiaAdapterRegistry.sol`
- Create: `contracts/test/CobiaAdapterRegistry.t.sol`

**Interfaces:**
- Consumes: `Ownable2Step` from OpenZeppelin.
- Produces: `permissionKey(bytes32,address,bytes4)`, `propose`, `activate`, `revoke`, `isActive`, and `paused`.

- [ ] **Step 1: Write registry RED tests**

Test exact key construction, non-owner rejection, 48-hour activation delay,
early activation rejection, immediate revoke, runtime-code-hash mismatch,
global pause, ownership transfer, and zero-address/zero-selector rejection.

```solidity
bytes32 key = registry.permissionKey(AAVE_ID, pool, IPool.supply.selector);
registry.propose(AAVE_ID, pool, IPool.supply.selector, pool.codehash);
vm.warp(block.timestamp + 48 hours);
registry.activate(key);
assertTrue(registry.isActive(AAVE_ID, pool, IPool.supply.selector));
```

- [ ] **Step 2: Run RED**

Run: `pnpm contracts:test --match-contract CobiaAdapterRegistryTest`

Expected: FAIL because `CobiaAdapterRegistry` is absent.

- [ ] **Step 3: Implement the minimal registry**

```solidity
struct Permission {
    bytes32 runtimeCodeHash;
    uint64 activateAfter;
    bool active;
}

function isActive(bytes32 adapterId, address target, bytes4 selector)
    external view returns (bool)
{
    Permission memory item = permissions[permissionKey(adapterId, target, selector)];
    return !paused && item.active && target.codehash == item.runtimeCodeHash;
}
```

Use custom errors and events. Do not add upgradeability or arbitrary delay
configuration.

- [ ] **Step 4: Run GREEN and fuzz keys**

Run: `pnpm contracts:test --match-contract CobiaAdapterRegistryTest -vvv`

Expected: PASS including a fuzz test proving different tuple members do not
reuse an active permission.

- [ ] **Step 5: Commit**

```bash
git add contracts/src/CobiaAdapterRegistry.sol contracts/test/CobiaAdapterRegistry.t.sol
git commit -m "feat(contracts): register delayed protocol permissions"
```

### Task 3: Capped atomic executor

**Files:**
- Create: `contracts/src/CobiaExecutorV1.sol`
- Create: `contracts/test/CobiaExecutorV1.t.sol`
- Create: `contracts/test/CobiaExecutorInvariant.t.sol`

**Interfaces:**
- Consumes: active registry permission and EIP-712 verifier signer.
- Produces: `execute(ExecutionRouteV1,VerifierAuthorizationV1,bytes)` and immutable beta caps.

- [ ] **Step 1: Write executor RED tests**

Define these exact structs in the test and production contract:

```solidity
struct StepV1 {
    bytes32 adapterId;
    address target;
    address spendToken;
    uint128 spendAmount;
    bytes data;
}

struct BalanceConstraintV1 {
    address token;
    address account;
    uint128 minimumIncrease;
}

struct ExecutionRouteV1 {
    bytes32 policyHash;
    bytes32 snapshotHash;
    bytes32 bundleHash;
    bytes32 routeHash;
    bytes32 simulationHash;
    address owner;
    address inputToken;
    uint128 inputAmount;
    uint64 deadline;
    bytes32 nonce;
    StepV1[] steps;
    BalanceConstraintV1[] constraints;
}
```

Cover owner mismatch, signer mismatch, chain/executor mismatch, expired route,
nonce replay, user allowlist, all three caps, unsupported input, nonzero native
value, permission mismatch, failed protocol call, temporary approval reset,
minimum balance delta, exact refund, pause, reentrancy, and emitted commitments.

- [ ] **Step 2: Run RED**

Run: `pnpm contracts:test --match-contract CobiaExecutorV1Test`

Expected: FAIL because `CobiaExecutorV1` is absent.

- [ ] **Step 3: Implement execution ordering**

The implementation order is fixed:

```solidity
_verifyAuthorization(route, authorization, signature);
_consumeNonce(route.owner, route.nonce);
_consumeCaps(route.owner, route.inputAmount);
IERC20(route.inputToken).safeTransferFrom(route.owner, address(this), route.inputAmount);
_captureConstraintBalances(route.constraints);
_executePermittedSteps(route.steps);
_assertConstraintDeltas(route.constraints);
_refundSupportedAssets(route.owner);
emit RouteExecuted(route.owner, route.bundleHash, route.routeHash, route.simulationHash);
```

Each step uses `forceApprove(target, spendAmount)`, calls with value zero, then
`forceApprove(target, 0)`. Reject calldata shorter than four bytes and require
the exact selector permission before approval.

- [ ] **Step 4: Add invariant tests**

Prove that successful execution leaves no supported token balance and no
allowance, cumulative input never exceeds 250,000,000, a nonce succeeds at most
once, and any failed constraint reverts every prior protocol effect.

- [ ] **Step 5: Run GREEN and static analysis**

Run:

```bash
pnpm contracts:test
pnpm contracts:test --fuzz-runs 10000
docker run --rm -v "$PWD:/workspace" trailofbits/eth-security-toolbox:latest slither /workspace/contracts/src/CobiaExecutorV1.sol
```

Expected: tests pass and Slither reports no unresolved high or critical issue.

- [ ] **Step 6: Commit**

```bash
git add contracts/src/CobiaExecutorV1.sol contracts/test
git commit -m "feat(contracts): enforce atomic route bounds"
```

### Task 4: Verifier authorization projection

**Files:**
- Create: `apps/web/lib/atomic-execution/types.ts`
- Create: `apps/web/lib/atomic-execution/authorization.ts`
- Create: `apps/web/lib/atomic-execution/authorization.test.ts`
- Create: `apps/web/lib/atomic-execution/project-route.ts`
- Create: `apps/web/lib/atomic-execution/project-route.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `{policy,snapshot,bundle,verdict}` with a live branded V2 verdict.
- Produces: `projectAtomicRouteV1()` and `signAtomicAuthorizationV1()`.

- [ ] **Step 1: Write mutation-complete RED tests**

Start from a valid direct Aave fixture and mutate every policy/snapshot/bundle,
owner, executor, chain, input, step target, selector, amount, recipient,
constraint, deadline, simulation hash, and nonce field. Assert projection or
verification rejects before signing.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @cobia/web exec vitest run lib/atomic-execution`

Expected: FAIL on missing modules.

- [ ] **Step 3: Implement exact EIP-712 data**

Use domain `CobiaAtomicExecutor`, version `1`, chain ID `196`, and the deployed
executor address. The struct signs only fixed-size commitments plus owner,
input, deadline, and nonce; `routeHash` commits the canonical nested route.
Read the verifier key only server-side as `ATOMIC_VERIFIER_PRIVATE_KEY`.

- [ ] **Step 4: Run GREEN**

Run: `pnpm --filter @cobia/web exec vitest run lib/atomic-execution`

Expected: all positive and mutation cases pass and signing is never called for
an invalid route.

- [ ] **Step 5: Commit**

```bash
git add .env.example apps/web/lib/atomic-execution
git commit -m "feat(execution): project atomic route authorizations"
```

### Task 5: Exact atomic calldata and fork proof

**Files:**
- Create: `apps/web/lib/atomic-execution/calldata.ts`
- Create: `apps/web/lib/atomic-execution/calldata.test.ts`
- Create: `apps/web/lib/atomic-execution/atomic-mainnet.fork.test.ts`
- Modify: `apps/web/lib/execution-v2/anvil-rehearsal.ts`
- Modify: `apps/web/package.json`

**Interfaces:**
- Consumes: authorized direct Aave, Curve-to-Aave, or Uniswap-to-Aave route.
- Produces: one `execute` transaction and fork evidence with exact postconditions.

- [ ] **Step 1: Write RED encoder tests**

Assert Curve/Uniswap recipients are the executor, Aave `onBehalfOf` is the
owner, spend amounts match prior quoted output bounds, every selector is
registered, no native value is encoded, and LP plans reject as guided-only.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @cobia/web exec vitest run lib/atomic-execution/calldata.test.ts`

Expected: FAIL on missing encoder.

- [ ] **Step 3: Implement calldata projection and fork deployment**

Deploy registry and executor into the existing pinned X Layer Anvil fork,
activate only the exact Aave, Curve, Uniswap, and supported-token permissions,
fund the owner with the input asset, approve the executor, and submit one
transaction.

- [ ] **Step 4: Run all three route families**

Run: `pnpm --filter @cobia/web test:atomic-fork`

Expected: direct Aave, Curve-to-Aave, and Uniswap-to-Aave each use one executor
transaction after approval and pass receipt, event, balance, allowance, refund,
and commitment checks.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/atomic-execution apps/web/lib/execution-v2/anvil-rehearsal.ts apps/web/package.json
git commit -m "test(execution): prove atomic routes on X Layer fork"
```

### Task 6: Persistent API and buyer UI

**Files:**
- Create: `apps/web/app/api/routes/[routeId]/execution/atomic/route.ts`
- Create: `apps/web/app/api/routes/[routeId]/execution/atomic/route.test.ts`
- Create: `apps/web/components/routes/AtomicRouteExecution.tsx`
- Create: `apps/web/components/routes/AtomicRouteExecution.test.tsx`
- Modify: `apps/web/components/routes/PurchasedRouteExecution.tsx`
- Modify: `apps/web/lib/db/execution-attempts.ts`
- Modify: `apps/web/lib/db/schema.ts`
- Create: next generated Drizzle migration and snapshot
- Test: `apps/web/lib/db/execution-attempts.integration.test.ts`

**Interfaces:**
- Consumes: passed exact fork rehearsal and fresh branded verification.
- Produces: prepared, submitted, confirmed, failed, expired, or reconciliation-required atomic attempt.

- [ ] **Step 1: Write API, component, and repository RED tests**

Cover wrong buyer, unselected buyer, no rehearsal, stale bundle, config drift,
cap exhaustion, prepared reload, one wallet send, hash persistence before poll,
confirmed receipt, reverted receipt, duplicate click, cross-route replay, and no
atomic action for LP routes.

- [ ] **Step 2: Run RED**

Run:

```bash
pnpm --filter @cobia/web exec vitest run app/api/routes components/routes/AtomicRouteExecution.test.tsx
pnpm --filter @cobia/web test:integration -- execution-attempts
```

Expected: missing endpoint/component/schema failures.

- [ ] **Step 3: Implement the smallest state machine**

The API returns decoded targets, amounts, minimum outputs, deadline, caps, and
the exact transaction. The client checks chain 196 and buyer, displays first-time
token approval separately, then submits one executor transaction. It never signs
or submits from the server.

- [ ] **Step 4: Run GREEN and full gates**

Run:

```bash
pnpm --filter @cobia/web test
pnpm --filter @cobia/web test:integration
pnpm --filter @cobia/web typecheck
pnpm --filter @cobia/web lint
pnpm build
git diff --check
```

Expected: every command exits 0.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/routes apps/web/components/routes apps/web/lib/db drizzle
git commit -m "feat(routes): execute verified routes atomically"
```

### Task 7: Security and deployment readiness checkpoint

**Files:**
- Create: `docs/security/atomic-executor-threat-model.md`
- Create: `docs/evidence/atomic-executor-verification.md`
- Modify: `README.md`
- Modify: `docs/architecture/protocol-integrations.md`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: a reviewed commit that is deployable but still paused.

- [ ] **Step 1: Document the threat model**

Cover malicious solver, malicious UI, stolen verifier key, registry owner,
protocol proxy upgrade, token callback, allowance race, replay, cap reset,
reorg, stale simulation, RPC compromise, and compromised selected wallet. Map
each to a contract or operational control and state the residual risk.

- [ ] **Step 2: Run the complete verification matrix**

Run:

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm --filter @cobia/web test:integration
pnpm --filter @cobia/web test:fork
pnpm --filter @cobia/web test:atomic-fork
pnpm contracts:test --fuzz-runs 10000
pnpm audit --prod --audit-level high
git diff --check
```

Expected: every command exits 0, with no unresolved high or critical audit item.

- [ ] **Step 3: Perform independent read-only contract review**

The review must return findings first with exact file/line references. Resolve
every P0-P2 through a new RED/GREEN cycle and rerun Step 2.

- [ ] **Step 4: Commit the checkpoint**

```bash
git add README.md docs
git commit -m "docs(security): define atomic executor beta boundary"
```

### Task 8: Onchain promotion gates

**Files:**
- Create: `contracts/script/DeployCobia.s.sol`
- Create: `contracts/deployments/1952.json` after confirmed testnet deployment
- Create: `contracts/deployments/196.json` after separately approved mainnet deployment
- Create: `docs/evidence/xlayer-testnet-executor.md`
- Create: `docs/evidence/xlayer-mainnet-canary.md`

**Interfaces:**
- Consumes: deployer address supplied locally without printing its key.
- Produces: verified testnet bytecode first; separately approved paused mainnet bytecode second.

- [ ] **Step 1: Test deterministic deployment**

Run the script against Anvil twice with the same CREATE2 salt and assert the
registry/executor addresses and runtime hashes are identical.

- [ ] **Step 2: Present the exact testnet transaction for approval**

Print only chain ID, deployer address, nonce, contract addresses, runtime hashes,
gas limit, gas price, and maximum OKB cost. Do not print a mnemonic or key.

- [ ] **Step 3: Deploy and verify on chain 1952**

After explicit approval, deploy paused contracts, verify source on the X Layer
testnet explorer, compare bytecode, and record explorer links and transaction
hashes in `docs/evidence/xlayer-testnet-executor.md`.

- [ ] **Step 4: Stop before mainnet and present the exact canary**

Mainnet requires a new approval containing the same fields plus allowed wallet,
input token, protocol targets, 10 USD route, minimum output, and pause test.

- [ ] **Step 5: Deploy paused mainnet contracts only after approval**

Verify code, activate reviewed permissions through the 48-hour delay, run pause,
then execute one approved 10 USD canary and persist its evidence.

- [ ] **Step 6: Commit deployment evidence**

```bash
git add contracts/deployments docs/evidence
git commit -m "chore(deploy): record verified X Layer executor deployments"
```
