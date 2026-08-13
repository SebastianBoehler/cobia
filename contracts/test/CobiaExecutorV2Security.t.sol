// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {CobiaExecutorV2} from "../src/CobiaExecutorV2.sol";
import {CobiaRiskManagerV1} from "../src/CobiaRiskManagerV1.sol";
import {ExecutorV2TestBase} from "./utils/ExecutorV2TestBase.sol";

contract CobiaExecutorV2SecurityTest is ExecutorV2TestBase {
    function test_doesNotSweepPreExistingExecutorBalances() public {
        input.mint(address(executor), 777);
        CobiaExecutorV2.ExecutionProgramV2 memory value = program(1_000);
        CobiaExecutorV2.VerifierAuthorizationV2 memory auth = authorization(value);

        executeAsOwner(value, auth);

        assert(input.balanceOf(address(executor)) == 777);
        assert(input.balanceOf(OWNER) == 99_999_000);
    }

    function test_rejectsWrongCallerChainSignerAndChangedCommitment() public {
        CobiaExecutorV2.ExecutionProgramV2 memory value = program(1);
        CobiaExecutorV2.VerifierAuthorizationV2 memory auth = authorization(value);
        bytes memory signature = sign(auth);
        vm.expectRevert(CobiaExecutorV2.InvalidProgram.selector);
        executor.execute(value, auth, signature);

        auth.chainId += 1;
        expectOwnerRevert(CobiaExecutorV2.AuthorizationMismatch.selector, value, auth);

        auth = authorization(value);
        auth.canonicalProgramHash = keccak256("changed");
        expectOwnerRevert(CobiaExecutorV2.AuthorizationMismatch.selector, value, auth);

        auth = authorization(value);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xBADC0DE, executor.authorizationDigest(auth));
        vm.expectRevert(CobiaExecutorV2.VerifierSignatureInvalid.selector);
        vm.prank(OWNER);
        executor.execute(value, auth, abi.encodePacked(r, s, v));
    }

    function test_rejectsReplayExpiredInactiveOrMalformedPrograms() public {
        CobiaExecutorV2.ExecutionProgramV2 memory value = program(1);
        CobiaExecutorV2.VerifierAuthorizationV2 memory auth = authorization(value);
        executeAsOwner(value, auth);
        expectOwnerRevert(CobiaExecutorV2.NonceAlreadyUsed.selector, value, auth);

        value = program(2);
        value.deadline = uint64(block.timestamp);
        auth = authorization(value);
        expectOwnerRevert(CobiaExecutorV2.DeadlineExpired.selector, value, auth);

        value = program(3);
        value.actions[0].capabilityKey = keccak256("unregistered@1");
        auth = authorization(value);
        expectOwnerRevert(CobiaExecutorV2.PermissionInactive.selector, value, auth);

        value = program(4);
        value.refundTokens[1] = value.refundTokens[0];
        auth = authorization(value);
        expectOwnerRevert(CobiaExecutorV2.InvalidProgram.selector, value, auth);
    }

    function test_rejectsApprovalTokenOrConstraintMissingFromRefundSet() public {
        CobiaExecutorV2.ExecutionProgramV2 memory value = program(1);
        address[] memory incomplete = new address[](1);
        incomplete[0] = address(input);
        value.refundTokens = incomplete;
        CobiaExecutorV2.VerifierAuthorizationV2 memory auth = authorization(value);
        expectOwnerRevert(CobiaExecutorV2.InvalidProgram.selector, value, auth);

        value = program(2);
        value.actions[0].approvals[0].token = address(0xDEAD);
        auth = authorization(value);
        expectOwnerRevert(CobiaExecutorV2.InvalidProgram.selector, value, auth);
    }

    function test_protocolFailureRollsBackApprovalFundsAndAccounting() public {
        protocol.setFailNext(true);
        CobiaExecutorV2.ExecutionProgramV2 memory value = program(ROUTE_CAP);
        CobiaExecutorV2.VerifierAuthorizationV2 memory auth = authorization(value);
        expectOwnerRevert(CobiaExecutorV2.ProtocolCallFailed.selector, value, auth);
        assert(input.balanceOf(OWNER) == 100_000_000);
        assert(input.allowance(address(executor), address(protocol)) == 0);
        assert(riskManager.cumulativeInput(address(input)) == 0);
    }

    function test_rejectsTargetSelectorAndRuntimeCodeDrift() public {
        CobiaExecutorV2.ExecutionProgramV2 memory value = program(1);
        value.actions[0].target = address(0xDEAD);
        CobiaExecutorV2.VerifierAuthorizationV2 memory auth = authorization(value);
        expectOwnerRevert(CobiaExecutorV2.PermissionInactive.selector, value, auth);

        value = program(2);
        value.actions[0].data = abi.encodeCall(protocol.supplyPartial, (input, receipt, OWNER, 2));
        auth = authorization(value);
        expectOwnerRevert(CobiaExecutorV2.PermissionInactive.selector, value, auth);

        value = program(3);
        auth = authorization(value);
        vm.etch(address(protocol), hex"00");
        expectOwnerRevert(CobiaExecutorV2.PermissionInactive.selector, value, auth);
    }

    function test_riskManagerRejectsInputAboveConfiguredRouteCap() public {
        CobiaExecutorV2.ExecutionProgramV2 memory value = program(ROUTE_CAP + 1);
        CobiaExecutorV2.VerifierAuthorizationV2 memory auth = authorization(value);
        expectOwnerRevert(CobiaRiskManagerV1.RouteCapExceeded.selector, value, auth);
        assert(input.balanceOf(OWNER) == 100_000_000);
    }

    function test_reentrantProgramCannotConsumeAnotherNonce() public {
        _activateCapability(CAPABILITY_KEY, protocol.callExecutor.selector);
        CobiaExecutorV2.ExecutionProgramV2 memory nested = program(1);
        nested.nonce = keccak256("nested");
        CobiaExecutorV2.VerifierAuthorizationV2 memory nestedAuth = authorization(nested);
        bytes memory nestedSignature = sign(nestedAuth);

        CobiaExecutorV2.ExecutionProgramV2 memory outer = program(2);
        outer.nonce = keccak256("outer");
        outer.actions[0].approvals = new CobiaExecutorV2.ApprovalV2[](0);
        outer.actions[0].data = abi.encodeCall(
            protocol.callExecutor,
            (address(executor), abi.encodeCall(executor.execute, (nested, nestedAuth, nestedSignature)))
        );
        CobiaExecutorV2.VerifierAuthorizationV2 memory outerAuth = authorization(outer);
        expectOwnerRevert(CobiaExecutorV2.ProtocolCallFailed.selector, outer, outerAuth);
        assert(!executor.nonceUsed(OWNER, nested.nonce));
        assert(!executor.nonceUsed(OWNER, outer.nonce));
    }
}
