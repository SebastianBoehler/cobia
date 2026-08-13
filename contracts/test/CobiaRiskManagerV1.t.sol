// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {CobiaRiskManagerV1} from "../src/CobiaRiskManagerV1.sol";

interface RiskVm {
    function expectPartialRevert(bytes4 revertData) external;
    function expectRevert(bytes4 revertData) external;
    function prank(address sender) external;
    function warp(uint256 timestamp) external;
}

contract CobiaRiskManagerV1Test {
    RiskVm private constant vm =
        RiskVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    address private constant EXECUTOR = address(0xE0);
    address private constant VERIFIER = address(0xA11CE);
    address private constant NEXT_VERIFIER = address(0xB0B);
    address private constant WALLET = address(0xCAFE);
    address private constant OTHER = address(0xBEEF);
    address private constant USDG = address(0x1000);
    address private constant USDT0 = address(0x2000);

    CobiaRiskManagerV1 private manager;

    function setUp() public {
        manager = new CobiaRiskManagerV1(address(this), EXECUTOR, VERIFIER);
    }

    function test_defaultsAreRestrictiveAndConstructorRejectsZeroAddresses() public {
        assert(manager.paused());
        assert(uint8(manager.accessMode()) == uint8(CobiaRiskManagerV1.AccessMode.Allowlist));
        assert(manager.executor() == EXECUTOR);
        assert(manager.verifierSigner() == VERIFIER);

        vm.expectPartialRevert(bytes4(keccak256("OwnableInvalidOwner(address)")));
        new CobiaRiskManagerV1(address(0), EXECUTOR, VERIFIER);
        vm.expectRevert(CobiaRiskManagerV1.InvalidConfiguration.selector);
        new CobiaRiskManagerV1(address(this), address(0), VERIFIER);
        vm.expectRevert(CobiaRiskManagerV1.InvalidConfiguration.selector);
        new CobiaRiskManagerV1(address(this), EXECUTOR, address(0));
    }

    function test_tokenActivationAndCapIncreasesRequireDelay() public {
        CobiaRiskManagerV1.Limits memory initial = _limits(100, 200, 300);
        manager.proposeToken(USDG, initial);
        vm.expectRevert(CobiaRiskManagerV1.ChangeNotReady.selector);
        manager.activateToken(USDG);

        _advanceDelay();
        manager.activateToken(USDG);
        assert(manager.tokenEnabled(USDG));
        _assertLimits(USDG, initial);

        CobiaRiskManagerV1.Limits memory increased = _limits(101, 201, 301);
        manager.proposeLimits(USDG, increased);
        vm.expectRevert(CobiaRiskManagerV1.ChangeNotReady.selector);
        manager.activateLimits(USDG);
        _advanceDelay();
        manager.activateLimits(USDG);
        _assertLimits(USDG, increased);
    }

    function test_restrictionsAreImmediateAndCannotRaiseRisk() public {
        _activateToken(USDG, _limits(100, 200, 300));
        manager.reduceLimits(USDG, _limits(50, 150, 250));
        _assertLimits(USDG, _limits(50, 150, 250));

        vm.expectRevert(CobiaRiskManagerV1.NotRiskReduction.selector);
        manager.reduceLimits(USDG, _limits(51, 150, 250));

        manager.disableToken(USDG);
        assert(!manager.tokenEnabled(USDG));
    }

    function test_walletAllowAndOpenModeRequireDelayButDenyIsImmediate() public {
        manager.proposeWallet(WALLET);
        vm.expectRevert(CobiaRiskManagerV1.ChangeNotReady.selector);
        manager.activateWallet(WALLET);
        _advanceDelay();
        manager.activateWallet(WALLET);
        assert(manager.isWalletAuthorized(WALLET));

        manager.denyWallet(WALLET);
        assert(!manager.isWalletAuthorized(WALLET));
        manager.proposeWallet(WALLET);
        vm.expectRevert(CobiaRiskManagerV1.ChangeNotReady.selector);
        manager.activateWallet(WALLET);
        _advanceDelay();
        manager.activateWallet(WALLET);
        assert(manager.isWalletAuthorized(WALLET));
        manager.removeWallet(WALLET);
        assert(!manager.isWalletAuthorized(WALLET));

        manager.proposeOpenAccess();
        vm.expectRevert(CobiaRiskManagerV1.ChangeNotReady.selector);
        manager.activateOpenAccess();
        _advanceDelay();
        manager.activateOpenAccess();
        assert(manager.isWalletAuthorized(OTHER));
        manager.setAllowlistMode();
        assert(!manager.isWalletAuthorized(OTHER));
    }

    function test_unpauseAndVerifierRotationRequireDelayWhilePauseIsImmediate() public {
        manager.proposeUnpause();
        vm.expectRevert(CobiaRiskManagerV1.ChangeNotReady.selector);
        manager.activateUnpause();
        _advanceDelay();
        manager.activateUnpause();
        assert(!manager.paused());
        manager.pause();
        assert(manager.paused());

        manager.proposeVerifier(NEXT_VERIFIER);
        vm.expectRevert(CobiaRiskManagerV1.ChangeNotReady.selector);
        manager.activateVerifier();
        _advanceDelay();
        manager.activateVerifier();
        assert(manager.verifierSigner() == NEXT_VERIFIER);
    }

    function test_onlyExecutorCanConsumeAndEveryBoundIsEnforcedPerToken() public {
        _makeExecutable(WALLET);
        _activateToken(USDG, _limits(100, 150, 220));
        _activateToken(USDT0, _limits(500, 500, 500));

        vm.expectRevert(CobiaRiskManagerV1.OnlyExecutor.selector);
        manager.consume(WALLET, USDG, 1);

        vm.prank(EXECUTOR);
        manager.consume(WALLET, USDG, 100);
        vm.prank(EXECUTOR);
        manager.consume(WALLET, USDG, 50);
        assert(manager.walletDailyInput(WALLET, USDG, uint64(block.timestamp / 1 days)) == 150);
        assert(manager.cumulativeInput(USDG) == 150);

        vm.prank(EXECUTOR);
        vm.expectRevert(CobiaRiskManagerV1.DailyCapExceeded.selector);
        manager.consume(WALLET, USDG, 1);

        vm.prank(EXECUTOR);
        manager.consume(WALLET, USDT0, 500);
        assert(manager.cumulativeInput(USDT0) == 500);

        vm.warp(block.timestamp + 1 days);
        vm.prank(EXECUTOR);
        manager.consume(WALLET, USDG, 70);
        vm.prank(EXECUTOR);
        vm.expectRevert(CobiaRiskManagerV1.CumulativeCapExceeded.selector);
        manager.consume(WALLET, USDG, 1);
    }

    function test_routeCapPauseWalletAndTokenChecksRejectConsumption() public {
        _makeExecutable(WALLET);
        _activateToken(USDG, _limits(100, 200, 300));

        vm.prank(EXECUTOR);
        vm.expectRevert(CobiaRiskManagerV1.RouteCapExceeded.selector);
        manager.consume(WALLET, USDG, 101);

        manager.denyWallet(WALLET);
        vm.prank(EXECUTOR);
        vm.expectRevert(CobiaRiskManagerV1.WalletDenied.selector);
        manager.consume(WALLET, USDG, 1);

        manager.proposeWallet(WALLET);
        _advanceDelay();
        manager.activateWallet(WALLET);
        manager.disableToken(USDG);
        vm.prank(EXECUTOR);
        vm.expectRevert(CobiaRiskManagerV1.TokenDisabled.selector);
        manager.consume(WALLET, USDG, 1);

        manager.pause();
        vm.prank(EXECUTOR);
        vm.expectRevert(CobiaRiskManagerV1.SystemPaused.selector);
        manager.consume(WALLET, USDG, 1);
    }

    function test_nonOwnerCannotChangeRiskConfiguration() public {
        vm.prank(OTHER);
        vm.expectPartialRevert(bytes4(keccak256("OwnableUnauthorizedAccount(address)")));
        manager.proposeToken(USDG, _limits(1, 1, 1));
    }

    function _makeExecutable(address wallet) private {
        manager.proposeWallet(wallet);
        manager.proposeUnpause();
        _advanceDelay();
        manager.activateWallet(wallet);
        manager.activateUnpause();
    }

    function _activateToken(address token, CobiaRiskManagerV1.Limits memory limits) private {
        manager.proposeToken(token, limits);
        _advanceDelay();
        manager.activateToken(token);
    }

    function _advanceDelay() private {
        vm.warp(block.timestamp + manager.CHANGE_DELAY());
    }

    function _limits(uint128 route, uint128 daily, uint128 cumulative)
        private
        pure
        returns (CobiaRiskManagerV1.Limits memory)
    {
        return CobiaRiskManagerV1.Limits(route, daily, cumulative);
    }

    function _assertLimits(address token, CobiaRiskManagerV1.Limits memory expected) private view {
        (uint128 route, uint128 daily, uint128 cumulative) = manager.tokenLimits(token);
        assert(route == expected.maxRoute);
        assert(daily == expected.maxWalletDaily);
        assert(cumulative == expected.maxCumulative);
    }
}
