// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {CobiaExecutorV2} from "../src/CobiaExecutorV2.sol";
import {ExecutorV2TestBase} from "./utils/ExecutorV2TestBase.sol";

contract CobiaExecutorV2Test is ExecutorV2TestBase {
    function test_executesAnArbitraryRegisteredCapabilityAtomically() public {
        CobiaExecutorV2.ExecutionProgramV2 memory value = program(ROUTE_CAP);
        CobiaExecutorV2.VerifierAuthorizationV2 memory auth = authorization(value);
        executeAsOwner(value, auth);

        assert(input.balanceOf(OWNER) == 90_000_000);
        assert(receipt.balanceOf(OWNER) == ROUTE_CAP);
        assert(input.balanceOf(address(executor)) == 0);
        assert(input.allowance(address(executor), address(protocol)) == 0);
        assert(executor.nonceUsed(OWNER, value.nonce));
        assert(riskManager.cumulativeInput(address(input)) == ROUTE_CAP);
    }

    function test_refundsBeforeCheckingOwnerFinalBalance() public {
        _activateCapability(CAPABILITY_KEY, protocol.profitableRoundTrip.selector);
        CobiaExecutorV2.ExecutionProgramV2 memory value = program(ROUTE_CAP);
        value.actions[0].data = abi.encodeCall(protocol.profitableRoundTrip, (input, ROUTE_CAP));
        value.constraints[0] = CobiaExecutorV2.BalanceConstraintV2(address(input), 1);
        CobiaExecutorV2.VerifierAuthorizationV2 memory auth = authorization(value);
        executeAsOwner(value, auth);
        assert(input.balanceOf(OWNER) == 100_000_001);
        assert(input.balanceOf(address(executor)) == 0);
    }

    function test_failedFinalBoundRevertsFundsNonceAndRiskUsage() public {
        CobiaExecutorV2.ExecutionProgramV2 memory value = program(ROUTE_CAP);
        value.constraints[0].minimumIncrease = ROUTE_CAP + 1;
        CobiaExecutorV2.VerifierAuthorizationV2 memory auth = authorization(value);
        expectOwnerRevert(CobiaExecutorV2.FinalBalanceBelowMinimum.selector, value, auth);
        assert(input.balanceOf(OWNER) == 100_000_000);
        assert(!executor.nonceUsed(OWNER, value.nonce));
        assert(riskManager.cumulativeInput(address(input)) == 0);
    }
}
