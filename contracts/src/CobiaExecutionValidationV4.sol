// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {CobiaExecutionTypesV4 as Types} from "./CobiaExecutionTypesV4.sol";

library CobiaExecutionValidationV4 {
    error InvalidProgram();

    function validate(Types.ExecutionProgramV4 calldata program, address caller, address executor, uint256 chainId)
        internal
        pure
        returns (uint256 nativeValue)
    {
        if (
            program.owner == address(0) || program.owner != caller || program.inputToken == address(0)
                || program.outputToken == address(0) || program.inputAmount == 0 || program.inputUsdE8 == 0
                || program.sourceChainId != chainId || (chainId != 1 && chainId != 196) || program.deadline == 0
                || program.nonce == bytes32(0) || program.pinnedBlockNumber == 0
                || program.pinnedBlockHash == bytes32(0) || !_allCommitmentsPresent(program)
        ) revert InvalidProgram();
        if (
            program.refundTokens.length == 0 || program.refundTokens.length > 16 || program.calls.length == 0
                || program.calls.length > 8 || program.constraints.length == 0 || program.constraints.length > 8
        ) revert InvalidProgram();
        _validateRefunds(program);
        nativeValue = _validateCalls(program, executor);
        _validateConstraints(program);
    }

    function _allCommitmentsPresent(Types.ExecutionProgramV4 calldata program) private pure returns (bool) {
        return program.policyHash != bytes32(0) && program.manifestHash != bytes32(0)
            && program.canonicalProgramHash != bytes32(0) && program.inputIdentityEvidenceHash != bytes32(0)
            && program.outputIdentityEvidenceHash != bytes32(0) && program.valuationEvidenceHash != bytes32(0)
            && program.stageHash != bytes32(0) && program.simulationHash != bytes32(0);
    }

    function _validateRefunds(Types.ExecutionProgramV4 calldata program) private pure {
        bool includesInput;
        bool includesOutput;
        for (uint256 index; index < program.refundTokens.length; ++index) {
            address token = program.refundTokens[index];
            if (token == address(0) || (index > 0 && program.refundTokens[index - 1] >= token)) {
                revert InvalidProgram();
            }
            if (token == program.inputToken) includesInput = true;
            if (token == program.outputToken) includesOutput = true;
        }
        if (!includesInput || !includesOutput) revert InvalidProgram();
    }

    function _validateCalls(Types.ExecutionProgramV4 calldata program, address executor)
        private
        pure
        returns (uint256 nativeValue)
    {
        uint256 approvalCount;
        uint256 calldataBytes;
        uint256 totalGas;
        for (uint256 index; index < program.calls.length; ++index) {
            Types.CallV4 calldata call_ = program.calls[index];
            if (
                call_.adapterKey == bytes32(0) || call_.target == address(0) || call_.target == executor
                    || call_.data.length < 4 || call_.gasLimit < 21_000 || call_.gasLimit > 1_000_000
            ) revert InvalidProgram();
            nativeValue += call_.value;
            calldataBytes += call_.data.length;
            totalGas += call_.gasLimit;
            approvalCount += call_.approvals.length;
            for (uint256 approvalIndex; approvalIndex < call_.approvals.length; ++approvalIndex) {
                Types.ApprovalV4 calldata approval = call_.approvals[approvalIndex];
                if (
                    approval.token == address(0) || approval.amount == 0
                        || !_contains(program.refundTokens, approval.token)
                        || (approvalIndex > 0 && call_.approvals[approvalIndex - 1].token >= approval.token)
                ) revert InvalidProgram();
            }
        }
        if (approvalCount > 16 || calldataBytes > 16_384 || totalGas > 4_000_000) revert InvalidProgram();
    }

    function _validateConstraints(Types.ExecutionProgramV4 calldata program) private pure {
        bool includesOutput;
        for (uint256 index; index < program.constraints.length; ++index) {
            Types.BalanceConstraintV4 calldata constraint = program.constraints[index];
            if (
                constraint.token == address(0) || constraint.minimum == 0
                    || !_contains(program.refundTokens, constraint.token)
                    || (index > 0 && program.constraints[index - 1].token >= constraint.token)
            ) revert InvalidProgram();
            if (constraint.token == program.outputToken) includesOutput = true;
        }
        if (!includesOutput) revert InvalidProgram();
    }

    function _contains(address[] calldata values, address candidate) private pure returns (bool) {
        for (uint256 index; index < values.length; ++index) {
            if (values[index] == candidate) return true;
        }
        return false;
    }
}
