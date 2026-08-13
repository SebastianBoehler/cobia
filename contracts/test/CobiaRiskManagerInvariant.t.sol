// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {CobiaRiskManagerV1} from "../src/CobiaRiskManagerV1.sol";

interface RiskInvariantVm {
    function expectRevert(bytes4 revertData) external;
    function prank(address sender) external;
    function warp(uint256 timestamp) external;
}

contract CobiaRiskManagerInvariantTest {
    RiskInvariantVm private constant vm = RiskInvariantVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address private constant EXECUTOR = address(0xE0);
    address private constant WALLET = address(0xCAFE);
    address private constant TOKEN = address(0x1000);

    CobiaRiskManagerV1 private manager;

    function setUp() public {
        manager = new CobiaRiskManagerV1(address(this), EXECUTOR, address(0xA11CE));
    }

    function testFuzz_riskIncreasesNeverActivateBeforeDelay(uint32 elapsed) public {
        manager.proposeWallet(WALLET);
        manager.proposeToken(TOKEN, CobiaRiskManagerV1.Limits(10, 20, 30));
        manager.proposeUnpause();
        uint256 bounded = uint256(elapsed) % manager.CHANGE_DELAY();
        vm.warp(block.timestamp + bounded);

        vm.expectRevert(CobiaRiskManagerV1.ChangeNotReady.selector);
        manager.activateWallet(WALLET);
        vm.expectRevert(CobiaRiskManagerV1.ChangeNotReady.selector);
        manager.activateToken(TOKEN);
        vm.expectRevert(CobiaRiskManagerV1.ChangeNotReady.selector);
        manager.activateUnpause();
    }

    function testFuzz_consumptionNeverCrossesAnyConfiguredCap(uint8 firstRaw) public {
        manager.proposeWallet(WALLET);
        manager.proposeToken(TOKEN, CobiaRiskManagerV1.Limits(10, 15, 20));
        manager.proposeUnpause();
        vm.warp(block.timestamp + manager.CHANGE_DELAY());
        manager.activateWallet(WALLET);
        manager.activateToken(TOKEN);
        manager.activateUnpause();

        uint128 first = uint128(uint256(firstRaw) % 5 + 6);
        vm.prank(EXECUTOR);
        manager.consume(WALLET, TOKEN, first);
        uint128 excess = uint128(16 - first);
        vm.prank(EXECUTOR);
        vm.expectRevert(CobiaRiskManagerV1.DailyCapExceeded.selector);
        manager.consume(WALLET, TOKEN, excess);
        assert(manager.cumulativeInput(TOKEN) == first);
    }
}
