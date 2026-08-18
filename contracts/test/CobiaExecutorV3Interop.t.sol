// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {CobiaExecutorV3} from "../src/CobiaExecutorV3.sol";
import {CobiaStaticGuard} from "../src/CobiaStaticGuard.sol";
import {ExecutorV3TestBase} from "./utils/ExecutorV3TestBase.sol";

contract CobiaExecutorV3InteropTest is ExecutorV3TestBase {
    bytes32 private constant EXECUTION_HASH = 0x08143c79d9233910fea0c1fd0377630099596f9076652ea43c1ac612cf732af1;
    bytes32 private constant AUTHORIZATION_HASH = 0xe1aa36dea7800a403c2388b5daa76b69dbb0ef250e80b3e659dde637e2c8f3cf;

    function test_matchesTheTypeScriptGoldenAbiHashes() public view {
        CobiaExecutorV3.ExecutionProgramV3 memory value = _goldenProgram();
        CobiaExecutorV3.VerifierAuthorizationV3 memory auth = CobiaExecutorV3.VerifierAuthorizationV3({
            executor: address(0x5555555555555555555555555555555555555555), chainId: 196,
            executionCommitment: EXECUTION_HASH, policyHash: value.policyHash,
            manifestHash: value.manifestHash, canonicalProgramHash: value.canonicalProgramHash,
            simulationHash: value.simulationHash, pinnedBlockNumber: value.pinnedBlockNumber,
            pinnedBlockHash: value.pinnedBlockHash, owner: value.owner, inputToken: value.inputToken,
            inputAmount: value.inputAmount, deadline: value.deadline, nonce: value.nonce
        });
        assert(executor.executionProgramHash(value) == EXECUTION_HASH);
        assert(keccak256(abi.encode(auth)) == AUTHORIZATION_HASH);
    }

    function _goldenProgram() private pure returns (CobiaExecutorV3.ExecutionProgramV3 memory value) {
        CobiaExecutorV3.ApprovalV3[] memory approvals = new CobiaExecutorV3.ApprovalV3[](1);
        approvals[0] = CobiaExecutorV3.ApprovalV3(address(0x2222222222222222222222222222222222222222), 1_000_000);
        CobiaExecutorV3.ActionV3[] memory actions = new CobiaExecutorV3.ActionV3[](1);
        actions[0] = CobiaExecutorV3.ActionV3({
            capabilityKey: bytes32(uint256(0x7777777777777777777777777777777777777777777777777777777777777777)),
            target: address(0x3333333333333333333333333333333333333333), approvals: approvals, data: hex"12345678"
        });
        CobiaExecutorV3.BalanceConstraintV3[] memory constraints = new CobiaExecutorV3.BalanceConstraintV3[](1);
        constraints[0] = CobiaExecutorV3.BalanceConstraintV3({
            token: address(0x4444444444444444444444444444444444444444),
            kind: CobiaExecutorV3.ConstraintKind.Increase, minimum: 990_000
        });
        CobiaStaticGuard.PredicateV1[] memory predicates = new CobiaStaticGuard.PredicateV1[](1);
        predicates[0] = CobiaStaticGuard.PredicateV1({
            read: CobiaStaticGuard.ReadV1({
                target: address(0x4444444444444444444444444444444444444444),
                runtimeCodeHash: bytes32(uint256(0x8888888888888888888888888888888888888888888888888888888888888888)),
                data: hex"70a082310000000000000000000000001111111111111111111111111111111111111111",
                returnWordIndex: 0, decodeType: CobiaStaticGuard.DecodeType.Uint256, gasLimit: 50_000
            }), phase: CobiaStaticGuard.Phase.After, comparator: CobiaStaticGuard.Comparator.Gte,
            bound: bytes32(uint256(990_000))
        });
        address[] memory refunds = new address[](2);
        refunds[0] = address(0x2222222222222222222222222222222222222222);
        refunds[1] = address(0x4444444444444444444444444444444444444444);
        value = CobiaExecutorV3.ExecutionProgramV3({
            policyHash: bytes32(uint256(0x1111111111111111111111111111111111111111111111111111111111111111)),
            manifestHash: bytes32(uint256(0x2222222222222222222222222222222222222222222222222222222222222222)),
            canonicalProgramHash: bytes32(uint256(0x3333333333333333333333333333333333333333333333333333333333333333)),
            simulationHash: bytes32(uint256(0x4444444444444444444444444444444444444444444444444444444444444444)),
            pinnedBlockNumber: 123,
            pinnedBlockHash: bytes32(uint256(0x5555555555555555555555555555555555555555555555555555555555555555)),
            owner: address(0x1111111111111111111111111111111111111111),
            inputToken: address(0x2222222222222222222222222222222222222222), inputAmount: 1_000_000,
            deadline: 1_800_000_000,
            nonce: bytes32(uint256(0x6666666666666666666666666666666666666666666666666666666666666666)),
            refundTokens: refunds, actions: actions, constraints: constraints, predicates: predicates
        });
    }
}
