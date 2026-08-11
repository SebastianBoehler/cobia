// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ICobiaExecutorV1} from "../src/interfaces/ICobiaExecutorV1.sol";
import {CobiaExecutorV1} from "../src/CobiaExecutorV1.sol";
import {ExecutorTestBase, MockSixDecimalToken} from "./ExecutorTestBase.sol";

contract CobiaExecutorV1Test is ExecutorTestBase {
    function test_hashRouteMatchesTypeScriptRegressionVector() public view {
        ICobiaExecutorV1.StepV1[] memory steps = new ICobiaExecutorV1.StepV1[](1);
        steps[0] = ICobiaExecutorV1.StepV1({
            adapterId: bytes32(hex"6666666666666666666666666666666666666666666666666666666666666666"),
            target: address(0x3333333333333333333333333333333333333333),
            spendToken: address(0x2222222222222222222222222222222222222222),
            spendAmount: 10_000_000,
            data: hex"abcdef01"
        });
        ICobiaExecutorV1.BalanceConstraintV1[] memory constraints = new ICobiaExecutorV1.BalanceConstraintV1[](1);
        constraints[0] = ICobiaExecutorV1.BalanceConstraintV1({
            token: address(0x4444444444444444444444444444444444444444),
            account: address(0x1111111111111111111111111111111111111111),
            minimumIncrease: 9_999_999
        });
        ICobiaExecutorV1.ExecutionRouteV1 memory route = ICobiaExecutorV1.ExecutionRouteV1({
            policyHash: bytes32(hex"1111111111111111111111111111111111111111111111111111111111111111"),
            snapshotHash: bytes32(hex"2222222222222222222222222222222222222222222222222222222222222222"),
            bundleHash: bytes32(hex"3333333333333333333333333333333333333333333333333333333333333333"),
            routeHash: bytes32(0),
            simulationHash: bytes32(hex"4444444444444444444444444444444444444444444444444444444444444444"),
            owner: address(0x1111111111111111111111111111111111111111),
            inputToken: address(0x2222222222222222222222222222222222222222),
            inputAmount: 10_000_000,
            deadline: 2_000_000_000,
            nonce: bytes32(hex"5555555555555555555555555555555555555555555555555555555555555555"),
            steps: steps,
            constraints: constraints
        });
        require(
            executor.hashRoute(route) == bytes32(hex"6bd63fd720b08b7b464617b929082ded8db5dd0fc648c4fc77ea3ff10f997d62"),
            "route hash mismatch"
        );
    }

    function test_executesOneBoundedRouteAndResetsState() public {
        ICobiaExecutorV1.ExecutionRouteV1 memory route = _route(NONCE, ROUTE_CAP);
        uint256 ownerInputBefore = inputToken.balanceOf(owner);
        _execute(route);

        require(inputToken.balanceOf(owner) == ownerInputBefore - ROUTE_CAP, "wrong spend");
        require(receiptToken.balanceOf(owner) == ROUTE_CAP, "missing position");
        require(inputToken.balanceOf(address(executor)) == 0, "input retained");
        require(inputToken.allowance(address(executor), address(protocol)) == 0, "allowance retained");
        require(executor.usedNonces(owner, NONCE), "nonce missing");
        require(executor.cumulativeInput() == ROUTE_CAP, "cap accounting missing");
    }

    function test_rejectsWrongCallerAndWrongVerifier() public {
        ICobiaExecutorV1.ExecutionRouteV1 memory route = _route(NONCE, ROUTE_CAP);
        ICobiaExecutorV1.VerifierAuthorizationV1 memory authorization = _authorization(route);
        bytes memory validSignature = _signature(route, authorization, VERIFIER_KEY);
        vm.prank(other);
        vm.expectRevert(ICobiaExecutorV1.OwnerMismatch.selector);
        executor.execute(route, authorization, validSignature);

        bytes memory wrongSignature = _signature(route, authorization, WRONG_KEY);
        vm.prank(owner);
        vm.expectRevert(ICobiaExecutorV1.InvalidVerifier.selector);
        executor.execute(route, authorization, wrongSignature);
    }

    function test_rejectsExpiredRouteAndNonceReplay() public {
        ICobiaExecutorV1.ExecutionRouteV1 memory route = _route(NONCE, ROUTE_CAP);
        ICobiaExecutorV1.VerifierAuthorizationV1 memory authorization = _authorization(route);
        bytes memory signature = _signature(route, authorization, VERIFIER_KEY);
        vm.warp(route.deadline + 1);
        vm.prank(owner);
        vm.expectRevert(ICobiaExecutorV1.RouteExpired.selector);
        executor.execute(route, authorization, signature);

        vm.warp(route.deadline - 1);
        _execute(route);
        vm.prank(owner);
        vm.expectRevert(ICobiaExecutorV1.NonceUsed.selector);
        executor.execute(route, authorization, signature);
    }

    function test_rejectsUnselectedWalletAndPerRouteCap() public {
        executor.setSelectedWallet(owner, false);
        ICobiaExecutorV1.ExecutionRouteV1 memory route = _route(NONCE, ROUTE_CAP);
        _expectExecutionRevert(route, ICobiaExecutorV1.WalletNotSelected.selector);

        executor.setSelectedWallet(owner, true);
        route = _route(NONCE, ROUTE_CAP + 1);
        _expectExecutionRevert(route, ICobiaExecutorV1.RouteCapExceeded.selector);
    }

    function test_rejectsUnsupportedInputAndPermission() public {
        MockSixDecimalToken unsupported = new MockSixDecimalToken("Other", "OTHER");
        ICobiaExecutorV1.ExecutionRouteV1 memory route = _route(NONCE, ROUTE_CAP);
        route.inputToken = address(unsupported);
        route.routeHash = executor.hashRoute(route);
        _expectExecutionRevert(route, ICobiaExecutorV1.UnsupportedAsset.selector);

        route = _route(NONCE, ROUTE_CAP);
        route.steps[0].adapterId = keccak256("unknown@1");
        route.routeHash = executor.hashRoute(route);
        _expectExecutionRevert(route, ICobiaExecutorV1.PermissionDenied.selector);
    }

    function test_failedCallAndConstraintRevertAllEffects() public {
        ICobiaExecutorV1.ExecutionRouteV1 memory route = _route(NONCE, ROUTE_CAP);
        route.steps[0].data = abi.encodeCall(protocol.fail, ());
        route.routeHash = executor.hashRoute(route);
        uint256 ownerInputBefore = inputToken.balanceOf(owner);
        _expectExecutionRevert(route, ICobiaExecutorV1.ProtocolCallFailed.selector);
        require(inputToken.balanceOf(owner) == ownerInputBefore, "failed call spent funds");

        route = _route(NONCE, ROUTE_CAP);
        route.constraints[0].minimumIncrease = ROUTE_CAP + 1;
        route.routeHash = executor.hashRoute(route);
        _expectExecutionRevert(route, ICobiaExecutorV1.ConstraintFailed.selector);
        require(receiptToken.balanceOf(owner) == 0, "failed constraint persisted output");
    }

    function test_refundsOnlyRouteResidualAndPreservesExistingBalance() public {
        inputToken.mint(address(executor), 7);
        ICobiaExecutorV1.ExecutionRouteV1 memory route = _route(NONCE, ROUTE_CAP);
        uint128 consumed = ROUTE_CAP / 2;
        route.steps[0].data =
            abi.encodeCall(protocol.supply, (address(inputToken), address(receiptToken), consumed, owner));
        route.constraints[0].minimumIncrease = consumed;
        route.routeHash = executor.hashRoute(route);
        uint256 ownerBefore = inputToken.balanceOf(owner);
        _execute(route);
        require(inputToken.balanceOf(owner) == ownerBefore - consumed, "residual not refunded");
        require(inputToken.balanceOf(address(executor)) == 7, "existing balance swept");
    }

    function test_pauseAndNativeValueFailClosed() public {
        executor.setPaused(true);
        ICobiaExecutorV1.ExecutionRouteV1 memory route = _route(NONCE, ROUTE_CAP);
        _expectExecutionRevert(route, ICobiaExecutorV1.ExecutionPaused.selector);

        vm.deal(address(this), 1);
        (bool success,) = address(executor).call{value: 1}("");
        require(!success, "native value accepted");
    }

    function test_rejectsZeroNonceAndLongAuthorization() public {
        ICobiaExecutorV1.ExecutionRouteV1 memory route = _route(bytes32(0), ROUTE_CAP);
        _expectExecutionRevert(route, ICobiaExecutorV1.InvalidRoute.selector);

        route = _route(NONCE, ROUTE_CAP);
        route.deadline = uint64(block.timestamp + 5 minutes + 1);
        route.routeHash = executor.hashRoute(route);
        _expectExecutionRevert(route, ICobiaExecutorV1.InvalidRoute.selector);
    }

    function test_rejectsOversizedPlansAndInvalidConstraintIdentity() public {
        ICobiaExecutorV1.ExecutionRouteV1 memory route = _route(NONCE, ROUTE_CAP);
        ICobiaExecutorV1.StepV1[] memory steps = new ICobiaExecutorV1.StepV1[](5);
        for (uint256 index; index < steps.length; ++index) {
            steps[index] = route.steps[0];
        }
        route.steps = steps;
        route.routeHash = executor.hashRoute(route);
        _expectExecutionRevert(route, ICobiaExecutorV1.InvalidRoute.selector);

        route = _route(NONCE, ROUTE_CAP);
        ICobiaExecutorV1.BalanceConstraintV1[] memory constraints = new ICobiaExecutorV1.BalanceConstraintV1[](5);
        for (uint256 index; index < constraints.length; ++index) {
            constraints[index] = route.constraints[0];
        }
        route.constraints = constraints;
        route.routeHash = executor.hashRoute(route);
        _expectExecutionRevert(route, ICobiaExecutorV1.InvalidRoute.selector);

        route = _route(NONCE, ROUTE_CAP);
        route.constraints[0].account = other;
        route.routeHash = executor.hashRoute(route);
        _expectExecutionRevert(route, ICobiaExecutorV1.InvalidRoute.selector);
    }

    function test_rejectsUnboundedSupportedTokenConfiguration() public {
        address[] memory inputs = new address[](9);
        for (uint256 index; index < inputs.length; ++index) {
            inputs[index] = address(new MockSixDecimalToken("Input", "IN"));
        }
        address[] memory constraints = new address[](1);
        constraints[0] = address(receiptToken);

        vm.expectRevert(ICobiaExecutorV1.InvalidConfiguration.selector);
        new CobiaExecutorV1(address(this), address(registry), vm.addr(VERIFIER_KEY), inputs, constraints);
    }
}
