// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

contract CobiaAdapterRegistry is Ownable2Step {
    uint64 public constant ACTIVATION_DELAY = 48 hours;

    struct Permission {
        bytes32 runtimeCodeHash;
        address target;
        uint64 activateAfter;
        bool active;
    }

    error ActivationNotReady();
    error InvalidPermission();
    error RuntimeCodeHashMismatch();
    error UnknownPermission();

    event PermissionActivated(bytes32 indexed key);
    event PermissionProposed(
        bytes32 indexed key,
        bytes32 indexed adapterId,
        address indexed target,
        bytes4 selector,
        bytes32 runtimeCodeHash,
        uint64 activateAfter
    );
    event PermissionRevoked(bytes32 indexed key);
    event RegistryPauseChanged(bool paused);

    mapping(bytes32 key => Permission permission) public permissions;
    bool public paused;

    constructor(address initialOwner) Ownable(initialOwner) {}

    function permissionKey(bytes32 adapterId, address target, bytes4 selector)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(adapterId, target, selector));
    }

    function propose(
        bytes32 adapterId,
        address target,
        bytes4 selector,
        bytes32 runtimeCodeHash
    ) external onlyOwner returns (bytes32 key) {
        if (adapterId == bytes32(0) || target == address(0) || selector == bytes4(0)
            || runtimeCodeHash == bytes32(0)) {
            revert InvalidPermission();
        }
        key = permissionKey(adapterId, target, selector);
        uint64 activateAfter = uint64(block.timestamp + ACTIVATION_DELAY);
        permissions[key] = Permission(runtimeCodeHash, target, activateAfter, false);
        emit PermissionProposed(
            key,
            adapterId,
            target,
            selector,
            runtimeCodeHash,
            activateAfter
        );
    }

    function activate(bytes32 key) external onlyOwner {
        Permission storage permission = permissions[key];
        if (permission.activateAfter == 0) revert UnknownPermission();
        if (block.timestamp < permission.activateAfter) revert ActivationNotReady();
        if (permission.target.codehash != permission.runtimeCodeHash) {
            revert RuntimeCodeHashMismatch();
        }
        permission.active = true;
        emit PermissionActivated(key);
    }

    function revoke(bytes32 key) external onlyOwner {
        if (permissions[key].activateAfter == 0) revert UnknownPermission();
        delete permissions[key];
        emit PermissionRevoked(key);
    }

    function setPaused(bool nextPaused) external onlyOwner {
        paused = nextPaused;
        emit RegistryPauseChanged(nextPaused);
    }

    function isActive(bytes32 adapterId, address target, bytes4 selector)
        external
        view
        returns (bool)
    {
        bytes32 key = permissionKey(adapterId, target, selector);
        Permission memory permission = permissions[key];
        return !paused && permission.active && target.codehash == permission.runtimeCodeHash;
    }
}
