// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

contract StaticGuardTarget {
    uint256 public unsignedValue = 42;
    int256 public signedValue = -7;
    address public addressValue = address(0xBEEF);
    bool public boolValue = true;
    bytes32 public bytesValue = keccak256("cobia");

    function revertRead() external pure returns (uint256) {
        revert("read failed");
    }

    function consumeGas() external pure returns (uint256 result) {
        for (uint256 index; index < 10_000; ++index) result += index;
    }

    function shortReturn() external pure returns (uint256) {
        assembly { mstore(0, 1) return(31, 1) }
    }

    function oversizedReturn() external pure returns (uint256) {
        assembly { return(0, 4128) }
    }

    function dirtyAddress() external pure returns (address) {
        assembly { mstore(0, not(0)) return(0, 32) }
    }

    function dirtyBool() external pure returns (bool) {
        assembly { mstore(0, 2) return(0, 32) }
    }
}
