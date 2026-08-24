// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {CobiaRiskManagerV2} from "../../src/CobiaRiskManagerV2.sol";

interface RiskV2Vm {
    function expectPartialRevert(bytes4 revertData) external;
    function expectRevert(bytes4 revertData) external;
    function prank(address sender) external;
    function warp(uint256 timestamp) external;
}

abstract contract RiskManagerV2TestBase {
    RiskV2Vm internal constant vm = RiskV2Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    address internal constant EXECUTOR = address(0xE0);
    address internal constant VERIFIER = address(0xA11CE);
    address internal constant NEXT_VERIFIER = address(0xB0B);
    address internal constant WALLET = address(0xCAFE);
    address internal constant OTHER = address(0xBEEF);

    CobiaRiskManagerV2 internal manager;

    function setUp() public virtual {
        manager = new CobiaRiskManagerV2(address(this), EXECUTOR, VERIFIER, 48 hours);
    }

    function _advanceDelay() internal {
        vm.warp(block.timestamp + manager.CHANGE_DELAY());
    }

    function _openAndUnpause() internal {
        manager.proposeOpenAccess();
        manager.proposeUnpause();
        _advanceDelay();
        manager.activateOpenAccess();
        manager.activateUnpause();
    }

    function _allowAndUnpause(address wallet) internal {
        manager.proposeWallet(wallet);
        manager.proposeUnpause();
        _advanceDelay();
        manager.activateWallet(wallet);
        manager.activateUnpause();
    }

    function _consume(address wallet, uint128 usdE8) internal {
        vm.prank(EXECUTOR);
        manager.consumeUsd(wallet, usdE8);
    }
}
