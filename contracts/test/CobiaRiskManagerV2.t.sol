// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {CobiaRiskManagerV2} from "../src/CobiaRiskManagerV2.sol";
import {RiskManagerV2TestBase} from "./utils/RiskManagerV2TestBase.sol";

contract CobiaRiskManagerV2Test is RiskManagerV2TestBase {
    function test_zeroDelayActivatesCanaryAndOpenAccessWithoutWarp() public {
        manager = new CobiaRiskManagerV2(address(this), EXECUTOR, VERIFIER, 0);
        assert(manager.CHANGE_DELAY() == 0);

        manager.proposeWallet(WALLET);
        manager.proposeUnpause();
        manager.activateWallet(WALLET);
        manager.activateUnpause();
        assert(manager.walletAllowed(WALLET));
        assert(!manager.paused());

        manager.proposeOpenAccess();
        manager.activateOpenAccess();
        assert(uint8(manager.accessMode()) == uint8(CobiaRiskManagerV2.AccessMode.Open));
    }

    function test_defaultsAreRestrictiveAndLaunchCapsAreUsdE8() public view {
        assert(manager.paused());
        assert(uint8(manager.accessMode()) == uint8(CobiaRiskManagerV2.AccessMode.Allowlist));
        assert(manager.executor() == EXECUTOR);
        assert(manager.verifierSigner() == VERIFIER);
        (uint128 route, uint128 wallet, uint128 protocol) = manager.limits();
        assert(route == 1_000e8);
        assert(wallet == 5_000e8);
        assert(protocol == 50_000e8);
    }

    function test_constructorRejectsZeroConfiguration() public {
        vm.expectPartialRevert(bytes4(keccak256("OwnableInvalidOwner(address)")));
        new CobiaRiskManagerV2(address(0), EXECUTOR, VERIFIER, 48 hours);
        vm.expectRevert(CobiaRiskManagerV2.InvalidConfiguration.selector);
        new CobiaRiskManagerV2(address(this), address(0), VERIFIER, 48 hours);
        vm.expectRevert(CobiaRiskManagerV2.InvalidConfiguration.selector);
        new CobiaRiskManagerV2(address(this), EXECUTOR, address(0), 48 hours);
    }

    function test_arbitraryAssetsNeedNoRiskManagerRegistration() public {
        _allowAndUnpause(WALLET);
        _consume(WALLET, 1_000e8);
        assert(manager.walletRollingUsdE8(WALLET) == 1_000e8);
        assert(manager.protocolRollingUsdE8() == 1_000e8);
    }

    function test_onlyExecutorAndRouteCapAreEnforced() public {
        _allowAndUnpause(WALLET);
        vm.expectRevert(CobiaRiskManagerV2.OnlyExecutor.selector);
        manager.consumeUsd(WALLET, 1);

        vm.prank(EXECUTOR);
        vm.expectRevert(CobiaRiskManagerV2.RouteCapExceeded.selector);
        manager.consumeUsd(WALLET, 1_000e8 + 1);
        _consume(WALLET, 1_000e8);
    }

    function test_walletRollingCapAndHourlyExpiryDoNotCreateLifetimeCap() public {
        _openAndUnpause();
        for (uint256 index; index < 5; ++index) _consume(WALLET, 1_000e8);
        vm.prank(EXECUTOR);
        vm.expectRevert(CobiaRiskManagerV2.WalletCapExceeded.selector);
        manager.consumeUsd(WALLET, 1);

        vm.warp(block.timestamp + 23 hours);
        vm.prank(EXECUTOR);
        vm.expectRevert(CobiaRiskManagerV2.WalletCapExceeded.selector);
        manager.consumeUsd(WALLET, 1);

        vm.warp(block.timestamp + 1 hours);
        _consume(WALLET, 1_000e8);
        assert(manager.walletRollingUsdE8(WALLET) == 1_000e8);

        for (uint256 window; window < 3; ++window) {
            vm.warp(block.timestamp + 24 hours);
            _consume(WALLET, 1_000e8);
        }
    }

    function test_protocolRollingCapSpansWallets() public {
        _openAndUnpause();
        for (uint160 walletIndex = 1; walletIndex <= 10; ++walletIndex) {
            for (uint256 route; route < 5; ++route) _consume(address(walletIndex), 1_000e8);
        }
        assert(manager.protocolRollingUsdE8() == 50_000e8);
        vm.prank(EXECUTOR);
        vm.expectRevert(CobiaRiskManagerV2.ProtocolCapExceeded.selector);
        manager.consumeUsd(address(11), 1);
    }

    function test_capIncreasesWaitButReductionsAndEmergencyControlsAreImmediate() public {
        CobiaRiskManagerV2.Limits memory increased = CobiaRiskManagerV2.Limits(1_001e8, 5_001e8, 50_001e8);
        manager.proposeLimits(increased);
        vm.expectRevert(CobiaRiskManagerV2.ChangeNotReady.selector);
        manager.activateLimits();
        _advanceDelay();
        manager.activateLimits();

        CobiaRiskManagerV2.Limits memory reduced = CobiaRiskManagerV2.Limits(500e8, 2_500e8, 25_000e8);
        manager.reduceLimits(reduced);
        (uint128 route, uint128 wallet, uint128 protocol) = manager.limits();
        assert(route == reduced.maxRouteUsdE8 && wallet == reduced.maxWallet24hUsdE8);
        assert(protocol == reduced.maxProtocol24hUsdE8);

        manager.denyWallet(WALLET);
        assert(!manager.isWalletAuthorized(WALLET));
        manager.pause();
        assert(manager.paused());
    }

    function test_pauseAndDenyImmediatelyStopAnOpenSystem() public {
        _openAndUnpause();
        manager.denyWallet(WALLET);
        vm.prank(EXECUTOR);
        vm.expectRevert(CobiaRiskManagerV2.WalletDenied.selector);
        manager.consumeUsd(WALLET, 1);

        manager.pause();
        vm.prank(EXECUTOR);
        vm.expectRevert(CobiaRiskManagerV2.SystemPaused.selector);
        manager.consumeUsd(OTHER, 1);
    }

    function test_nonOwnerCannotChangeRiskConfiguration() public {
        vm.prank(OTHER);
        vm.expectPartialRevert(bytes4(keccak256("OwnableUnauthorizedAccount(address)")));
        manager.proposeLimits(CobiaRiskManagerV2.Limits(1, 1, 1));
    }

    function test_verifierRotationRequiresDelay() public {
        manager.proposeVerifier(NEXT_VERIFIER);
        vm.expectRevert(CobiaRiskManagerV2.ChangeNotReady.selector);
        manager.activateVerifier();
        _advanceDelay();
        manager.activateVerifier();
        assert(manager.verifierSigner() == NEXT_VERIFIER);
    }
}
