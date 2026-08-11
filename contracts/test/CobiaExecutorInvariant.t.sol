// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {CobiaExecutorV1} from "../src/CobiaExecutorV1.sol";
import {ICobiaExecutorV1} from "../src/interfaces/ICobiaExecutorV1.sol";
import {ExecutorTestBase} from "./ExecutorTestBase.sol";

contract CobiaExecutorInvariantTest is ExecutorTestBase {
    function test_dailyCapResetsOnlyOnNextUtcDay() public {
        for (uint256 index; index < 5; ++index) {
            _execute(_route(bytes32(index + 1), ROUTE_CAP));
        }
        ICobiaExecutorV1.ExecutionRouteV1 memory rejected = _route(bytes32(uint256(6)), 1);
        _expectExecutionRevert(rejected, ICobiaExecutorV1.DailyCapExceeded.selector);

        vm.warp(block.timestamp + 1 days);
        _execute(_route(bytes32(uint256(7)), ROUTE_CAP));
        require(executor.cumulativeInput() == 60_000_000, "daily reset changed cumulative cap");
    }

    function test_cumulativeCapNeverResets() public {
        uint256 nonceValue = 1;
        for (uint256 day; day < 5; ++day) {
            for (uint256 routeIndex; routeIndex < 5; ++routeIndex) {
                _execute(_route(bytes32(nonceValue++), ROUTE_CAP));
            }
            vm.warp(block.timestamp + 1 days);
        }
        require(executor.cumulativeInput() == 250_000_000, "cumulative cap not reached");
        _expectExecutionRevert(_route(bytes32(nonceValue), 1), ICobiaExecutorV1.CumulativeCapExceeded.selector);
    }

    function testFuzz_successNeverRetainsRouteFundsOrAllowance(uint128 rawAmount) public {
        uint128 amount = uint128(uint256(rawAmount) % ROUTE_CAP) + 1;
        uint256 existing = uint256(rawAmount) % 1_000;
        inputToken.mint(address(executor), existing);
        _execute(_route(keccak256(abi.encode(rawAmount)), amount));
        require(inputToken.balanceOf(address(executor)) == existing, "route funds retained");
        require(inputToken.allowance(address(executor), address(protocol)) == 0, "allowance retained");
        require(receiptToken.balanceOf(owner) == amount, "output constraint drift");
    }

    function test_signatureIsBoundToChainAndExecutor() public {
        ICobiaExecutorV1.ExecutionRouteV1 memory route = _route(NONCE, ROUTE_CAP);
        ICobiaExecutorV1.VerifierAuthorizationV1 memory authorization = _authorization(route);
        bytes memory signature = _signature(route, authorization, VERIFIER_KEY);
        vm.chainId(1952);
        vm.prank(owner);
        vm.expectRevert(ICobiaExecutorV1.InvalidVerifier.selector);
        executor.execute(route, authorization, signature);

        vm.chainId(196);
        address[] memory inputs = new address[](2);
        inputs[0] = address(inputToken);
        inputs[1] = address(otherInputToken);
        address[] memory constraints = new address[](1);
        constraints[0] = address(receiptToken);
        CobiaExecutorV1 otherExecutor =
            new CobiaExecutorV1(address(this), address(registry), vm.addr(VERIFIER_KEY), inputs, constraints);
        bytes32 digest = otherExecutor.authorizationDigest(route, authorization);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(VERIFIER_KEY, digest);
        vm.prank(owner);
        vm.expectRevert(ICobiaExecutorV1.InvalidVerifier.selector);
        executor.execute(route, authorization, abi.encodePacked(r, s, v));
    }

    function test_reentrancyRevertsEntireRoute() public {
        ICobiaExecutorV1.ExecutionRouteV1 memory route = _route(NONCE, 1);
        route.steps[0] = ICobiaExecutorV1.StepV1({
            adapterId: AAVE_ID,
            target: address(reentrantProtocol),
            spendToken: address(inputToken),
            spendAmount: 1,
            data: abi.encodeCall(reentrantProtocol.attack, (address(executor)))
        });
        route.constraints[0].minimumIncrease = 1;
        route.routeHash = executor.hashRoute(route);
        ICobiaExecutorV1.VerifierAuthorizationV1 memory authorization = _authorization(route);
        bytes memory signature = _signature(route, authorization, VERIFIER_KEY);
        reentrantProtocol.setPayload(abi.encodeCall(executor.execute, (route, authorization, signature)));

        vm.prank(owner);
        vm.expectRevert(ICobiaExecutorV1.ProtocolCallFailed.selector);
        executor.execute(route, authorization, signature);
        require(!executor.usedNonces(owner, NONCE), "failed reentry consumed nonce");
        require(executor.cumulativeInput() == 0, "failed reentry consumed cap");
    }

    function test_routeMutationAfterSigningFailsBeforeFundsMove() public {
        ICobiaExecutorV1.ExecutionRouteV1 memory route = _route(NONCE, ROUTE_CAP);
        ICobiaExecutorV1.VerifierAuthorizationV1 memory authorization = _authorization(route);
        bytes memory signature = _signature(route, authorization, VERIFIER_KEY);
        route.simulationHash = keccak256("mutated simulation");
        uint256 beforeBalance = inputToken.balanceOf(owner);

        vm.prank(owner);
        vm.expectRevert(ICobiaExecutorV1.InvalidRoute.selector);
        executor.execute(route, authorization, signature);
        require(inputToken.balanceOf(owner) == beforeBalance, "mutation moved funds");
    }
}
