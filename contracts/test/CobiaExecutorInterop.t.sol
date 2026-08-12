// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {CobiaAdapterRegistry} from "../src/CobiaAdapterRegistry.sol";
import {CobiaExecutorV1} from "../src/CobiaExecutorV1.sol";

contract CobiaExecutorInteropTest {
    bytes32 private constant ROUTE_COMMITMENT =
        0x0b47f854780f6988ec15b3df1d0af1b2fd2c84f46757c29aa255f0c19ea24615;
    bytes32 private constant CONSTRAINTS_HASH =
        0x3dce4dbe0751001cd8708406587f59fc9ceb94c8d104cdab41cdf7f8aabc8bb8;
    bytes32 private constant AUTHORIZATION_PAYLOAD_HASH =
        0xf6d4f9f1ddd7237a15cd495ef1f7b3d9b5cf4466a3ccc1b92da9e244376eb2b4;

    function test_matchesTheTypeScriptGoldenAbiHashes() public {
        CobiaAdapterRegistry registry = new CobiaAdapterRegistry(address(this));
        address[] memory tokens = new address[](1);
        tokens[0] = address(0x2222222222222222222222222222222222222222);
        CobiaExecutorV1 executor = new CobiaExecutorV1(
            address(this), registry, address(1), tokens
        );
        CobiaExecutorV1.ExecutionRouteV1 memory value = _route();
        bytes32 constraintsHash = executor.balanceConstraintsHash(value.constraints);
        CobiaExecutorV1.VerifierAuthorizationV1 memory authorization =
            CobiaExecutorV1.VerifierAuthorizationV1({
                executor: address(0x5555555555555555555555555555555555555555),
                chainId: 196,
                routeCommitment: ROUTE_COMMITMENT,
                policyHash: value.policyHash,
                snapshotHash: value.snapshotHash,
                bundleHash: value.bundleHash,
                routeHash: value.routeHash,
                simulationHash: value.simulationHash,
                constraintsHash: constraintsHash,
                owner: value.owner,
                inputToken: value.inputToken,
                inputAmount: value.inputAmount,
                deadline: value.deadline,
                nonce: value.nonce
            });

        assert(executor.executionRouteHash(value) == ROUTE_COMMITMENT);
        assert(constraintsHash == CONSTRAINTS_HASH);
        assert(keccak256(abi.encode(authorization)) == AUTHORIZATION_PAYLOAD_HASH);
    }

    function _route()
        private
        pure
        returns (CobiaExecutorV1.ExecutionRouteV1 memory value)
    {
        CobiaExecutorV1.StepV1[] memory steps = new CobiaExecutorV1.StepV1[](1);
        steps[0] = CobiaExecutorV1.StepV1({
            adapterId: bytes32(uint256(0x7777777777777777777777777777777777777777777777777777777777777777)),
            target: address(0x3333333333333333333333333333333333333333),
            spendToken: address(0x2222222222222222222222222222222222222222),
            spendAmount: 1_000_000,
            data: hex"12345678"
        });
        CobiaExecutorV1.BalanceConstraintV1[] memory constraints =
            new CobiaExecutorV1.BalanceConstraintV1[](1);
        constraints[0] = CobiaExecutorV1.BalanceConstraintV1({
            token: address(0x4444444444444444444444444444444444444444),
            account: address(0x1111111111111111111111111111111111111111),
            minimumIncrease: 999_999
        });
        value = CobiaExecutorV1.ExecutionRouteV1({
            policyHash: bytes32(uint256(0x1111111111111111111111111111111111111111111111111111111111111111)),
            snapshotHash: bytes32(uint256(0x2222222222222222222222222222222222222222222222222222222222222222)),
            bundleHash: bytes32(uint256(0x3333333333333333333333333333333333333333333333333333333333333333)),
            routeHash: bytes32(uint256(0x4444444444444444444444444444444444444444444444444444444444444444)),
            simulationHash: bytes32(uint256(0x5555555555555555555555555555555555555555555555555555555555555555)),
            owner: address(0x1111111111111111111111111111111111111111),
            inputToken: address(0x2222222222222222222222222222222222222222),
            inputAmount: 1_000_000,
            deadline: 2_000_000_000,
            nonce: bytes32(uint256(0x6666666666666666666666666666666666666666666666666666666666666666)),
            steps: steps,
            constraints: constraints
        });
    }
}
