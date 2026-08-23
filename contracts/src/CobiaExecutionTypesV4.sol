// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

library CobiaExecutionTypesV4 {
    enum ConstraintKind {
        Absolute,
        Increase
    }

    struct ApprovalV4 {
        address token;
        uint128 amount;
    }

    struct CallV4 {
        bytes32 adapterKey;
        address target;
        uint96 value;
        uint32 gasLimit;
        ApprovalV4[] approvals;
        bytes data;
    }

    struct BalanceConstraintV4 {
        address token;
        ConstraintKind kind;
        uint128 minimum;
    }

    struct ExecutionProgramV4 {
        bytes32 policyHash;
        bytes32 manifestHash;
        bytes32 canonicalProgramHash;
        bytes32 inputIdentityEvidenceHash;
        bytes32 outputIdentityEvidenceHash;
        bytes32 valuationEvidenceHash;
        bytes32 stageHash;
        bytes32 simulationHash;
        uint64 pinnedBlockNumber;
        bytes32 pinnedBlockHash;
        uint256 sourceChainId;
        address owner;
        address inputToken;
        address outputToken;
        uint128 inputAmount;
        uint128 inputUsdE8;
        uint64 deadline;
        bytes32 nonce;
        address[] refundTokens;
        CallV4[] calls;
        BalanceConstraintV4[] constraints;
    }

    struct VerifierAuthorizationV4 {
        address executor;
        uint256 chainId;
        bytes32 executionCommitment;
        bytes32 policyHash;
        bytes32 manifestHash;
        bytes32 canonicalProgramHash;
        bytes32 inputIdentityEvidenceHash;
        bytes32 outputIdentityEvidenceHash;
        bytes32 valuationEvidenceHash;
        bytes32 stageHash;
        bytes32 simulationHash;
        uint64 pinnedBlockNumber;
        bytes32 pinnedBlockHash;
        address owner;
        address inputToken;
        address outputToken;
        uint128 inputAmount;
        uint128 inputUsdE8;
        uint64 deadline;
        bytes32 nonce;
    }
}
