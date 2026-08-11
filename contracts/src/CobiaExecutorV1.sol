// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ICobiaAdapterRegistry} from "./interfaces/ICobiaAdapterRegistry.sol";
import {ICobiaExecutorV1} from "./interfaces/ICobiaExecutorV1.sol";

contract CobiaExecutorV1 is ICobiaExecutorV1, Ownable2Step, EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint128 public constant ROUTE_CAP = 10_000_000;
    uint128 public constant DAILY_WALLET_CAP = 50_000_000;
    uint128 public constant CUMULATIVE_CAP = 250_000_000;
    uint256 public constant MAX_STEPS = 4;
    uint256 public constant MAX_CONSTRAINTS = 4;
    uint256 public constant MAX_SUPPORTED_TOKENS = 8;
    uint64 public constant MAX_AUTHORIZATION_WINDOW = 5 minutes;

    bytes32 private constant STEP_TYPEHASH =
        keccak256("StepV1(bytes32 adapterId,address target,address spendToken,uint128 spendAmount,bytes32 dataHash)");
    bytes32 private constant CONSTRAINT_TYPEHASH =
        keccak256("BalanceConstraintV1(address token,address account,uint128 minimumIncrease)");
    bytes32 private constant ROUTE_TYPEHASH = keccak256(
        "ExecutionRouteV1(bytes32 policyHash,bytes32 snapshotHash,bytes32 bundleHash,bytes32 simulationHash,address owner,address inputToken,uint128 inputAmount,uint64 deadline,bytes32 nonce,bytes32 stepsHash,bytes32 constraintsHash)"
    );
    bytes32 private constant AUTHORIZATION_TYPEHASH =
        keccak256("VerifierAuthorizationV1(bytes32 routeHash,address owner,bytes32 nonce,uint64 validUntil)");

    ICobiaAdapterRegistry public immutable registry;
    address public immutable verifier;
    uint128 public cumulativeInput;
    bool public paused;

    mapping(address token => bool supported) public supportedInputTokens;
    mapping(address token => bool supported) public supportedConstraintTokens;
    mapping(address wallet => bool selected) public selectedWallets;
    mapping(address wallet => mapping(bytes32 nonce => bool used)) public usedNonces;
    mapping(address wallet => mapping(uint64 utcDay => uint128 amount)) public dailyInput;

    address[] private inputTokens;

    constructor(
        address initialOwner,
        address registryAddress,
        address verifierAddress,
        address[] memory supportedInputs,
        address[] memory supportedConstraints
    ) Ownable(initialOwner) EIP712("CobiaAtomicExecutor", "1") {
        if (
            initialOwner == address(0) || registryAddress.code.length == 0 || verifierAddress == address(0)
                || supportedInputs.length == 0 || supportedConstraints.length == 0
                || supportedInputs.length > MAX_SUPPORTED_TOKENS || supportedConstraints.length > MAX_SUPPORTED_TOKENS
        ) revert InvalidConfiguration();
        registry = ICobiaAdapterRegistry(registryAddress);
        verifier = verifierAddress;
        for (uint256 index; index < supportedInputs.length; ++index) {
            address token = supportedInputs[index];
            if (token.code.length == 0 || IERC20Metadata(token).decimals() != 6 || supportedInputTokens[token]) {
                revert InvalidConfiguration();
            }
            supportedInputTokens[token] = true;
            inputTokens.push(token);
        }
        for (uint256 index; index < supportedConstraints.length; ++index) {
            address token = supportedConstraints[index];
            if (token.code.length == 0 || IERC20Metadata(token).decimals() != 6 || supportedConstraintTokens[token]) {
                revert InvalidConfiguration();
            }
            supportedConstraintTokens[token] = true;
        }
    }

    function setSelectedWallet(address wallet, bool selected) external onlyOwner {
        if (wallet == address(0)) revert InvalidConfiguration();
        selectedWallets[wallet] = selected;
        emit SelectedWalletSet(wallet, selected);
    }

    function setPaused(bool value) external onlyOwner {
        paused = value;
        emit PausedSet(value);
    }

    function hashRoute(ExecutionRouteV1 memory route) public pure override returns (bytes32) {
        bytes32[] memory stepHashes = new bytes32[](route.steps.length);
        for (uint256 index; index < route.steps.length; ++index) {
            StepV1 memory step = route.steps[index];
            stepHashes[index] = keccak256(
                abi.encode(
                    STEP_TYPEHASH, step.adapterId, step.target, step.spendToken, step.spendAmount, keccak256(step.data)
                )
            );
        }
        bytes32[] memory constraintHashes = new bytes32[](route.constraints.length);
        for (uint256 index; index < route.constraints.length; ++index) {
            BalanceConstraintV1 memory constraint = route.constraints[index];
            constraintHashes[index] = keccak256(
                abi.encode(CONSTRAINT_TYPEHASH, constraint.token, constraint.account, constraint.minimumIncrease)
            );
        }
        return keccak256(
            abi.encode(
                ROUTE_TYPEHASH,
                route.policyHash,
                route.snapshotHash,
                route.bundleHash,
                route.simulationHash,
                route.owner,
                route.inputToken,
                route.inputAmount,
                route.deadline,
                route.nonce,
                keccak256(abi.encodePacked(stepHashes)),
                keccak256(abi.encodePacked(constraintHashes))
            )
        );
    }

    function authorizationDigest(ExecutionRouteV1 memory route, VerifierAuthorizationV1 memory authorization)
        public
        view
        override
        returns (bytes32)
    {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    AUTHORIZATION_TYPEHASH, authorization.routeHash, route.owner, route.nonce, authorization.validUntil
                )
            )
        );
    }

    function execute(
        ExecutionRouteV1 calldata route,
        VerifierAuthorizationV1 calldata authorization,
        bytes calldata signature
    ) external override nonReentrant {
        if (paused) revert ExecutionPaused();
        if (msg.sender != route.owner) revert OwnerMismatch();
        if (!selectedWallets[route.owner]) revert WalletNotSelected();
        if (block.timestamp > route.deadline || block.timestamp > authorization.validUntil) {
            revert RouteExpired();
        }
        if (
            route.inputAmount == 0 || route.inputAmount > ROUTE_CAP || route.steps.length == 0
                || route.steps.length > MAX_STEPS || route.constraints.length == 0
                || route.constraints.length > MAX_CONSTRAINTS || route.deadline != authorization.validUntil
                || route.deadline > block.timestamp + MAX_AUTHORIZATION_WINDOW || route.nonce == bytes32(0)
                || route.policyHash == bytes32(0) || route.snapshotHash == bytes32(0) || route.bundleHash == bytes32(0)
                || route.simulationHash == bytes32(0)
        ) {
            if (route.inputAmount > ROUTE_CAP) revert RouteCapExceeded();
            revert InvalidRoute();
        }
        bytes32 computedRouteHash = hashRoute(route);
        if (route.routeHash != computedRouteHash || authorization.routeHash != computedRouteHash) {
            revert InvalidRoute();
        }
        if (ECDSA.recover(authorizationDigest(route, authorization), signature) != verifier) {
            revert InvalidVerifier();
        }
        if (usedNonces[route.owner][route.nonce]) revert NonceUsed();
        if (!supportedInputTokens[route.inputToken]) revert UnsupportedAsset();

        _consumeCaps(route.owner, route.inputAmount);
        usedNonces[route.owner][route.nonce] = true;
        uint256[] memory executorBalances = _captureInputBalances();
        uint256[] memory constraintBalances = _validateAndCaptureConstraints(route);
        // msg.sender must be route.owner, so the signed route cannot debit an arbitrary third party.
        // slither-disable-next-line arbitrary-send-erc20
        IERC20(route.inputToken).safeTransferFrom(route.owner, address(this), route.inputAmount);
        _executeSteps(route.steps, executorBalances);
        _assertConstraints(route.constraints, constraintBalances);
        _refundRouteBalances(route.owner, executorBalances);
        emit RouteExecuted(route.owner, route.bundleHash, route.routeHash, route.simulationHash);
    }

    function _consumeCaps(address wallet, uint128 amount) private {
        uint64 utcDay = uint64(block.timestamp / 1 days);
        uint128 nextDaily = dailyInput[wallet][utcDay] + amount;
        if (nextDaily > DAILY_WALLET_CAP) revert DailyCapExceeded();
        uint128 nextCumulative = cumulativeInput + amount;
        if (nextCumulative > CUMULATIVE_CAP) revert CumulativeCapExceeded();
        dailyInput[wallet][utcDay] = nextDaily;
        cumulativeInput = nextCumulative;
    }

    function _captureInputBalances() private view returns (uint256[] memory balances) {
        balances = new uint256[](inputTokens.length);
        for (uint256 index; index < inputTokens.length; ++index) {
            balances[index] = IERC20(inputTokens[index]).balanceOf(address(this));
        }
    }

    function _validateAndCaptureConstraints(ExecutionRouteV1 calldata route)
        private
        view
        returns (uint256[] memory balances)
    {
        balances = new uint256[](route.constraints.length);
        for (uint256 index; index < route.constraints.length; ++index) {
            BalanceConstraintV1 calldata constraint = route.constraints[index];
            if (
                constraint.account != route.owner || constraint.minimumIncrease == 0
                    || !supportedConstraintTokens[constraint.token]
            ) revert InvalidRoute();
            balances[index] = IERC20(constraint.token).balanceOf(constraint.account);
        }
    }

    function _executeSteps(StepV1[] calldata steps, uint256[] memory startingBalances) private {
        for (uint256 index; index < steps.length; ++index) {
            StepV1 calldata step = steps[index];
            if (
                step.adapterId == bytes32(0) || step.target == address(0) || step.spendAmount == 0
                    || step.data.length < 4 || !supportedInputTokens[step.spendToken]
            ) revert InvalidRoute();
            bytes4 selector = bytes4(step.data[:4]);
            if (!registry.isActive(step.adapterId, step.target, selector)) revert PermissionDenied();
            uint256 baseline = _startingBalance(step.spendToken, startingBalances);
            // execute() is nonReentrant and this pre-call balance is not reused after the target call.
            // slither-disable-next-line reentrancy-balance
            if (IERC20(step.spendToken).balanceOf(address(this)) < baseline + step.spendAmount) {
                revert InvalidRoute();
            }
            IERC20(step.spendToken).forceApprove(step.target, step.spendAmount);
            (bool success,) = step.target.call(step.data);
            if (!success) revert ProtocolCallFailed();
            IERC20(step.spendToken).forceApprove(step.target, 0);
        }
    }

    function _assertConstraints(BalanceConstraintV1[] calldata constraints, uint256[] memory startingBalances)
        private
        view
    {
        for (uint256 index; index < constraints.length; ++index) {
            uint256 current = IERC20(constraints[index].token).balanceOf(constraints[index].account);
            if (current < startingBalances[index] + constraints[index].minimumIncrease) {
                revert ConstraintFailed();
            }
        }
    }

    function _refundRouteBalances(address ownerAddress, uint256[] memory startingBalances) private {
        for (uint256 index; index < inputTokens.length; ++index) {
            IERC20 token = IERC20(inputTokens[index]);
            uint256 current = token.balanceOf(address(this));
            if (current < startingBalances[index]) revert InvalidRoute();
            if (current > startingBalances[index]) token.safeTransfer(ownerAddress, current - startingBalances[index]);
        }
    }

    function _startingBalance(address token, uint256[] memory startingBalances) private view returns (uint256) {
        for (uint256 index; index < inputTokens.length; ++index) {
            if (inputTokens[index] == token) return startingBalances[index];
        }
        revert UnsupportedAsset();
    }
}
