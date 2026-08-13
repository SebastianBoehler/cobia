// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

contract CobiaRiskManagerV1 is Ownable2Step {
    uint64 public constant CHANGE_DELAY = 48 hours;

    enum AccessMode {
        Allowlist,
        Open
    }

    struct Limits {
        uint128 maxRoute;
        uint128 maxWalletDaily;
        uint128 maxCumulative;
    }

    struct PendingLimits {
        Limits limits;
        uint64 activateAfter;
    }

    error ChangeNotReady();
    error CumulativeCapExceeded();
    error DailyCapExceeded();
    error InvalidConfiguration();
    error NoPendingChange();
    error NotRiskReduction();
    error OnlyExecutor();
    error RouteCapExceeded();
    error SystemPaused();
    error TokenDisabled();
    error WalletDenied();
    error WalletNotAllowed();

    event AccessModeChanged(AccessMode mode);
    event LimitsActivated(address indexed token, Limits limits);
    event LimitsProposed(address indexed token, Limits limits, uint64 activateAfter);
    event PausedChanged(bool paused);
    event TokenActivated(address indexed token, Limits limits);
    event TokenDisabledEvent(address indexed token);
    event TokenProposed(address indexed token, Limits limits, uint64 activateAfter);
    event UsageConsumed(address indexed wallet, address indexed token, uint128 amount);
    event VerifierActivated(address indexed verifier);
    event VerifierProposed(address indexed verifier, uint64 activateAfter);
    event WalletAllowProposed(address indexed wallet, uint64 activateAfter);
    event WalletAllowChanged(address indexed wallet, bool allowed);
    event WalletDenyChanged(address indexed wallet, bool denied);

    address public immutable executor;
    address public verifierSigner;
    bool public paused = true;
    AccessMode public accessMode = AccessMode.Allowlist;

    mapping(address wallet => bool allowed) public walletAllowed;
    mapping(address wallet => bool denied) public walletDenied;
    mapping(address wallet => uint64 activateAfter) public walletAllowAfter;
    mapping(address token => bool enabled) public tokenEnabled;
    mapping(address token => Limits limits) public tokenLimits;
    mapping(address token => PendingLimits pending) public pendingToken;
    mapping(address token => PendingLimits pending) public pendingLimits;
    mapping(address wallet => mapping(address token => mapping(uint64 day => uint256 amount)))
        public walletDailyInput;
    mapping(address token => uint256 amount) public cumulativeInput;

    uint64 public openAccessAfter;
    uint64 public unpauseAfter;
    uint64 public verifierActivateAfter;
    address public pendingVerifier;

    constructor(address initialOwner, address executor_, address verifier_) Ownable(initialOwner) {
        if (initialOwner == address(0) || executor_ == address(0) || verifier_ == address(0)) {
            revert InvalidConfiguration();
        }
        executor = executor_;
        verifierSigner = verifier_;
    }

    function proposeWallet(address wallet) external onlyOwner {
        if (wallet == address(0)) revert InvalidConfiguration();
        uint64 activateAfter = _activationTime();
        walletAllowAfter[wallet] = activateAfter;
        emit WalletAllowProposed(wallet, activateAfter);
    }

    function activateWallet(address wallet) external onlyOwner {
        _requireReady(walletAllowAfter[wallet]);
        delete walletAllowAfter[wallet];
        walletAllowed[wallet] = true;
        walletDenied[wallet] = false;
        emit WalletAllowChanged(wallet, true);
        emit WalletDenyChanged(wallet, false);
    }

    function removeWallet(address wallet) external onlyOwner {
        delete walletAllowAfter[wallet];
        walletAllowed[wallet] = false;
        emit WalletAllowChanged(wallet, false);
    }

    function denyWallet(address wallet) external onlyOwner {
        walletDenied[wallet] = true;
        emit WalletDenyChanged(wallet, true);
    }

    function proposeToken(address token, Limits calldata limits) external onlyOwner {
        _validateTokenAndLimits(token, limits);
        uint64 activateAfter = _activationTime();
        pendingToken[token] = PendingLimits(limits, activateAfter);
        emit TokenProposed(token, limits, activateAfter);
    }

    function activateToken(address token) external onlyOwner {
        PendingLimits memory pending = pendingToken[token];
        _requireReady(pending.activateAfter);
        delete pendingToken[token];
        tokenLimits[token] = pending.limits;
        tokenEnabled[token] = true;
        emit TokenActivated(token, pending.limits);
    }

    function disableToken(address token) external onlyOwner {
        tokenEnabled[token] = false;
        delete pendingToken[token];
        emit TokenDisabledEvent(token);
    }

    function proposeLimits(address token, Limits calldata limits) external onlyOwner {
        _validateTokenAndLimits(token, limits);
        if (!tokenEnabled[token]) revert TokenDisabled();
        uint64 activateAfter = _activationTime();
        pendingLimits[token] = PendingLimits(limits, activateAfter);
        emit LimitsProposed(token, limits, activateAfter);
    }

    function activateLimits(address token) external onlyOwner {
        PendingLimits memory pending = pendingLimits[token];
        _requireReady(pending.activateAfter);
        delete pendingLimits[token];
        tokenLimits[token] = pending.limits;
        emit LimitsActivated(token, pending.limits);
    }

    function reduceLimits(address token, Limits calldata limits) external onlyOwner {
        _validateTokenAndLimits(token, limits);
        Limits memory current = tokenLimits[token];
        if (limits.maxRoute > current.maxRoute || limits.maxWalletDaily > current.maxWalletDaily
            || limits.maxCumulative > current.maxCumulative) revert NotRiskReduction();
        delete pendingLimits[token];
        tokenLimits[token] = limits;
        emit LimitsActivated(token, limits);
    }

    function proposeVerifier(address verifier) external onlyOwner {
        if (verifier == address(0)) revert InvalidConfiguration();
        pendingVerifier = verifier;
        verifierActivateAfter = _activationTime();
        emit VerifierProposed(verifier, verifierActivateAfter);
    }

    function activateVerifier() external onlyOwner {
        _requireReady(verifierActivateAfter);
        verifierSigner = pendingVerifier;
        delete pendingVerifier;
        delete verifierActivateAfter;
        emit VerifierActivated(verifierSigner);
    }

    function proposeOpenAccess() external onlyOwner {
        openAccessAfter = _activationTime();
    }

    function activateOpenAccess() external onlyOwner {
        _requireReady(openAccessAfter);
        delete openAccessAfter;
        accessMode = AccessMode.Open;
        emit AccessModeChanged(AccessMode.Open);
    }

    function setAllowlistMode() external onlyOwner {
        delete openAccessAfter;
        accessMode = AccessMode.Allowlist;
        emit AccessModeChanged(AccessMode.Allowlist);
    }

    function proposeUnpause() external onlyOwner {
        unpauseAfter = _activationTime();
    }

    function activateUnpause() external onlyOwner {
        _requireReady(unpauseAfter);
        delete unpauseAfter;
        paused = false;
        emit PausedChanged(false);
    }

    function pause() external onlyOwner {
        delete unpauseAfter;
        paused = true;
        emit PausedChanged(true);
    }

    function isWalletAuthorized(address wallet) public view returns (bool) {
        if (walletDenied[wallet]) return false;
        return accessMode == AccessMode.Open || walletAllowed[wallet];
    }

    function consume(address wallet, address token, uint128 amount) external {
        if (msg.sender != executor) revert OnlyExecutor();
        if (paused) revert SystemPaused();
        if (walletDenied[wallet]) revert WalletDenied();
        if (!isWalletAuthorized(wallet)) revert WalletNotAllowed();
        if (!tokenEnabled[token]) revert TokenDisabled();

        Limits memory limits = tokenLimits[token];
        if (amount > limits.maxRoute) revert RouteCapExceeded();
        uint64 day = uint64(block.timestamp / 1 days);
        uint256 nextDaily = walletDailyInput[wallet][token][day] + amount;
        if (nextDaily > limits.maxWalletDaily) revert DailyCapExceeded();
        uint256 nextCumulative = cumulativeInput[token] + amount;
        if (nextCumulative > limits.maxCumulative) revert CumulativeCapExceeded();

        walletDailyInput[wallet][token][day] = nextDaily;
        cumulativeInput[token] = nextCumulative;
        emit UsageConsumed(wallet, token, amount);
    }

    function _activationTime() private view returns (uint64) {
        return uint64(block.timestamp + CHANGE_DELAY);
    }

    function _requireReady(uint64 activateAfter) private view {
        if (activateAfter == 0) revert NoPendingChange();
        if (block.timestamp < activateAfter) revert ChangeNotReady();
    }

    function _validateTokenAndLimits(address token, Limits calldata limits) private pure {
        if (token == address(0) || limits.maxRoute == 0 || limits.maxWalletDaily == 0
            || limits.maxCumulative == 0 || limits.maxRoute > limits.maxWalletDaily
            || limits.maxWalletDaily > limits.maxCumulative) revert InvalidConfiguration();
    }
}
