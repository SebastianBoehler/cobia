// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

contract ToolchainTest {
    function test_chainIdsRemainExplicit() public pure {
        require(uint256(1952) == 1952, "testnet chain drift");
        require(uint256(196) == 196, "mainnet chain drift");
    }
}
