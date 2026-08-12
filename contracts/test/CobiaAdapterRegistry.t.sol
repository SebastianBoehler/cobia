// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {CobiaAdapterRegistry} from "../src/CobiaAdapterRegistry.sol";

interface Vm {
    function etch(address target, bytes calldata code) external;
    function expectPartialRevert(bytes4 revertData) external;
    function expectRevert(bytes4 revertData) external;
    function prank(address sender) external;
    function warp(uint256 timestamp) external;
}

contract RegistryTarget {
    function ping() external pure returns (bytes4) {
        return this.ping.selector;
    }
}

contract CobiaAdapterRegistryTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    bytes32 private constant AAVE_ID = keccak256("aave-v3@1");
    address private constant OTHER = address(0xBEEF);

    CobiaAdapterRegistry private registry;
    RegistryTarget private target;

    function setUp() public {
        registry = new CobiaAdapterRegistry(address(this));
        target = new RegistryTarget();
    }

    function test_permissionKeyBindsEveryTupleMember() public view {
        bytes32 key = registry.permissionKey(AAVE_ID, address(target), target.ping.selector);
        assert(key != registry.permissionKey(keccak256("uniswap-v3@1"), address(target), target.ping.selector));
        assert(key != registry.permissionKey(AAVE_ID, OTHER, target.ping.selector));
        assert(key != registry.permissionKey(AAVE_ID, address(target), bytes4(0x12345678)));
    }

    function test_activationRequiresTheFixedDelay() public {
        bytes32 key = _propose();
        vm.expectRevert(CobiaAdapterRegistry.ActivationNotReady.selector);
        registry.activate(key);
        vm.warp(block.timestamp + 48 hours);
        registry.activate(key);
        assert(registry.isActive(AAVE_ID, address(target), target.ping.selector));
    }

    function test_nonOwnerCannotPropose() public {
        vm.prank(OTHER);
        vm.expectPartialRevert(bytes4(keccak256("OwnableUnauthorizedAccount(address)")));
        registry.propose(AAVE_ID, address(target), target.ping.selector, address(target).codehash);
    }

    function test_revokeIsImmediate() public {
        bytes32 key = _activate();
        registry.revoke(key);
        assert(!registry.isActive(AAVE_ID, address(target), target.ping.selector));
    }

    function test_codeChangeInvalidatesAnActivePermission() public {
        _activate();
        vm.etch(address(target), hex"00");
        assert(!registry.isActive(AAVE_ID, address(target), target.ping.selector));
    }

    function test_codeChangeBeforeActivationIsRejected() public {
        bytes32 key = _propose();
        vm.etch(address(target), hex"00");
        vm.warp(block.timestamp + 48 hours);
        vm.expectRevert(CobiaAdapterRegistry.RuntimeCodeHashMismatch.selector);
        registry.activate(key);
    }

    function test_pauseDisablesEveryPermission() public {
        _activate();
        registry.setPaused(true);
        assert(!registry.isActive(AAVE_ID, address(target), target.ping.selector));
        registry.setPaused(false);
        assert(registry.isActive(AAVE_ID, address(target), target.ping.selector));
    }

    function test_zeroTargetAndSelectorAreRejected() public {
        vm.expectRevert(CobiaAdapterRegistry.InvalidPermission.selector);
        registry.propose(AAVE_ID, address(0), target.ping.selector, bytes32(uint256(1)));
        vm.expectRevert(CobiaAdapterRegistry.InvalidPermission.selector);
        registry.propose(AAVE_ID, address(target), bytes4(0), address(target).codehash);
    }

    function _propose() private returns (bytes32 key) {
        key = registry.permissionKey(AAVE_ID, address(target), target.ping.selector);
        registry.propose(AAVE_ID, address(target), target.ping.selector, address(target).codehash);
    }

    function _activate() private returns (bytes32 key) {
        key = _propose();
        vm.warp(block.timestamp + 48 hours);
        registry.activate(key);
    }
}
