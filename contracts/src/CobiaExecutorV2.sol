// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {CobiaAdapterRegistry} from "./CobiaAdapterRegistry.sol";
import {CobiaRiskManagerV1} from "./CobiaRiskManagerV1.sol";

contract CobiaExecutorV2 is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_ACTIONS = 8;
    uint256 public constant MAX_APPROVALS = 16;
    uint256 public constant MAX_CONSTRAINTS = 8;
    uint256 public constant MAX_REFUND_TOKENS = 16;
    uint256 public constant MAX_CALLDATA_BYTES = 16_384;
    bytes32 public constant AUTHORIZATION_TYPEHASH = keccak256("VerifierAuthorizationV2(bytes32 payloadHash)");

    struct ApprovalV2 {
        address token;
        uint128 amount;
    }

    struct ActionV2 {
        bytes32 capabilityKey;
        address target;
        ApprovalV2[] approvals;
        bytes data;
    }

    struct BalanceConstraintV2 {
        address token;
        uint128 minimumIncrease;
    }

    struct ExecutionProgramV2 {
        bytes32 policyHash;
        bytes32 manifestHash;
        bytes32 canonicalProgramHash;
        bytes32 simulationHash;
        uint64 pinnedBlockNumber;
        bytes32 pinnedBlockHash;
        address owner;
        address inputToken;
        uint128 inputAmount;
        uint64 deadline;
        bytes32 nonce;
        address[] refundTokens;
        ActionV2[] actions;
        BalanceConstraintV2[] constraints;
    }

    struct VerifierAuthorizationV2 {
        address executor;
        uint256 chainId;
        bytes32 executionCommitment;
        bytes32 policyHash;
        bytes32 manifestHash;
        bytes32 canonicalProgramHash;
        bytes32 simulationHash;
        uint64 pinnedBlockNumber;
        bytes32 pinnedBlockHash;
        address owner;
        address inputToken;
        uint128 inputAmount;
        uint64 deadline;
        bytes32 nonce;
    }

    error AuthorizationMismatch();
    error DeadlineExpired();
    error ExecutorBalanceConsumed();
    error FinalBalanceBelowMinimum();
    error InvalidProgram();
    error NonceAlreadyUsed();
    error PermissionInactive();
    error ProtocolCallFailed();
    error VerifierSignatureInvalid();

    event ProgramExecuted(
        address indexed owner,
        bytes32 indexed canonicalProgramHash,
        bytes32 indexed executionCommitment,
        bytes32 simulationHash
    );

    CobiaAdapterRegistry public immutable registry;
    CobiaRiskManagerV1 public immutable riskManager;
    mapping(address owner => mapping(bytes32 nonce => bool used)) public nonceUsed;

    constructor(CobiaAdapterRegistry registry_, CobiaRiskManagerV1 riskManager_)
        EIP712("CobiaCapabilityExecutor", "2")
    {
        if (address(registry_) == address(0) || address(riskManager_) == address(0)) {
            revert InvalidProgram();
        }
        registry = registry_;
        riskManager = riskManager_;
    }

    function execute(
        ExecutionProgramV2 calldata program,
        VerifierAuthorizationV2 calldata authorization,
        bytes calldata signature
    ) external nonReentrant {
        _validateProgram(program);
        _validateAuthorization(program, authorization, signature);
        if (nonceUsed[program.owner][program.nonce]) revert NonceAlreadyUsed();
        nonceUsed[program.owner][program.nonce] = true;
        riskManager.consume(program.owner, program.inputToken, program.inputAmount);

        uint256[] memory beforeBalances = _constraintBalances(program);
        uint256[] memory beforeRefundBalances = _refundBalances(program.refundTokens);
        IERC20(program.inputToken).safeTransferFrom(program.owner, address(this), program.inputAmount);
        for (uint256 index; index < program.actions.length; ++index) {
            _executeAction(program.actions[index]);
        }
        _refund(program.owner, program.refundTokens, beforeRefundBalances);
        _assertConstraints(program, beforeBalances);
        emit ProgramExecuted(
            program.owner, program.canonicalProgramHash, executionProgramHash(program), program.simulationHash
        );
    }

    function executionProgramHash(ExecutionProgramV2 memory program) public pure returns (bytes32) {
        return keccak256(abi.encode(program));
    }

    function authorizationDigest(VerifierAuthorizationV2 memory authorization) public view returns (bytes32) {
        bytes32 payloadHash = keccak256(abi.encode(authorization));
        return _hashTypedDataV4(keccak256(abi.encode(AUTHORIZATION_TYPEHASH, payloadHash)));
    }

    function _validateProgram(ExecutionProgramV2 calldata program) private view {
        if (
            program.owner == address(0) || program.owner != msg.sender || program.inputToken == address(0)
                || program.inputAmount == 0 || program.nonce == bytes32(0) || program.policyHash == bytes32(0)
                || program.manifestHash == bytes32(0) || program.canonicalProgramHash == bytes32(0)
                || program.simulationHash == bytes32(0) || program.pinnedBlockNumber == 0
                || program.pinnedBlockHash == bytes32(0)
        ) revert InvalidProgram();
        if (block.timestamp >= program.deadline) revert DeadlineExpired();
        if (
            program.actions.length == 0 || program.actions.length > MAX_ACTIONS || program.constraints.length == 0
                || program.constraints.length > MAX_CONSTRAINTS || program.refundTokens.length == 0
                || program.refundTokens.length > MAX_REFUND_TOKENS
        ) revert InvalidProgram();
        _validateRefundTokens(program);
        _validateActions(program);
        for (uint256 index; index < program.constraints.length; ++index) {
            BalanceConstraintV2 calldata constraint = program.constraints[index];
            if (constraint.minimumIncrease == 0 || !_contains(program.refundTokens, constraint.token)) {
                revert InvalidProgram();
            }
        }
    }

    function _validateRefundTokens(ExecutionProgramV2 calldata program) private pure {
        bool includesInput;
        for (uint256 index; index < program.refundTokens.length; ++index) {
            address token = program.refundTokens[index];
            if (token == address(0)) revert InvalidProgram();
            if (token == program.inputToken) includesInput = true;
            for (uint256 prior; prior < index; ++prior) {
                if (program.refundTokens[prior] == token) revert InvalidProgram();
            }
        }
        if (!includesInput) revert InvalidProgram();
    }

    function _validateActions(ExecutionProgramV2 calldata program) private pure {
        uint256 approvalCount;
        uint256 calldataBytes;
        for (uint256 index; index < program.actions.length; ++index) {
            ActionV2 calldata action = program.actions[index];
            if (action.capabilityKey == bytes32(0) || action.target == address(0) || action.data.length < 4) {
                revert InvalidProgram();
            }
            calldataBytes += action.data.length;
            approvalCount += action.approvals.length;
            for (uint256 approvalIndex; approvalIndex < action.approvals.length; ++approvalIndex) {
                ApprovalV2 calldata approval = action.approvals[approvalIndex];
                if (approval.amount == 0 || !_contains(program.refundTokens, approval.token)) {
                    revert InvalidProgram();
                }
                for (uint256 prior; prior < approvalIndex; ++prior) {
                    if (action.approvals[prior].token == approval.token) revert InvalidProgram();
                }
            }
        }
        if (approvalCount > MAX_APPROVALS || calldataBytes > MAX_CALLDATA_BYTES) {
            revert InvalidProgram();
        }
    }

    function _validateAuthorization(
        ExecutionProgramV2 calldata program,
        VerifierAuthorizationV2 calldata authorization,
        bytes calldata signature
    ) private view {
        if (
            authorization.executor != address(this) || authorization.chainId != block.chainid
                || authorization.executionCommitment != executionProgramHash(program)
                || authorization.policyHash != program.policyHash || authorization.manifestHash != program.manifestHash
                || authorization.canonicalProgramHash != program.canonicalProgramHash
                || authorization.simulationHash != program.simulationHash
                || authorization.pinnedBlockNumber != program.pinnedBlockNumber
                || authorization.pinnedBlockHash != program.pinnedBlockHash || authorization.owner != program.owner
                || authorization.inputToken != program.inputToken || authorization.inputAmount != program.inputAmount
                || authorization.deadline != program.deadline || authorization.nonce != program.nonce
        ) {
            revert AuthorizationMismatch();
        }
        if (ECDSA.recover(authorizationDigest(authorization), signature) != riskManager.verifierSigner()) {
            revert VerifierSignatureInvalid();
        }
    }

    function _executeAction(ActionV2 calldata action) private {
        bytes calldata data = action.data;
        bytes4 selector;
        assembly {
            selector := calldataload(data.offset)
        }
        if (!registry.isActive(action.capabilityKey, action.target, selector)) {
            revert PermissionInactive();
        }
        for (uint256 index; index < action.approvals.length; ++index) {
            IERC20(action.approvals[index].token).forceApprove(action.target, action.approvals[index].amount);
        }
        (bool success,) = action.target.call(action.data);
        if (!success) revert ProtocolCallFailed();
        for (uint256 index; index < action.approvals.length; ++index) {
            IERC20(action.approvals[index].token).forceApprove(action.target, 0);
        }
    }

    function _constraintBalances(ExecutionProgramV2 calldata program) private view returns (uint256[] memory balances) {
        balances = new uint256[](program.constraints.length);
        for (uint256 index; index < program.constraints.length; ++index) {
            balances[index] = IERC20(program.constraints[index].token).balanceOf(program.owner);
        }
    }

    function _refundBalances(address[] calldata tokens) private view returns (uint256[] memory balances) {
        balances = new uint256[](tokens.length);
        for (uint256 index; index < tokens.length; ++index) {
            balances[index] = IERC20(tokens[index]).balanceOf(address(this));
        }
    }

    function _refund(address owner, address[] calldata tokens, uint256[] memory beforeBalances) private {
        for (uint256 index; index < tokens.length; ++index) {
            IERC20 token = IERC20(tokens[index]);
            uint256 balance = token.balanceOf(address(this));
            if (balance < beforeBalances[index]) revert ExecutorBalanceConsumed();
            uint256 refundable = balance - beforeBalances[index];
            if (refundable > 0) token.safeTransfer(owner, refundable);
        }
    }

    function _assertConstraints(ExecutionProgramV2 calldata program, uint256[] memory beforeBalances) private view {
        for (uint256 index; index < program.constraints.length; ++index) {
            BalanceConstraintV2 calldata constraint = program.constraints[index];
            uint256 afterBalance = IERC20(constraint.token).balanceOf(program.owner);
            if (afterBalance < beforeBalances[index] + constraint.minimumIncrease) {
                revert FinalBalanceBelowMinimum();
            }
        }
    }

    function _contains(address[] calldata values, address candidate) private pure returns (bool) {
        for (uint256 index; index < values.length; ++index) {
            if (values[index] == candidate) return true;
        }
        return false;
    }
}
