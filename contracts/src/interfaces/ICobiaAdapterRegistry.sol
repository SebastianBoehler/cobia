// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface ICobiaAdapterRegistry {
    function isActive(bytes32 adapterId, address target, bytes4 selector) external view returns (bool);
}
