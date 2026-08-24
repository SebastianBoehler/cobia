// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

contract CobiaRiskManagerV2 is Ownable2Step {
    uint64 public immutable CHANGE_DELAY;
    uint8 private constant WINDOW_BUCKETS = 24;

    enum AccessMode {
        Allowlist,
        Open
    }

    struct Limits {
        uint128 maxRouteUsdE8;
        uint128 maxWallet24hUsdE8;
        uint128 maxProtocol24hUsdE8;
    }

    struct PendingLimits {
        Limits values;
        uint64 activateAfter;
    }

    struct HourBucket {
        uint64 hour;
        uint128 exposureUsdE8;
    }

    error ChangeNotReady();
    error InvalidConfiguration();
    error NoPendingChange();
    error NotRiskReduction();
    error OnlyExecutor();
    error ProtocolCapExceeded();
    error RouteCapExceeded();
    error SystemPaused();
    error WalletCapExceeded();
    error WalletDenied();
    error WalletNotAllowed();

    event AccessModeChanged(AccessMode mode);
    event LimitsActivated(Limits limits);
    event LimitsProposed(Limits limits, uint64 activateAfter);
    event PausedChanged(bool paused);
    event UsageConsumed(address indexed wallet, uint128 exposureUsdE8, uint64 hour);
    event VerifierActivated(address indexed verifier);
    event VerifierProposed(address indexed verifier, uint64 activateAfter);
    event WalletAllowChanged(address indexed wallet, bool allowed);
    event WalletAllowProposed(address indexed wallet, uint64 activateAfter);
    event WalletDenyChanged(address indexed wallet, bool denied);

    address public immutable executor;
    address public verifierSigner;
    Limits public limits = Limits(1_000e8, 5_000e8, 50_000e8);
    PendingLimits public pendingLimits;
    bool public paused = true;
    AccessMode public accessMode = AccessMode.Allowlist;

    mapping(address wallet => bool allowed) public walletAllowed;
    mapping(address wallet => bool denied) public walletDenied;
    mapping(address wallet => uint64 activateAfter) public walletAllowAfter;
    mapping(address wallet => mapping(uint8 slot => HourBucket bucket)) private walletHourly;
    mapping(uint8 slot => HourBucket bucket) private protocolHourly;

    uint64 public openAccessAfter;
    uint64 public unpauseAfter;
    uint64 public verifierActivateAfter;
    address public pendingVerifier;

    constructor(address initialOwner, address executor_, address verifier_, uint64 changeDelay_) Ownable(initialOwner) {
        if (executor_ == address(0) || verifier_ == address(0)) revert InvalidConfiguration();
        executor = executor_;
        verifierSigner = verifier_;
        CHANGE_DELAY = changeDelay_;
    }

    function proposeLimits(Limits calldata proposed) external onlyOwner {
        _validateLimits(proposed);
        uint64 activateAfter = _activationTime();
        pendingLimits = PendingLimits(proposed, activateAfter);
        emit LimitsProposed(proposed, activateAfter);
    }

    function activateLimits() external onlyOwner {
        PendingLimits memory pending = pendingLimits;
        _requireReady(pending.activateAfter);
        delete pendingLimits;
        limits = pending.values;
        emit LimitsActivated(pending.values);
    }

    function reduceLimits(Limits calldata reduced) external onlyOwner {
        _validateLimits(reduced);
        Limits memory current = limits;
        if (
            reduced.maxRouteUsdE8 > current.maxRouteUsdE8
                || reduced.maxWallet24hUsdE8 > current.maxWallet24hUsdE8
                || reduced.maxProtocol24hUsdE8 > current.maxProtocol24hUsdE8
        ) revert NotRiskReduction();
        delete pendingLimits;
        limits = reduced;
        emit LimitsActivated(reduced);
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

    function walletRollingUsdE8(address wallet) public view returns (uint256) {
        return _rollingWallet(wallet, uint64(block.timestamp / 1 hours));
    }

    function protocolRollingUsdE8() public view returns (uint256) {
        return _rollingProtocol(uint64(block.timestamp / 1 hours));
    }

    function consumeUsd(address wallet, uint128 exposureUsdE8) external {
        if (msg.sender != executor) revert OnlyExecutor();
        if (paused) revert SystemPaused();
        if (wallet == address(0) || exposureUsdE8 == 0) revert InvalidConfiguration();
        if (walletDenied[wallet]) revert WalletDenied();
        if (!isWalletAuthorized(wallet)) revert WalletNotAllowed();

        Limits memory active = limits;
        if (exposureUsdE8 > active.maxRouteUsdE8) revert RouteCapExceeded();
        uint64 hour = uint64(block.timestamp / 1 hours);
        if (_rollingWallet(wallet, hour) + exposureUsdE8 > active.maxWallet24hUsdE8) {
            revert WalletCapExceeded();
        }
        if (_rollingProtocol(hour) + exposureUsdE8 > active.maxProtocol24hUsdE8) {
            revert ProtocolCapExceeded();
        }
        _recordWallet(wallet, hour, exposureUsdE8);
        _recordProtocol(hour, exposureUsdE8);
        emit UsageConsumed(wallet, exposureUsdE8, hour);
    }

    function _rollingWallet(address wallet, uint64 hour) private view returns (uint256 total) {
        for (uint8 slot; slot < WINDOW_BUCKETS; ++slot) {
            HourBucket memory bucket = walletHourly[wallet][slot];
            if (bucket.hour <= hour && hour - bucket.hour < WINDOW_BUCKETS) total += bucket.exposureUsdE8;
        }
    }

    function _rollingProtocol(uint64 hour) private view returns (uint256 total) {
        for (uint8 slot; slot < WINDOW_BUCKETS; ++slot) {
            HourBucket memory bucket = protocolHourly[slot];
            if (bucket.hour <= hour && hour - bucket.hour < WINDOW_BUCKETS) total += bucket.exposureUsdE8;
        }
    }

    function _recordWallet(address wallet, uint64 hour, uint128 exposure) private {
        uint8 slot = uint8(hour % WINDOW_BUCKETS);
        HourBucket storage bucket = walletHourly[wallet][slot];
        if (bucket.hour != hour) bucket.exposureUsdE8 = 0;
        bucket.hour = hour;
        bucket.exposureUsdE8 += exposure;
    }

    function _recordProtocol(uint64 hour, uint128 exposure) private {
        uint8 slot = uint8(hour % WINDOW_BUCKETS);
        HourBucket storage bucket = protocolHourly[slot];
        if (bucket.hour != hour) bucket.exposureUsdE8 = 0;
        bucket.hour = hour;
        bucket.exposureUsdE8 += exposure;
    }

    function _activationTime() private view returns (uint64) {
        return uint64(block.timestamp + CHANGE_DELAY);
    }

    function _requireReady(uint64 activateAfter) private view {
        if (activateAfter == 0) revert NoPendingChange();
        if (block.timestamp < activateAfter) revert ChangeNotReady();
    }

    function _validateLimits(Limits calldata proposed) private pure {
        if (
            proposed.maxRouteUsdE8 == 0 || proposed.maxWallet24hUsdE8 == 0 || proposed.maxProtocol24hUsdE8 == 0
                || proposed.maxRouteUsdE8 > proposed.maxWallet24hUsdE8
                || proposed.maxWallet24hUsdE8 > proposed.maxProtocol24hUsdE8
        ) revert InvalidConfiguration();
    }
}
