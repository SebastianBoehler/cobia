// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {CobiaExecutorV1} from "../src/CobiaExecutorV1.sol";
import {ExecutorTestBase, MockToken} from "./utils/ExecutorTestBase.sol";

contract CobiaExecutorSecurityTest is ExecutorTestBase {
    function test_rejectsAnUnauthorizedWallet() public {
        executor.setWalletAllowed(OWNER, false);
        CobiaExecutorV1.ExecutionRouteV1 memory value = route(ROUTE_CAP);
        CobiaExecutorV1.VerifierAuthorizationV1 memory auth = authorization(value);
        bytes memory signature = sign(auth);
        vm.prank(OWNER);
        vm.expectRevert(CobiaExecutorV1.WalletNotAllowed.selector);
        executor.execute(value, auth, signature);
    }

    function test_rejectsAnExpiredRoute() public {
        CobiaExecutorV1.ExecutionRouteV1 memory value = route(ROUTE_CAP);
        value.deadline = uint64(block.timestamp);
        CobiaExecutorV1.VerifierAuthorizationV1 memory auth = authorization(value);
        bytes memory signature = sign(auth);
        vm.prank(OWNER);
        vm.expectRevert(CobiaExecutorV1.DeadlineExpired.selector);
        executor.execute(value, auth, signature);
    }

    function test_rejectsAValidSignatureFromTheWrongSigner() public {
        CobiaExecutorV1.ExecutionRouteV1 memory value = route(ROUTE_CAP);
        CobiaExecutorV1.VerifierAuthorizationV1 memory auth = authorization(value);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(
            0xBADC0DE,
            executor.authorizationDigest(auth)
        );
        vm.prank(OWNER);
        vm.expectRevert(CobiaExecutorV1.VerifierSignatureInvalid.selector);
        executor.execute(value, auth, abi.encodePacked(r, s, v));
    }

    function test_rejectsAChangedAuthorizationField() public {
        CobiaExecutorV1.ExecutionRouteV1 memory value = route(ROUTE_CAP);
        CobiaExecutorV1.VerifierAuthorizationV1 memory auth = authorization(value);
        auth.routeHash = keccak256("changed");
        bytes memory signature = sign(auth);
        vm.prank(OWNER);
        vm.expectRevert(CobiaExecutorV1.AuthorizationMismatch.selector);
        executor.execute(value, auth, signature);
    }

    function test_rejectsAnUnsupportedInputToken() public {
        MockToken unsupported = new MockToken("OTHER");
        CobiaExecutorV1.ExecutionRouteV1 memory value = route(ROUTE_CAP);
        value.inputToken = address(unsupported);
        CobiaExecutorV1.VerifierAuthorizationV1 memory auth = authorization(value);
        bytes memory signature = sign(auth);
        vm.prank(OWNER);
        vm.expectRevert(CobiaExecutorV1.UnsupportedToken.selector);
        executor.execute(value, auth, signature);
    }

    function test_rejectsAnInactiveAdapterPermission() public {
        bytes32 key = registry.permissionKey(AAVE_ID, address(protocol), protocol.supply.selector);
        registry.revoke(key);
        CobiaExecutorV1.ExecutionRouteV1 memory value = route(ROUTE_CAP);
        CobiaExecutorV1.VerifierAuthorizationV1 memory auth = authorization(value);
        bytes memory signature = sign(auth);
        vm.prank(OWNER);
        vm.expectRevert(CobiaExecutorV1.PermissionInactive.selector);
        executor.execute(value, auth, signature);
    }

    function test_protocolFailureRevertsCapsNonceAndTransfer() public {
        protocol.setFailNext(true);
        CobiaExecutorV1.ExecutionRouteV1 memory value = route(ROUTE_CAP);
        CobiaExecutorV1.VerifierAuthorizationV1 memory auth = authorization(value);
        bytes memory signature = sign(auth);
        vm.prank(OWNER);
        vm.expectRevert(CobiaExecutorV1.ProtocolCallFailed.selector);
        executor.execute(value, auth, signature);
        assert(input.balanceOf(OWNER) == 100_000_000);
        assert(executor.cumulativeInputAtomic() == 0);
        assert(!executor.nonceUsed(OWNER, value.nonce));
    }

    function test_pauseStopsExecutionBeforeFundsMove() public {
        executor.setPaused(true);
        CobiaExecutorV1.ExecutionRouteV1 memory value = route(ROUTE_CAP);
        CobiaExecutorV1.VerifierAuthorizationV1 memory auth = authorization(value);
        bytes memory signature = sign(auth);
        vm.prank(OWNER);
        vm.expectRevert(CobiaExecutorV1.ExecutorPaused.selector);
        executor.execute(value, auth, signature);
    }

    function test_refundsEveryUnspentSupportedTokenAndClearsApproval() public {
        _activate(protocol.supplyPartial.selector);
        CobiaExecutorV1.ExecutionRouteV1 memory value = route(ROUTE_CAP);
        value.steps[0].data = abi.encodeCall(
            protocol.supplyPartial,
            (input, receipt, OWNER, ROUTE_CAP)
        );
        value.constraints[0].minimumIncrease = ROUTE_CAP - 1;
        CobiaExecutorV1.VerifierAuthorizationV1 memory auth = authorization(value);
        bytes memory signature = sign(auth);
        vm.prank(OWNER);
        executor.execute(value, auth, signature);
        assert(input.balanceOf(OWNER) == 90_000_001);
        assert(receipt.balanceOf(OWNER) == ROUTE_CAP - 1);
        assert(input.balanceOf(address(executor)) == 0);
        assert(input.allowance(address(executor), address(protocol)) == 0);
    }

    function test_reentrantNestedExecutionCannotConsumeASecondRoute() public {
        _activate(protocol.callExecutor.selector);
        CobiaExecutorV1.ExecutionRouteV1 memory nested = route(1_000_000);
        nested.nonce = keccak256("nested");
        CobiaExecutorV1.VerifierAuthorizationV1 memory nestedAuth = authorization(nested);
        bytes memory nestedSignature = sign(nestedAuth);

        CobiaExecutorV1.ExecutionRouteV1 memory outer = route(ROUTE_CAP);
        outer.nonce = keccak256("outer");
        outer.steps[0].data = abi.encodeCall(
            protocol.callExecutor,
            (address(executor), abi.encodeCall(executor.execute, (nested, nestedAuth, nestedSignature)))
        );
        CobiaExecutorV1.VerifierAuthorizationV1 memory outerAuth = authorization(outer);
        bytes memory outerSignature = sign(outerAuth);
        vm.prank(OWNER);
        vm.expectRevert(CobiaExecutorV1.ProtocolCallFailed.selector);
        executor.execute(outer, outerAuth, outerSignature);
        assert(!executor.nonceUsed(OWNER, outer.nonce));
        assert(!executor.nonceUsed(OWNER, nested.nonce));
    }

    function test_enforcesWalletDailyAndCumulativeCaps() public {
        input.mint(OWNER, 200_000_000);
        for (uint256 index; index < 25; ++index) {
            if (index > 0 && index % 5 == 0) vm.warp(block.timestamp + 1 days);
            _executeUnique(index);
        }
        vm.warp(block.timestamp + 1 days);
        CobiaExecutorV1.ExecutionRouteV1 memory value = route(ROUTE_CAP);
        value.nonce = keccak256("over cumulative");
        CobiaExecutorV1.VerifierAuthorizationV1 memory auth = authorization(value);
        bytes memory signature = sign(auth);
        vm.prank(OWNER);
        vm.expectRevert(CobiaExecutorV1.CumulativeCapExceeded.selector);
        executor.execute(value, auth, signature);
    }

    function _executeUnique(uint256 index) private {
        CobiaExecutorV1.ExecutionRouteV1 memory value = route(ROUTE_CAP);
        value.nonce = keccak256(abi.encode("unique", index));
        CobiaExecutorV1.VerifierAuthorizationV1 memory auth = authorization(value);
        bytes memory signature = sign(auth);
        vm.prank(OWNER);
        executor.execute(value, auth, signature);
    }

    function _activate(bytes4 selector) private {
        bytes32 key = registry.permissionKey(AAVE_ID, address(protocol), selector);
        registry.propose(AAVE_ID, address(protocol), selector, address(protocol).codehash);
        vm.warp(block.timestamp + 48 hours);
        registry.activate(key);
    }
}
