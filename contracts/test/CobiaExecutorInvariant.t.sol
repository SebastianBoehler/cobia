// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {CobiaExecutorV1} from "../src/CobiaExecutorV1.sol";
import {ExecutorTestBase} from "./utils/ExecutorTestBase.sol";

contract CobiaExecutorInvariantTest is ExecutorTestBase {
    function testFuzz_successLeavesNoExecutorBalanceOrAllowance(uint96 rawAmount) public {
        uint128 amount = uint128(uint256(rawAmount) % ROUTE_CAP) + 1;
        CobiaExecutorV1.ExecutionRouteV1 memory value = route(amount);
        CobiaExecutorV1.VerifierAuthorizationV1 memory auth = authorization(value);
        bytes memory signature = sign(auth);

        vm.prank(OWNER);
        executor.execute(value, auth, signature);

        assert(input.balanceOf(address(executor)) == 0);
        assert(receipt.balanceOf(address(executor)) == 0);
        assert(input.allowance(address(executor), address(protocol)) == 0);
        assert(executor.cumulativeInputAtomic() == amount);
        assert(executor.nonceUsed(OWNER, value.nonce));
    }

    function testFuzz_failedConstraintRevertsEveryEffect(uint96 rawAmount) public {
        uint128 amount = uint128(uint256(rawAmount) % ROUTE_CAP) + 1;
        CobiaExecutorV1.ExecutionRouteV1 memory value = route(amount);
        value.constraints[0].minimumIncrease = amount + 1;
        CobiaExecutorV1.VerifierAuthorizationV1 memory auth = authorization(value);
        bytes memory signature = sign(auth);

        vm.expectRevert(CobiaExecutorV1.FinalBalanceBelowMinimum.selector);
        vm.prank(OWNER);
        executor.execute(value, auth, signature);

        assert(input.balanceOf(OWNER) == 100_000_000);
        assert(receipt.balanceOf(OWNER) == 0);
        assert(input.balanceOf(address(protocol)) == 0);
        assert(executor.cumulativeInputAtomic() == 0);
        assert(!executor.nonceUsed(OWNER, value.nonce));
    }

    function testFuzz_inputAboveRouteCapNeverMovesFunds(uint96 excess) public {
        uint128 amount = ROUTE_CAP + uint128(uint256(excess) % ROUTE_CAP) + 1;
        CobiaExecutorV1.ExecutionRouteV1 memory value = route(amount);
        CobiaExecutorV1.VerifierAuthorizationV1 memory auth = authorization(value);
        bytes memory signature = sign(auth);

        vm.expectRevert(CobiaExecutorV1.RouteCapExceeded.selector);
        vm.prank(OWNER);
        executor.execute(value, auth, signature);

        assert(input.balanceOf(OWNER) == 100_000_000);
        assert(executor.cumulativeInputAtomic() == 0);
    }
}
