// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface ICobiaExecutorV1 {
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
        bytes32 routeHash;
        uint64 validUntil;
    }

    error ConstraintFailed();
    error CumulativeCapExceeded();
    error DailyCapExceeded();
    error ExecutionPaused();
    error InvalidConfiguration();
    error InvalidRoute();
    error InvalidVerifier();
    error NonceUsed();
    error OwnerMismatch();
    error PermissionDenied();
    error ProtocolCallFailed();
    error RouteCapExceeded();
    error RouteExpired();
    error UnsupportedAsset();
    error WalletNotSelected();

    event PausedSet(bool paused);
    event RouteExecuted(
        address indexed owner, bytes32 indexed bundleHash, bytes32 indexed routeHash, bytes32 simulationHash
    );
    event SelectedWalletSet(address indexed wallet, bool selected);

    function authorizationDigest(ExecutionRouteV1 memory route, VerifierAuthorizationV1 memory authorization)
        external
        view
        returns (bytes32);

    function execute(
        ExecutionRouteV1 calldata route,
        VerifierAuthorizationV1 calldata authorization,
        bytes calldata signature
    ) external;

    function hashRoute(ExecutionRouteV1 memory route) external pure returns (bytes32);
}
