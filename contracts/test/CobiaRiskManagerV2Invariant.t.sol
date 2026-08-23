// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {CobiaRiskManagerV2} from "../src/CobiaRiskManagerV2.sol";
import {RiskManagerV2TestBase} from "./utils/RiskManagerV2TestBase.sol";

contract CobiaRiskManagerV2InvariantTest is RiskManagerV2TestBase {
    function testFuzz_riskIncreasesNeverActivateBeforeDelay(uint32 elapsed) public {
        manager.proposeLimits(CobiaRiskManagerV2.Limits(1_001e8, 5_001e8, 50_001e8));
        manager.proposeVerifier(NEXT_VERIFIER);
        manager.proposeOpenAccess();
        manager.proposeUnpause();
        vm.warp(block.timestamp + uint256(elapsed) % manager.CHANGE_DELAY());

        vm.expectRevert(CobiaRiskManagerV2.ChangeNotReady.selector);
        manager.activateLimits();
        vm.expectRevert(CobiaRiskManagerV2.ChangeNotReady.selector);
        manager.activateVerifier();
        vm.expectRevert(CobiaRiskManagerV2.ChangeNotReady.selector);
        manager.activateOpenAccess();
        vm.expectRevert(CobiaRiskManagerV2.ChangeNotReady.selector);
        manager.activateUnpause();
    }

    function testFuzz_consumptionCannotCrossRouteOrWalletCaps(uint96 rawAmount) public {
        _openAndUnpause();
        uint128 amount = uint128(uint256(rawAmount) % (1_000e8) + 1);
        _consume(WALLET, amount);
        for (uint256 route; route < 4; ++route) _consume(WALLET, 1_000e8);
        assert(manager.walletRollingUsdE8(WALLET) == 4_000e8 + amount);

        uint128 excess = uint128(1_000e8 - amount + 1);
        vm.prank(EXECUTOR);
        vm.expectRevert(CobiaRiskManagerV2.WalletCapExceeded.selector);
        manager.consumeUsd(WALLET, excess);
        assert(manager.walletRollingUsdE8(WALLET) == 4_000e8 + amount);

        vm.prank(EXECUTOR);
        vm.expectRevert(CobiaRiskManagerV2.RouteCapExceeded.selector);
        manager.consumeUsd(OTHER, 1_000e8 + 1);
    }
}
