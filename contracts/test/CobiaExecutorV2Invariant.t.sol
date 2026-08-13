// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {CobiaExecutorV2} from "../src/CobiaExecutorV2.sol";
import {CobiaRiskManagerV1} from "../src/CobiaRiskManagerV1.sol";
import {ExecutorV2TestBase} from "./utils/ExecutorV2TestBase.sol";

contract CobiaExecutorV2InvariantTest is ExecutorV2TestBase {
    function testFuzz_successNeverRetainsFundsOrApproval(uint96 rawAmount) public {
        uint128 amount = uint128(uint256(rawAmount) % ROUTE_CAP + 1);
        CobiaExecutorV2.ExecutionProgramV2 memory value = program(amount);
        CobiaExecutorV2.VerifierAuthorizationV2 memory auth = authorization(value);
        executeAsOwner(value, auth);
        assert(input.balanceOf(address(executor)) == 0);
        assert(receipt.balanceOf(address(executor)) == 0);
        assert(input.allowance(address(executor), address(protocol)) == 0);
    }

    function testFuzz_failedConstraintRevertsEveryEffect(uint96 rawAmount) public {
        uint128 amount = uint128(uint256(rawAmount) % ROUTE_CAP + 1);
        CobiaExecutorV2.ExecutionProgramV2 memory value = program(amount);
        value.constraints[0].minimumIncrease = amount + 1;
        CobiaExecutorV2.VerifierAuthorizationV2 memory auth = authorization(value);
        expectOwnerRevert(CobiaExecutorV2.FinalBalanceBelowMinimum.selector, value, auth);
        assert(input.balanceOf(OWNER) == 100_000_000);
        assert(riskManager.cumulativeInput(address(input)) == 0);
        assert(!executor.nonceUsed(OWNER, value.nonce));
    }

    function testFuzz_capCannotBeBypassed(uint96 excess) public {
        uint128 amount = ROUTE_CAP + uint128(uint256(excess) % 1_000_000 + 1);
        CobiaExecutorV2.ExecutionProgramV2 memory value = program(amount);
        CobiaExecutorV2.VerifierAuthorizationV2 memory auth = authorization(value);
        expectOwnerRevert(CobiaRiskManagerV1.RouteCapExceeded.selector, value, auth);
        assert(input.balanceOf(OWNER) == 100_000_000);
    }
}
