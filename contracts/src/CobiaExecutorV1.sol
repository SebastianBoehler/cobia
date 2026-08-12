// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {CobiaAdapterRegistry} from "./CobiaAdapterRegistry.sol";

contract CobiaExecutorV1 is EIP712, Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint128 public constant MAX_ROUTE_INPUT_ATOMIC = 10_000_000;
    uint128 public constant MAX_WALLET_DAILY_INPUT_ATOMIC = 50_000_000;
    uint128 public constant MAX_CUMULATIVE_INPUT_ATOMIC = 250_000_000;
    uint256 public constant MAX_STEPS = 8;
    uint256 public constant MAX_CONSTRAINTS = 8;

    bytes32 public constant AUTHORIZATION_TYPEHASH = keccak256(
        "VerifierAuthorizationV1(bytes32 payloadHash)"
    );

    struct StepV1 {
        bytes32 adapterId;
        address target;
        address spendToken;
        uint128 spendAmount;
        bytes data;
    }

    struct BalanceConstraintV1 {
        address token;
        address account;
        uint128 minimumIncrease;
    }

    struct ExecutionRouteV1 {
        bytes32 policyHash;
        bytes32 snapshotHash;
        bytes32 bundleHash;
        bytes32 routeHash;
        bytes32 simulationHash;
        address owner;
        address inputToken;
        uint128 inputAmount;
        uint64 deadline;
        bytes32 nonce;
        StepV1[] steps;
        BalanceConstraintV1[] constraints;
    }

    struct VerifierAuthorizationV1 {
        address executor;
        uint256 chainId;
        bytes32 routeCommitment;
        bytes32 policyHash;
        bytes32 snapshotHash;
        bytes32 bundleHash;
        bytes32 routeHash;
        bytes32 simulationHash;
        bytes32 constraintsHash;
        address owner;
        address inputToken;
        uint128 inputAmount;
        uint64 deadline;
        bytes32 nonce;
    }

    error AuthorizationMismatch();
    error DeadlineExpired();
    error FinalBalanceBelowMinimum();
    error InvalidRoute();
    error NonceAlreadyUsed();
    error ProtocolCallFailed();
    error RouteCapExceeded();
    error UnsupportedToken();
    error VerifierSignatureInvalid();
    error WalletDailyCapExceeded();
    error WalletNotAllowed();
    error ExecutorPaused();
    error CumulativeCapExceeded();
    error PermissionInactive();

    event ExecutorPauseChanged(bool paused);
    event RouteExecuted(
        address indexed owner,
        bytes32 indexed bundleHash,
        bytes32 indexed routeHash,
        bytes32 simulationHash
    );
    event WalletAccessChanged(address indexed wallet, bool allowed);

    CobiaAdapterRegistry public immutable registry;
    address public immutable verifierSigner;
    address[] private supportedTokens;
    mapping(address token => bool supported) public isSupportedToken;
    mapping(address wallet => bool allowed) public walletAllowed;
    mapping(address wallet => mapping(bytes32 nonce => bool used)) public nonceUsed;
    mapping(address wallet => mapping(uint64 day => uint256 amount)) public walletDailyInputAtomic;
    uint256 public cumulativeInputAtomic;
    bool public paused = true;

    constructor(
        address initialOwner,
        CobiaAdapterRegistry adapterRegistry,
        address verifier,
        address[] memory tokens
    ) EIP712("CobiaAtomicExecutor", "1") Ownable(initialOwner) {
        if (address(adapterRegistry) == address(0) || verifier == address(0) || tokens.length == 0) {
            revert InvalidRoute();
        }
        registry = adapterRegistry;
        verifierSigner = verifier;
        for (uint256 index; index < tokens.length; ++index) {
            address token = tokens[index];
            if (token == address(0) || isSupportedToken[token]) revert InvalidRoute();
            isSupportedToken[token] = true;
            supportedTokens.push(token);
        }
    }

    function setWalletAllowed(address wallet, bool allowed) external onlyOwner {
        if (wallet == address(0)) revert InvalidRoute();
        walletAllowed[wallet] = allowed;
        emit WalletAccessChanged(wallet, allowed);
    }

    function setPaused(bool nextPaused) external onlyOwner {
        paused = nextPaused;
        emit ExecutorPauseChanged(nextPaused);
    }

    function execute(
        ExecutionRouteV1 calldata route,
        VerifierAuthorizationV1 calldata authorization,
        bytes calldata signature
    ) external nonReentrant {
        if (paused) revert ExecutorPaused();
        _validateRoute(route);
        _validateAuthorization(route, authorization, signature);
        _consumeAccessAndCaps(route);

        uint256[] memory beforeBalances = _constraintBalances(route.constraints);
        IERC20(route.inputToken).safeTransferFrom(route.owner, address(this), route.inputAmount);
        for (uint256 index; index < route.steps.length; ++index) {
            _executeStep(route.steps[index]);
        }
        _assertConstraints(route.constraints, beforeBalances);
        _refundSupportedTokens(route.owner);
        emit RouteExecuted(
            route.owner,
            route.bundleHash,
            route.routeHash,
            route.simulationHash
        );
    }

    function executionRouteHash(ExecutionRouteV1 memory route)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(route));
    }

    function balanceConstraintsHash(BalanceConstraintV1[] memory constraints)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(constraints));
    }

    function authorizationDigest(VerifierAuthorizationV1 memory authorization)
        public
        view
        returns (bytes32)
    {
        bytes32 payloadHash = keccak256(abi.encode(authorization));
        return _hashTypedDataV4(keccak256(abi.encode(AUTHORIZATION_TYPEHASH, payloadHash)));
    }

    function _validateRoute(ExecutionRouteV1 calldata route) private view {
        if (route.owner != msg.sender || route.owner == address(0) || route.inputAmount == 0
            || route.steps.length == 0 || route.steps.length > MAX_STEPS
            || route.constraints.length == 0 || route.constraints.length > MAX_CONSTRAINTS
            || route.nonce == bytes32(0)) revert InvalidRoute();
        if (!walletAllowed[route.owner]) revert WalletNotAllowed();
        if (!isSupportedToken[route.inputToken]) revert UnsupportedToken();
        if (block.timestamp >= route.deadline) revert DeadlineExpired();
    }

    function _validateAuthorization(
        ExecutionRouteV1 calldata route,
        VerifierAuthorizationV1 calldata authorization,
        bytes calldata signature
    ) private view {
        if (authorization.executor != address(this) || authorization.chainId != block.chainid
            || authorization.routeCommitment != executionRouteHash(route)
            || authorization.policyHash != route.policyHash
            || authorization.snapshotHash != route.snapshotHash
            || authorization.bundleHash != route.bundleHash
            || authorization.routeHash != route.routeHash
            || authorization.simulationHash != route.simulationHash
            || authorization.constraintsHash != balanceConstraintsHash(route.constraints)
            || authorization.owner != route.owner || authorization.inputToken != route.inputToken
            || authorization.inputAmount != route.inputAmount
            || authorization.deadline != route.deadline || authorization.nonce != route.nonce) {
            revert AuthorizationMismatch();
        }
        if (ECDSA.recover(authorizationDigest(authorization), signature) != verifierSigner) {
            revert VerifierSignatureInvalid();
        }
    }

    function _consumeAccessAndCaps(ExecutionRouteV1 calldata route) private {
        if (nonceUsed[route.owner][route.nonce]) revert NonceAlreadyUsed();
        if (route.inputAmount > MAX_ROUTE_INPUT_ATOMIC) revert RouteCapExceeded();
        uint64 day = uint64(block.timestamp / 1 days);
        uint256 nextDaily = walletDailyInputAtomic[route.owner][day] + route.inputAmount;
        if (nextDaily > MAX_WALLET_DAILY_INPUT_ATOMIC) revert WalletDailyCapExceeded();
        uint256 nextCumulative = cumulativeInputAtomic + route.inputAmount;
        if (nextCumulative > MAX_CUMULATIVE_INPUT_ATOMIC) revert CumulativeCapExceeded();
        nonceUsed[route.owner][route.nonce] = true;
        walletDailyInputAtomic[route.owner][day] = nextDaily;
        cumulativeInputAtomic = nextCumulative;
    }

    function _executeStep(StepV1 calldata step) private {
        if (step.target == address(0) || step.spendAmount == 0 || step.data.length < 4
            || !isSupportedToken[step.spendToken]) revert InvalidRoute();
        bytes calldata data = step.data;
        bytes4 selector;
        assembly {
            selector := calldataload(data.offset)
        }
        if (!registry.isActive(step.adapterId, step.target, selector)) {
            revert PermissionInactive();
        }
        IERC20 spendToken = IERC20(step.spendToken);
        spendToken.forceApprove(step.target, step.spendAmount);
        (bool success,) = step.target.call(step.data);
        if (!success) revert ProtocolCallFailed();
        spendToken.forceApprove(step.target, 0);
    }

    function _constraintBalances(BalanceConstraintV1[] calldata constraints)
        private
        view
        returns (uint256[] memory balances)
    {
        balances = new uint256[](constraints.length);
        for (uint256 index; index < constraints.length; ++index) {
            BalanceConstraintV1 calldata constraint = constraints[index];
            if (!isSupportedToken[constraint.token] || constraint.account == address(0)
                || constraint.minimumIncrease == 0) revert InvalidRoute();
            balances[index] = IERC20(constraint.token).balanceOf(constraint.account);
        }
    }

    function _assertConstraints(
        BalanceConstraintV1[] calldata constraints,
        uint256[] memory beforeBalances
    ) private view {
        for (uint256 index; index < constraints.length; ++index) {
            uint256 afterBalance = IERC20(constraints[index].token).balanceOf(
                constraints[index].account
            );
            if (afterBalance < beforeBalances[index] + constraints[index].minimumIncrease) {
                revert FinalBalanceBelowMinimum();
            }
        }
    }

    function _refundSupportedTokens(address owner) private {
        for (uint256 index; index < supportedTokens.length; ++index) {
            IERC20 token = IERC20(supportedTokens[index]);
            uint256 balance = token.balanceOf(address(this));
            if (balance > 0) token.safeTransfer(owner, balance);
        }
    }
}
