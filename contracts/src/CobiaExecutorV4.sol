// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {CobiaAdapterRegistry} from "./CobiaAdapterRegistry.sol";
import {CobiaExecutionTypesV4 as Types} from "./CobiaExecutionTypesV4.sol";
import {CobiaExecutionValidationV4 as Validation} from "./CobiaExecutionValidationV4.sol";
import {CobiaRiskManagerV2} from "./CobiaRiskManagerV2.sol";

contract CobiaExecutorV4 is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_CALLS = 8;
    uint256 public constant MAX_APPROVALS = 16;
    uint256 public constant MAX_CONSTRAINTS = 8;
    uint256 public constant MAX_REFUND_TOKENS = 16;
    uint256 public constant MAX_CALLDATA_BYTES = 16_384;
    uint256 public constant MAX_CALL_GAS = 1_000_000;
    uint256 public constant MAX_TOTAL_CALL_GAS = 4_000_000;
    bytes32 public constant AUTHORIZATION_TYPEHASH = keccak256("VerifierAuthorizationV4(bytes32 payloadHash)");

    error AdapterCallFailed();
    error AuthorizationMismatch();
    error DeadlineExpired();
    error ExecutorBalanceConsumed();
    error FinalBalanceBelowMinimum();
    error InvalidProgram();
    error NativeRefundFailed();
    error NonceAlreadyUsed();
    error PermissionInactive();
    error VerifierSignatureInvalid();
    error WalletDebitExceeded();

    event ProgramExecuted(
        address indexed owner,
        bytes32 indexed canonicalProgramHash,
        bytes32 indexed executionCommitment,
        bytes32 stageHash,
        bytes32 simulationHash,
        uint128 inputUsdE8
    );

    CobiaAdapterRegistry public immutable registry;
    CobiaRiskManagerV2 public immutable riskManager;
    mapping(address owner => mapping(bytes32 nonce => bool used)) public nonceUsed;

    constructor(CobiaAdapterRegistry registry_, CobiaRiskManagerV2 riskManager_)
        EIP712("CobiaGeneralAssetExecutor", "4")
    {
        if (address(registry_) == address(0) || address(riskManager_) == address(0)) revert InvalidProgram();
        registry = registry_;
        riskManager = riskManager_;
    }

    function execute(
        Types.ExecutionProgramV4 calldata program,
        Types.VerifierAuthorizationV4 calldata authorization,
        bytes calldata signature
    ) external payable nonReentrant {
        uint256 requiredNative = _validateProgram(program);
        if (msg.value != requiredNative) revert InvalidProgram();
        _validateAuthorization(program, authorization, signature);
        if (nonceUsed[program.owner][program.nonce]) revert NonceAlreadyUsed();
        nonceUsed[program.owner][program.nonce] = true;
        riskManager.consumeUsd(program.owner, program.inputUsdE8);

        uint256 ownerInputBefore = IERC20(program.inputToken).balanceOf(program.owner);
        uint256[] memory constraintBalances = _constraintBalances(program);
        uint256[] memory executorBalances = _refundBalances(program.refundTokens);
        uint256 nativeBefore = address(this).balance - msg.value;

        IERC20(program.inputToken).safeTransferFrom(program.owner, address(this), program.inputAmount);
        for (uint256 index; index < program.calls.length; ++index) {
            _executeCall(program.calls[index]);
        }
        _refundTokens(program.owner, program.refundTokens, executorBalances);
        _refundNative(program.owner, nativeBefore);
        _assertWalletDebit(program, ownerInputBefore);
        _assertConstraints(program, constraintBalances);

        emit ProgramExecuted(
            program.owner,
            program.canonicalProgramHash,
            executionProgramHash(program),
            program.stageHash,
            program.simulationHash,
            program.inputUsdE8
        );
    }

    function executionProgramHash(Types.ExecutionProgramV4 memory program) public pure returns (bytes32) {
        return keccak256(abi.encode(program));
    }

    function authorizationPayloadHash(Types.VerifierAuthorizationV4 memory authorization)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(authorization));
    }

    function authorizationDigest(Types.VerifierAuthorizationV4 memory authorization) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(AUTHORIZATION_TYPEHASH, authorizationPayloadHash(authorization))));
    }

    function _validateProgram(Types.ExecutionProgramV4 calldata program) private view returns (uint256 nativeValue) {
        if (block.timestamp >= program.deadline) revert DeadlineExpired();
        nativeValue = Validation.validate(program, msg.sender, address(this), block.chainid);
    }

    function _validateAuthorization(
        Types.ExecutionProgramV4 calldata program,
        Types.VerifierAuthorizationV4 calldata authorization,
        bytes calldata signature
    ) private view {
        Types.VerifierAuthorizationV4 memory expected =
            Types.VerifierAuthorizationV4({
                executor: address(this),
                chainId: block.chainid,
                executionCommitment: executionProgramHash(program),
                policyHash: program.policyHash,
                manifestHash: program.manifestHash,
                canonicalProgramHash: program.canonicalProgramHash,
                inputIdentityEvidenceHash: program.inputIdentityEvidenceHash,
                outputIdentityEvidenceHash: program.outputIdentityEvidenceHash,
                valuationEvidenceHash: program.valuationEvidenceHash,
                stageHash: program.stageHash,
                simulationHash: program.simulationHash,
                pinnedBlockNumber: program.pinnedBlockNumber,
                pinnedBlockHash: program.pinnedBlockHash,
                owner: program.owner,
                inputToken: program.inputToken,
                outputToken: program.outputToken,
                inputAmount: program.inputAmount,
                inputUsdE8: program.inputUsdE8,
                deadline: program.deadline,
                nonce: program.nonce
            });
        if (authorizationPayloadHash(authorization) != authorizationPayloadHash(expected)) {
            revert AuthorizationMismatch();
        }
        if (ECDSA.recover(authorizationDigest(authorization), signature) != riskManager.verifierSigner()) {
            revert VerifierSignatureInvalid();
        }
    }

    function _executeCall(Types.CallV4 calldata call_) private {
        bytes4 selector;
        bytes calldata data = call_.data;
        assembly {
            selector := calldataload(data.offset)
        }
        if (!registry.isActive(call_.adapterKey, call_.target, selector)) revert PermissionInactive();
        for (uint256 index; index < call_.approvals.length; ++index) {
            IERC20(call_.approvals[index].token).forceApprove(call_.target, call_.approvals[index].amount);
        }
        (bool success,) = call_.target.call{value: call_.value, gas: call_.gasLimit}(call_.data);
        if (!success) revert AdapterCallFailed();
        for (uint256 index; index < call_.approvals.length; ++index) {
            IERC20(call_.approvals[index].token).forceApprove(call_.target, 0);
        }
    }

    function _constraintBalances(Types.ExecutionProgramV4 calldata program)
        private
        view
        returns (uint256[] memory balances)
    {
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

    function _refundTokens(address owner, address[] calldata tokens, uint256[] memory beforeBalances) private {
        for (uint256 index; index < tokens.length; ++index) {
            IERC20 token = IERC20(tokens[index]);
            uint256 balance = token.balanceOf(address(this));
            if (balance < beforeBalances[index]) revert ExecutorBalanceConsumed();
            uint256 refundable = balance - beforeBalances[index];
            if (refundable != 0) token.safeTransfer(owner, refundable);
            if (token.balanceOf(address(this)) != beforeBalances[index]) revert ExecutorBalanceConsumed();
        }
    }

    function _refundNative(address owner, uint256 nativeBefore) private {
        uint256 balance = address(this).balance;
        if (balance < nativeBefore) revert ExecutorBalanceConsumed();
        uint256 refundable = balance - nativeBefore;
        if (refundable != 0) {
            (bool success,) = owner.call{value: refundable}("");
            if (!success) revert NativeRefundFailed();
        }
        if (address(this).balance != nativeBefore) revert ExecutorBalanceConsumed();
    }

    function _assertConstraints(Types.ExecutionProgramV4 calldata program, uint256[] memory beforeBalances)
        private
        view
    {
        for (uint256 index; index < program.constraints.length; ++index) {
            Types.BalanceConstraintV4 calldata constraint = program.constraints[index];
            uint256 afterBalance = IERC20(constraint.token).balanceOf(program.owner);
            uint256 minimum = constraint.kind == Types.ConstraintKind.Absolute
                ? constraint.minimum
                : beforeBalances[index] + constraint.minimum;
            if (afterBalance < minimum) revert FinalBalanceBelowMinimum();
        }
    }

    function _assertWalletDebit(Types.ExecutionProgramV4 calldata program, uint256 ownerInputBefore) private view {
        uint256 afterBalance = IERC20(program.inputToken).balanceOf(program.owner);
        if (afterBalance < ownerInputBefore && ownerInputBefore - afterBalance > program.inputAmount) {
            revert WalletDebitExceeded();
        }
    }
}
