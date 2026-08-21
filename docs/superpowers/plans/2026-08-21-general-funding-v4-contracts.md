# Executor V4 Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement non-upgradeable Executor V4 and Risk Manager V2 for one native-OKB or ERC-20 funding asset and general verifier-authorized calls.

**Architecture:** Separate structs/hashing, funding/refunds, and call validation into focused Solidity files. V4 uses ordinary `CALL`, exact commitments, optional governance caps rather than a token allowlist, and atomic rollback.

**Tech Stack:** Solidity 0.8.30, Foundry, OpenZeppelin 5.6.1, TypeScript interoperability vectors

**Spec:** `docs/superpowers/specs/2026-08-21-general-funding-executor-v4-design.md`

## Global Constraints

- Complete `docs/superpowers/plans/2026-08-21-general-funding-v4-types.md` first.
- One funding asset; zero address is the native OKB sentinel only.
- Ordinary `CALL` only: no delegatecall, creation, or arbitrary executor storage mutation.
- Maximum eight calls, eight predicates, eight constraints, sixteen approvals, and sixteen refund assets.
- Token admission is verifier/evidence based; governance may deny or cap an asset but does not maintain an execution allowlist.
- Every source file should remain below 300 lines.

---

### Task 1: General risk accounting without a token allowlist

**Files:**
- Create: `contracts/src/CobiaRiskManagerV2.sol`
- Create: `contracts/test/utils/RiskManagerV2TestBase.sol`
- Test: `contracts/test/CobiaRiskManagerV2.t.sol`
- Test: `contracts/test/CobiaRiskManagerV2Invariant.t.sol`

**Interfaces:**
- Produces: `consume(address wallet, bytes32 assetKey, uint128 debitAmount)`, `assetKey(uint8 kind,address token)`, delayed optional caps, immediate deny/pause/reduction, wallet access controls, verifier rotation.
- Consumer: `CobiaExecutorV4` is the immutable only caller.

- [ ] **Step 1: Write failing native/ERC-20 accounting tests**

```solidity
function testConsumesNativeAndUnconfiguredErc20WithoutAllowlisting() public {
    vm.prank(address(executor)); risk.consume(owner, risk.assetKey(0, address(0)), 1 ether);
    vm.prank(address(executor)); risk.consume(owner, risk.assetKey(1, address(token)), 10e6);
    assertEq(risk.walletDailyInput(owner, risk.assetKey(0, address(0)), uint64(block.timestamp / 1 days)), 1 ether);
}
function testDeniedAssetAndConfiguredCapFailClosed() public {
    bytes32 key = risk.assetKey(1, address(token));
    risk.denyAsset(key); vm.prank(address(executor)); vm.expectRevert(CobiaRiskManagerV2.AssetDenied.selector);
    risk.consume(owner, key, 1);
    bytes32 capped = risk.assetKey(1, address(secondToken));
    risk.proposeLimits(capped, CobiaRiskManagerV2.Limits(true, 10, 20, 30));
    vm.warp(block.timestamp + risk.CHANGE_DELAY()); risk.activateLimits(capped);
    vm.prank(address(executor)); vm.expectRevert(CobiaRiskManagerV2.RouteCapExceeded.selector); risk.consume(owner, capped, 11);
}
```

Cover wrong caller, pause, wallet access, delayed cap increase, immediate reduction, counters, and invalid asset identities.

- [ ] **Step 2: Run the focused Foundry test and verify RED**

Run: `scripts/forge.sh test --match-contract CobiaRiskManagerV2Test -vvv`

Expected: FAIL because V2 does not exist.

- [ ] **Step 3: Implement asset-keyed optional limits**

```solidity
function assetKey(uint8 kind, address token) public pure returns (bytes32) {
    if (kind > 1 || (kind == 0 && token != address(0)) || (kind == 1 && token == address(0))) {
        revert InvalidAsset();
    }
    return keccak256(abi.encode(kind, token));
}
function consume(address wallet, bytes32 key, uint128 amount) external {
    if (msg.sender != executor) revert OnlyExecutor();
    _requireAccess(wallet);
    if (assetDenied[key]) revert AssetDenied();
    Limits memory limits = assetLimits[key];
    if (limits.configured) _consumeConfigured(wallet, key, amount, limits);
    emit UsageConsumed(wallet, key, amount);
}
```

Unconfigured assets rely on the owner policy and verifier debit bound; governance can deny immediately or add/increase caps after 48 hours.

- [ ] **Step 4: Run unit and invariant tests**

Run: `scripts/forge.sh test --match-path 'test/CobiaRiskManagerV2*.t.sol' -vvv`

Expected: PASS, including monotonic counters and no access-control bypass.

- [ ] **Step 5: Commit the risk checkpoint**

```bash
git add contracts/src/CobiaRiskManagerV2.sol contracts/test/utils/RiskManagerV2TestBase.sol contracts/test/CobiaRiskManagerV2.t.sol contracts/test/CobiaRiskManagerV2Invariant.t.sol
git commit -m "feat(contracts): add general risk manager v2"
```

### Task 2: V4 structs, hashes, and funding acquisition

**Files:**
- Create: `contracts/src/CobiaExecutionTypesV4.sol`
- Create: `contracts/src/CobiaFundingV4.sol`
- Create: `contracts/src/CobiaExecutorV4.sol`
- Create: `contracts/test/utils/ExecutorV4TestBase.sol`
- Test: `contracts/test/CobiaExecutorV4Funding.t.sol`

**Interfaces:**
- Consumes: frozen TypeScript V4 ABI vectors and `CobiaRiskManagerV2`.
- Produces: payable `execute(ExecutionProgramV4,VerifierAuthorizationV4,bytes)`, `executionProgramHash()`, `authorizationDigest()`.

- [ ] **Step 1: Write failing native/ERC-20 funding tests**

```solidity
function testNativeRequiresExactMsgValueAndPreservesGasReserveOutsideExecutor() public {
    program.funding = nativeFunding(0.01 ether);
    vm.prank(owner); executor.execute{value: 0.01 ether}(program, auth(program), signature(program)); assertEq(address(executor).balance, 0);
}
function testErc20MeasuresDebitAndMinimumCredit() public {
    uint256 ownerBefore = token.balanceOf(owner);
    program.funding = erc20Funding(address(token), 10e6, 10e6);
    vm.prank(owner); token.approve(address(executor), 10e6); _executeAsOwner(program);
    assertEq(ownerBefore - token.balanceOf(owner), 10e6);
    assertEq(token.balanceOf(address(executor)), 0);
}
```

Assert wrong `msg.value`, native token not zero, ERC-20 token zero, zero debit/credit, credit above debit, fee outside bounds, reused nonce, expired deadline, wrong owner/chain/executor/hash, and TypeScript vector mismatch.

- [ ] **Step 2: Run the funding tests and verify RED**

Run: `scripts/forge.sh test --match-contract CobiaExecutorV4FundingTest -vvv`

Expected: FAIL because V4 contracts do not exist.

- [ ] **Step 3: Implement small funding and hashing units**

```solidity
enum FundingKind { Native, ERC20 }
struct FundingV4 { FundingKind kind; address token; uint128 debitAmount; uint128 minimumCredit; }

function acquire(FundingV4 calldata funding, address owner) internal returns (uint256 credited) {
    if (funding.kind == FundingKind.Native) {
        if (funding.token != address(0) || msg.value != funding.debitAmount) revert NativeValueMismatch();
        return msg.value;
    }
    if (msg.value != 0 || funding.token == address(0)) revert FundingInvalid();
    uint256 beforeOwner = IERC20(funding.token).balanceOf(owner);
    uint256 beforeExecutor = IERC20(funding.token).balanceOf(address(this));
    IERC20(funding.token).safeTransferFrom(owner, address(this), funding.debitAmount);
    credited = IERC20(funding.token).balanceOf(address(this)) - beforeExecutor;
    if (beforeOwner - IERC20(funding.token).balanceOf(owner) > funding.debitAmount || credited < funding.minimumCredit) revert FundingBoundsFailed();
}
```

The coordinator validates authorization, marks the nonce, consumes risk, and excludes pre-existing balances from credited/refundable deltas.

- [ ] **Step 4: Run funding and vector interop tests**

Run: `scripts/forge.sh test --match-contract 'CobiaExecutorV4(Funding|Interop)Test' -vvv`

Expected: PASS with hashes equal to `executor-v4-vectors.json`.

- [ ] **Step 5: Commit the funding checkpoint**

```bash
git add contracts/src/CobiaExecutionTypesV4.sol contracts/src/CobiaFundingV4.sol contracts/src/CobiaExecutorV4.sol contracts/test/utils/ExecutorV4TestBase.sol contracts/test/CobiaExecutorV4Funding.t.sol
git commit -m "feat(contracts): acquire native and erc20 funding"
```

### Task 3: General calls, approval cleanup, refunds, and outcomes

**Files:**
- Create: `contracts/src/CobiaCallGuardV4.sol`
- Modify: `contracts/src/CobiaExecutorV4.sol`
- Test: `contracts/test/CobiaExecutorV4Calls.t.sol`
- Test: `contracts/test/utils/GeneralCallTarget.sol`

**Interfaces:**
- Consumes: `CallV4`, `ApprovalV4`, `AssetV4`, `BalanceConstraintV4`, existing `CobiaStaticGuard.PredicateV1`.
- Produces: exact contract/recipient calls, per-call approval lifecycle, native/ERC-20 refund closure, account-scoped constraints.

- [ ] **Step 1: Write failing composed-call tests**

```solidity
function testNativeWrapSwapSupplyCompositionLeavesNoResidueOrAllowance() public {
    _execute(nativeWrapSwapSupplyProgram());
    assertEq(address(executor).balance, 0);
    assertEq(wokb.allowance(address(executor), router), 0);
    assertGe(aToken.balanceOf(owner), minimumReceipt);
}
function testRecipientPaymentRequiresEmptyCalldataAndSignedRecipient() public {
    program.calls[0] = recipientCall(payee, 0.01 ether);
    uint256 beforePayee = payee.balance; _executeNativeAsOwner(program, 0.01 ether);
    assertEq(payee.balance - beforePayee, 0.01 ether);
    program.calls[0].data = hex"12345678";
    vm.expectRevert(CobiaCallGuardV4.RecipientCallInvalid.selector);
    _executeNativeAsOwner(program, 0.01 ether);
}
```

Add red cases for code drift, target-kind/value/resource overflow, duplicate or lingering approval, revert, reentrancy, residue consumption, false predicate, and hidden loss.

- [ ] **Step 2: Run call tests and verify RED**

Run: `scripts/forge.sh test --match-contract CobiaExecutorV4CallsTest -vvv`

Expected: FAIL because call/refund mechanics are absent.

- [ ] **Step 3: Implement exact ordinary calls**

```solidity
function executeCall(CallV4 calldata call_) internal {
    if (call_.targetKind == TargetKind.Contract) {
        if (call_.target.code.length == 0 || call_.target.codehash != call_.runtimeCodeHash) revert TargetCodeMismatch();
    } else if (call_.runtimeCodeHash != bytes32(0) || call_.data.length != 0) revert RecipientCallInvalid();
    for (uint256 i; i < call_.approvals.length; ++i) {
        IERC20(call_.approvals[i].token).forceApprove(call_.approvals[i].spender, call_.approvals[i].amount);
    }
    (bool ok,) = call_.target.call{value: call_.value, gas: call_.gasLimit}(call_.data);
    if (!ok) revert GeneralCallFailed();
    for (uint256 i; i < call_.approvals.length; ++i) {
        IERC20(call_.approvals[i].token).forceApprove(call_.approvals[i].spender, 0);
    }
}
```

Refund only increases over captured baselines; enforce residue, allowance, account constraint, and predicate closure after refunds.

- [ ] **Step 4: Run call/security tests**

Run: `scripts/forge.sh test --match-path 'test/CobiaExecutorV4*.t.sol' -vvv`

Expected: PASS.

- [ ] **Step 5: Commit the general-call checkpoint**

```bash
git add contracts/src/CobiaCallGuardV4.sol contracts/src/CobiaExecutorV4.sol contracts/test/CobiaExecutorV4Calls.t.sol contracts/test/utils/GeneralCallTarget.sol
git commit -m "feat(contracts): execute bounded general calls"
```

### Task 4: Adversarial invariants and complete contract gate

**Files:**
- Create: `contracts/test/CobiaExecutorV4Security.t.sol`
- Create: `contracts/test/CobiaExecutorV4Invariant.t.sol`
- Create: `contracts/test/CobiaExecutorV4Interop.t.sol`
- Create: `contracts/test/utils/AdversarialToken.sol`

**Interfaces:**
- Verifies: no immutable V4 invariant can be bypassed by a valid verifier signature.
- Produces: contract-ready checkpoint; no deployment artifact.

- [ ] **Step 1: Add verifier-compromise and token-behavior attacks**

```solidity
function testValidVerifierSignatureCannotSpendSecondWalletAsset() public {
    secondToken.approve(address(executor), type(uint256).max);
    program.calls[0] = directTransferFrom(address(secondToken), owner, attacker, 1);
    vm.expectRevert(CobiaExecutorV4.UndeclaredWalletDebit.selector); _executeWithValidVerifierSignature(program);
}
function testExecutorExposesNoDelegatecallOrCreateSelector() public {
    assertFalse(_hasSelector(type(CobiaExecutorV4).runtimeCode, bytes4(keccak256("delegateExecute(address,bytes)"))));
    assertFalse(_hasSelector(type(CobiaExecutorV4).runtimeCode, bytes4(keccak256("create(bytes)"))));
}
function invariant_executorNeverConsumesPreexistingResidue() public view {
    assertGe(address(executor).balance, nativeResidueBaseline); assertGe(token.balanceOf(address(executor)), tokenResidueBaseline);
}
function invariant_confirmedProgramsLeaveDeclaredApprovalsAtZero() public view {
    for (uint256 i; i < approvalPairs.length; ++i) {
        assertEq(IERC20(approvalPairs[i].token).allowance(address(executor), approvalPairs[i].spender), 0);
    }
}
```

Exercise token callbacks/returns/tax/rebase, malformed balances, privileged targets, direct `transferFrom`, duplicate cleanup, over-refund, nonce rollback, and gas griefing.

- [ ] **Step 2: Run adversarial tests and fix only demonstrated gaps**

Run: `scripts/forge.sh test --match-path 'test/CobiaExecutorV4*.t.sol' -vvv`

Expected: initial RED for each missing guard, then PASS after minimal contract changes.

- [ ] **Step 3: Run the full contract suite and size check**

Run: `scripts/forge.sh test -vvv && find contracts/src -name '*V4.sol' -o -name 'CobiaRiskManagerV2.sol' | xargs wc -l`

Expected: all tests PASS; each source file is at or below 300 lines.

- [ ] **Step 4: Run ABI/vector differential checks**

Run: `pnpm executor:v4:types:test && scripts/forge.sh test --match-contract CobiaExecutorV4InteropTest -vvv`

Expected: TypeScript and Solidity hashes/encodings match exactly.

- [ ] **Step 5: Commit the hardened contract checkpoint**

```bash
git add contracts/src contracts/test
git commit -m "test(contracts): harden executor v4 invariants"
```
