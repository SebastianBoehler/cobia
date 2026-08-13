// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {CobiaExecutorV2} from "../src/CobiaExecutorV2.sol";
import {ExecutorV2TestBase} from "./utils/ExecutorV2TestBase.sol";

contract CobiaExecutorV2InteropTest is ExecutorV2TestBase {
    bytes32 private constant EXECUTION_HASH = 0xa85883437b578ca1f365a565083b22fe473e1559d73d8cf6b289ad7c8121e4ae;
    bytes32 private constant AUTHORIZATION_HASH = 0xf24bfc4a91a7c9d74099d4b830436cd5ae9cffd76dbdd0b5008bf524cfb3166d;

    function test_matchesTheTypeScriptGoldenAbiHashes() public view {
        CobiaExecutorV2.ExecutionProgramV2 memory value = _goldenProgram();
        CobiaExecutorV2.VerifierAuthorizationV2 memory authorization = CobiaExecutorV2.VerifierAuthorizationV2({
            executor: address(0x5555555555555555555555555555555555555555),
            chainId: 196,
            executionCommitment: EXECUTION_HASH,
            policyHash: value.policyHash,
            manifestHash: value.manifestHash,
            canonicalProgramHash: value.canonicalProgramHash,
            simulationHash: value.simulationHash,
            pinnedBlockNumber: value.pinnedBlockNumber,
            pinnedBlockHash: value.pinnedBlockHash,
            owner: value.owner,
            inputToken: value.inputToken,
            inputAmount: value.inputAmount,
            deadline: value.deadline,
            nonce: value.nonce
        });

        assert(executor.executionProgramHash(value) == EXECUTION_HASH);
        assert(keccak256(abi.encode(authorization)) == AUTHORIZATION_HASH);
    }

    function _goldenProgram() private pure returns (CobiaExecutorV2.ExecutionProgramV2 memory value) {
        CobiaExecutorV2.ApprovalV2[] memory approvals = new CobiaExecutorV2.ApprovalV2[](1);
        approvals[0] =
            CobiaExecutorV2.ApprovalV2({token: address(0x2222222222222222222222222222222222222222), amount: 1_000_000});
        CobiaExecutorV2.ActionV2[] memory actions = new CobiaExecutorV2.ActionV2[](1);
        actions[0] = CobiaExecutorV2.ActionV2({
            capabilityKey: bytes32(uint256(0x7777777777777777777777777777777777777777777777777777777777777777)),
            target: address(0x3333333333333333333333333333333333333333),
            approvals: approvals,
            data: hex"12345678"
        });
        address[] memory refunds = new address[](2);
        refunds[0] = address(0x2222222222222222222222222222222222222222);
        refunds[1] = address(0x4444444444444444444444444444444444444444);
        CobiaExecutorV2.BalanceConstraintV2[] memory constraints = new CobiaExecutorV2.BalanceConstraintV2[](1);
        constraints[0] = CobiaExecutorV2.BalanceConstraintV2({
            token: address(0x4444444444444444444444444444444444444444), minimumIncrease: 990_000
        });
        value = CobiaExecutorV2.ExecutionProgramV2({
            policyHash: bytes32(uint256(0x1111111111111111111111111111111111111111111111111111111111111111)),
            manifestHash: bytes32(uint256(0x2222222222222222222222222222222222222222222222222222222222222222)),
            canonicalProgramHash: bytes32(uint256(0x3333333333333333333333333333333333333333333333333333333333333333)),
            simulationHash: bytes32(uint256(0x4444444444444444444444444444444444444444444444444444444444444444)),
            pinnedBlockNumber: 123,
            pinnedBlockHash: bytes32(uint256(0x5555555555555555555555555555555555555555555555555555555555555555)),
            owner: address(0x1111111111111111111111111111111111111111),
            inputToken: address(0x2222222222222222222222222222222222222222),
            inputAmount: 1_000_000,
            deadline: 1_800_000_000,
            nonce: bytes32(uint256(0x6666666666666666666666666666666666666666666666666666666666666666)),
            refundTokens: refunds,
            actions: actions,
            constraints: constraints
        });
    }
}
