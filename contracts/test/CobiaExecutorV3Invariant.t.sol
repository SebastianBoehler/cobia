// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {CobiaExecutorV3} from "../src/CobiaExecutorV3.sol";
import {CobiaStaticGuard} from "../src/CobiaStaticGuard.sol";
import {ExecutorV3TestBase} from "./utils/ExecutorV3TestBase.sol";

contract CobiaExecutorV3InvariantTest is ExecutorV3TestBase {
    function testFuzz_successNeverRetainsFundsOrApproval(uint96 rawAmount) public {
        uint128 amount = uint128(uint256(rawAmount) % ROUTE_CAP + 1);
        CobiaExecutorV3.ExecutionProgramV3 memory value = program(amount);
        executeAsOwner(value);
        assert(input.balanceOf(address(executor)) == 0);
        assert(receipt.balanceOf(address(executor)) == 0);
        assert(input.allowance(address(executor), address(protocol)) == 0);
    }

    function testFuzz_failedPredicateRevertsEveryEffect(uint96 rawAmount) public {
        uint128 amount = uint128(uint256(rawAmount) % ROUTE_CAP + 1);
        CobiaExecutorV3.ExecutionProgramV3 memory value = program(amount);
        value.predicates[0].bound = bytes32(uint256(amount) + 1);
        expectOwnerRevert(CobiaStaticGuard.PredicateFalse.selector, value);
        assert(input.balanceOf(OWNER) == 100_000_000);
        assert(riskManager.cumulativeInput(address(input)) == 0);
        assert(!executor.nonceUsed(OWNER, value.nonce));
    }
}
