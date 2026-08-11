// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {CobiaAdapterRegistry} from "../src/CobiaAdapterRegistry.sol";

interface Vm {
    function assume(bool condition) external;
    function expectRevert(bytes4 selector) external;
    function expectRevert(bytes calldata reason) external;
    function prank(address sender) external;
    function warp(uint256 timestamp) external;
}

contract RegistryTarget {
    function act() external pure returns (bytes32) {
        return keccak256("acted");
    }
}

contract CobiaAdapterRegistryTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    bytes32 private constant AAVE_ID = keccak256("aave-v3@1");
    address private constant ATTACKER = address(0xBAD);
    address private constant NEXT_OWNER = address(0xBEEF);

    CobiaAdapterRegistry private registry;
    RegistryTarget private target;

    function setUp() public {
        registry = new CobiaAdapterRegistry(address(this));
        target = new RegistryTarget();
    }

    function test_permissionActivatesOnlyAfterExactDelay() public {
        bytes32 key = _propose(address(target).codehash);
        vm.expectRevert(CobiaAdapterRegistry.ActivationPending.selector);
        registry.activate(key);

        vm.warp(block.timestamp + 48 hours);
        registry.activate(key);
        require(registry.isActive(AAVE_ID, address(target), target.act.selector), "not active");
    }

    function test_nonOwnerCannotProposeOrActivate() public {
        vm.prank(ATTACKER);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, ATTACKER));
        registry.propose(AAVE_ID, address(target), target.act.selector, address(target).codehash);

        bytes32 key = _propose(address(target).codehash);
        vm.warp(block.timestamp + 48 hours);
        vm.prank(ATTACKER);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, ATTACKER));
        registry.activate(key);
    }

    function test_runtimeHashMismatchNeverBecomesUsable() public {
        bytes32 key = _propose(bytes32(uint256(1)));
        vm.warp(block.timestamp + 48 hours);
        registry.activate(key);
        require(!registry.isActive(AAVE_ID, address(target), target.act.selector), "hash bypass");
    }

    function test_revokeAndPauseAreImmediate() public {
        bytes32 key = _activePermission();
        registry.setPaused(true);
        require(!registry.isActive(AAVE_ID, address(target), target.act.selector), "pause bypass");
        registry.setPaused(false);
        registry.revoke(key);
        require(!registry.isActive(AAVE_ID, address(target), target.act.selector), "revoke bypass");
    }

    function test_twoStepOwnershipControlsRegistry() public {
        registry.transferOwnership(NEXT_OWNER);
        vm.prank(NEXT_OWNER);
        registry.acceptOwnership();
        require(registry.owner() == NEXT_OWNER, "owner mismatch");
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(this)));
        registry.setPaused(true);
    }

    function test_rejectsEmptyPermissionFields() public {
        vm.expectRevert(CobiaAdapterRegistry.InvalidPermission.selector);
        registry.propose(bytes32(0), address(target), target.act.selector, address(target).codehash);
        vm.expectRevert(CobiaAdapterRegistry.InvalidPermission.selector);
        registry.propose(AAVE_ID, address(0), target.act.selector, address(target).codehash);
        vm.expectRevert(CobiaAdapterRegistry.InvalidPermission.selector);
        registry.propose(AAVE_ID, address(target), bytes4(0), address(target).codehash);
        vm.expectRevert(CobiaAdapterRegistry.InvalidPermission.selector);
        registry.propose(AAVE_ID, address(target), target.act.selector, bytes32(0));
    }

    function testFuzz_permissionKeyCommitsEveryField(bytes32 adapterId, address permissionTarget, bytes4 selector)
        public
    {
        bytes32 baseline = registry.permissionKey(AAVE_ID, address(target), target.act.selector);
        vm.assume(adapterId != AAVE_ID || permissionTarget != address(target) || selector != target.act.selector);
        bytes32 mutated = registry.permissionKey(adapterId, permissionTarget, selector);
        require(baseline != mutated, "permission key collision");
    }

    function _propose(bytes32 runtimeHash) private returns (bytes32) {
        return registry.propose(AAVE_ID, address(target), target.act.selector, runtimeHash);
    }

    function _activePermission() private returns (bytes32 key) {
        key = _propose(address(target).codehash);
        vm.warp(block.timestamp + 48 hours);
        registry.activate(key);
    }
}
