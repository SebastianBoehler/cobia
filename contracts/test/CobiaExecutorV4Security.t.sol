// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {CobiaExecutionTypesV4} from "../src/CobiaExecutionTypesV4.sol";
import {CobiaExecutorV4} from "../src/CobiaExecutorV4.sol";
import {ExecutorV4TestBase} from "./utils/ExecutorV4TestBase.sol";

contract CobiaExecutorV4SecurityTest is ExecutorV4TestBase {
    function test_rejectsForgedUsdAndAnyChangedExecutableField() public {
        CobiaExecutionTypesV4.ExecutionProgramV4 memory original = program(10);
        CobiaExecutionTypesV4.VerifierAuthorizationV4 memory auth = authorization(original);
        bytes memory signature = _sign(auth);

        original.inputUsdE8 += 1;
        vm.expectRevert(CobiaExecutorV4.AuthorizationMismatch.selector);
        vm.prank(OWNER);
        executor.execute(original, auth, signature);

        original = program(11);
        auth = authorization(original);
        signature = _sign(auth);
        original.calls[0].data = hex"deadbeef";
        vm.expectRevert(CobiaExecutorV4.AuthorizationMismatch.selector);
        vm.prank(OWNER);
        executor.execute(original, auth, signature);
    }

    function test_rejectsWrongCallerSignerReplayDeadlineAndChain() public {
        CobiaExecutionTypesV4.ExecutionProgramV4 memory value = program(1);
        CobiaExecutionTypesV4.VerifierAuthorizationV4 memory auth = authorization(value);
        bytes memory signature = _sign(auth);
        vm.expectRevert(CobiaExecutorV4.InvalidProgram.selector);
        executor.execute(value, auth, signature);

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xBAD, executor.authorizationDigest(auth));
        vm.expectRevert(CobiaExecutorV4.VerifierSignatureInvalid.selector);
        vm.prank(OWNER);
        executor.execute(value, auth, abi.encodePacked(r, s, v));

        executeAsOwner(value);
        expectOwnerRevert(CobiaExecutorV4.NonceAlreadyUsed.selector, value);

        value = program(2);
        value.deadline = uint64(block.timestamp);
        expectOwnerRevert(CobiaExecutorV4.DeadlineExpired.selector, value);

        value = program(3);
        value.sourceChainId += 1;
        expectOwnerRevert(CobiaExecutorV4.InvalidProgram.selector, value);
    }

    function test_codeDriftApprovalCleanupAndPreexistingResidueProtection() public {
        input.mint(address(executor), 50);
        CobiaExecutionTypesV4.ExecutionProgramV4 memory value = program(100);
        executeAsOwner(value);
        assert(input.balanceOf(address(executor)) == 50);
        assert(input.allowance(address(executor), address(adapter)) == 0);

        value = program(101);
        vm.etch(address(adapter), hex"00");
        expectOwnerRevert(CobiaExecutorV4.TargetCodeIdentityChanged.selector, value);
    }

    function test_rejectsZeroOrExecutorApprovalSpender() public {
        CobiaExecutionTypesV4.ExecutionProgramV4 memory value = program(1);
        value.calls[0].approvals[0].spender = address(0);
        expectOwnerRevert(CobiaExecutorV4.InvalidProgram.selector, value);

        value = program(2);
        value.calls[0].approvals[0].spender = address(executor);
        expectOwnerRevert(CobiaExecutorV4.InvalidProgram.selector, value);
    }

    function test_hiddenInputDebitAndFailedCallsRollbackEverything() public {
        _activate(adapter.debitWallet.selector);
        vm.prank(OWNER);
        input.approve(address(adapter), type(uint256).max);
        CobiaExecutionTypesV4.ExecutionProgramV4 memory value = program(10);
        value.calls[0].approvals = new CobiaExecutionTypesV4.ApprovalV4[](0);
        value.calls[0].data = abi.encodeCall(adapter.debitWallet, (input, OWNER, THIEF, 11));
        expectOwnerRevert(CobiaExecutorV4.WalletDebitExceeded.selector, value);
        assert(input.balanceOf(THIEF) == 0);

        value = program(11);
        adapter.setFailNext(true);
        expectOwnerRevert(CobiaExecutorV4.AdapterCallFailed.selector, value);
        assert(input.balanceOf(OWNER) == 100_000_000);
        assert(!executor.nonceUsed(OWNER, value.nonce));
        assert(riskManager.walletRollingUsdE8(OWNER) == 0);
    }

    function test_reentrancyCannotConsumeEitherNonce() public {
        _activate(adapter.callExecutor.selector);
        CobiaExecutionTypesV4.ExecutionProgramV4 memory nested = program(1);
        nested.nonce = keccak256("nested");
        CobiaExecutionTypesV4.VerifierAuthorizationV4 memory nestedAuth = authorization(nested);
        bytes memory nestedSignature = _sign(nestedAuth);

        CobiaExecutionTypesV4.ExecutionProgramV4 memory outer = program(2);
        outer.nonce = keccak256("outer");
        outer.calls[0].approvals = new CobiaExecutionTypesV4.ApprovalV4[](0);
        outer.calls[0].data = abi.encodeCall(
            adapter.callExecutor,
            (address(executor), abi.encodeCall(executor.execute, (nested, nestedAuth, nestedSignature)))
        );
        expectOwnerRevert(CobiaExecutorV4.AdapterCallFailed.selector, outer);
        assert(!executor.nonceUsed(OWNER, nested.nonce));
        assert(!executor.nonceUsed(OWNER, outer.nonce));
    }
}
