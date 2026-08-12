// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {CobiaExecutorV1} from "../src/CobiaExecutorV1.sol";
import {ExecutorTestBase} from "./utils/ExecutorTestBase.sol";

contract CobiaExecutorV1Test is ExecutorTestBase {
    function test_executesOneAuthorizedRouteAndLeavesNoAllowanceOrBalance() public {
        CobiaExecutorV1.ExecutionRouteV1 memory value = route(ROUTE_CAP);
        CobiaExecutorV1.VerifierAuthorizationV1 memory auth = authorization(value);
        bytes memory signature = sign(auth);

        vm.prank(OWNER);
        executor.execute(value, auth, signature);

        assert(input.balanceOf(OWNER) == 90_000_000);
        assert(receipt.balanceOf(OWNER) == ROUTE_CAP);
        assert(input.balanceOf(address(executor)) == 0);
        assert(input.allowance(address(executor), address(protocol)) == 0);
        assert(executor.nonceUsed(OWNER, value.nonce));
        assert(executor.cumulativeInputAtomic() == ROUTE_CAP);
    }

    function test_rejectsAnInputAboveThePerRouteCap() public {
        CobiaExecutorV1.ExecutionRouteV1 memory value = route(ROUTE_CAP + 1);
        CobiaExecutorV1.VerifierAuthorizationV1 memory auth = authorization(value);
        bytes memory signature = sign(auth);
        vm.prank(OWNER);
        vm.expectRevert(CobiaExecutorV1.RouteCapExceeded.selector);
        executor.execute(value, auth, signature);
    }

    function test_rejectsAReplay() public {
        CobiaExecutorV1.ExecutionRouteV1 memory value = route(ROUTE_CAP);
        CobiaExecutorV1.VerifierAuthorizationV1 memory auth = authorization(value);
        bytes memory signature = sign(auth);
        vm.prank(OWNER);
        executor.execute(value, auth, signature);
        vm.prank(OWNER);
        vm.expectRevert(CobiaExecutorV1.NonceAlreadyUsed.selector);
        executor.execute(value, auth, signature);
    }

    function test_revertsEveryEffectWhenTheFinalBoundFails() public {
        CobiaExecutorV1.ExecutionRouteV1 memory value = route(ROUTE_CAP);
        value.constraints[0].minimumIncrease = ROUTE_CAP + 1;
        CobiaExecutorV1.VerifierAuthorizationV1 memory auth = authorization(value);
        bytes memory signature = sign(auth);
        vm.prank(OWNER);
        vm.expectRevert(CobiaExecutorV1.FinalBalanceBelowMinimum.selector);
        executor.execute(value, auth, signature);
        assert(input.balanceOf(OWNER) == 100_000_000);
        assert(receipt.balanceOf(OWNER) == 0);
        assert(!executor.nonceUsed(OWNER, value.nonce));
    }
}
