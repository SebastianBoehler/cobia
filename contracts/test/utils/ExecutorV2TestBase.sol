// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {CobiaAdapterRegistry} from "../../src/CobiaAdapterRegistry.sol";
import {CobiaExecutorV2} from "../../src/CobiaExecutorV2.sol";
import {CobiaRiskManagerV1} from "../../src/CobiaRiskManagerV1.sol";
import {ExecutorVm, MockProtocol, MockToken} from "./ExecutorTestBase.sol";

contract ExecutorV2Deployer {
    function deploy(address owner, CobiaAdapterRegistry registry, address verifier)
        external
        returns (CobiaExecutorV2 executor, CobiaRiskManagerV1 riskManager)
    {
        address predictedExecutor =
            address(uint160(uint256(keccak256(abi.encodePacked(hex"d694", address(this), hex"02")))));
        riskManager = new CobiaRiskManagerV1(owner, predictedExecutor, verifier);
        executor = new CobiaExecutorV2(registry, riskManager);
        require(address(executor) == predictedExecutor, "prediction");
    }
}

abstract contract ExecutorV2TestBase {
    ExecutorVm internal constant vm = ExecutorVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    bytes32 internal constant CAPABILITY_KEY = keccak256("research.protocol.action@7");
    uint256 internal constant VERIFIER_KEY = 0xA11CE;
    uint128 internal constant ROUTE_CAP = 10_000_000;
    address internal constant OWNER = address(0xC0B1A);

    CobiaAdapterRegistry internal registry;
    CobiaExecutorV2 internal executor;
    CobiaRiskManagerV1 internal riskManager;
    MockToken internal input;
    MockToken internal receipt;
    MockProtocol internal protocol;

    function setUp() public virtual {
        registry = new CobiaAdapterRegistry(address(this));
        input = new MockToken("USDG");
        receipt = new MockToken("OUTPUT");
        protocol = new MockProtocol();
        _activateCapability(CAPABILITY_KEY, protocol.supply.selector);

        ExecutorV2Deployer deployer = new ExecutorV2Deployer();
        (executor, riskManager) = deployer.deploy(address(this), registry, vm.addr(VERIFIER_KEY));
        _configureRisk();
        input.mint(OWNER, 100_000_000);
        vm.prank(OWNER);
        input.approve(address(executor), type(uint256).max);
    }

    function program(uint128 amount) internal view returns (CobiaExecutorV2.ExecutionProgramV2 memory value) {
        CobiaExecutorV2.ApprovalV2[] memory approvals = new CobiaExecutorV2.ApprovalV2[](1);
        approvals[0] = CobiaExecutorV2.ApprovalV2(address(input), amount);
        CobiaExecutorV2.ActionV2[] memory actions = new CobiaExecutorV2.ActionV2[](1);
        actions[0] = CobiaExecutorV2.ActionV2({
            capabilityKey: CAPABILITY_KEY,
            target: address(protocol),
            approvals: approvals,
            data: abi.encodeCall(protocol.supply, (input, receipt, OWNER, amount))
        });
        CobiaExecutorV2.BalanceConstraintV2[] memory constraints = new CobiaExecutorV2.BalanceConstraintV2[](1);
        constraints[0] = CobiaExecutorV2.BalanceConstraintV2(address(receipt), amount);
        address[] memory refundTokens = new address[](2);
        refundTokens[0] = address(input);
        refundTokens[1] = address(receipt);
        value = CobiaExecutorV2.ExecutionProgramV2({
            policyHash: keccak256("policy"),
            manifestHash: keccak256("manifest"),
            canonicalProgramHash: keccak256("canonical program"),
            simulationHash: keccak256("simulation"),
            pinnedBlockNumber: 123,
            pinnedBlockHash: keccak256("block"),
            owner: OWNER,
            inputToken: address(input),
            inputAmount: amount,
            deadline: uint64(block.timestamp + 300),
            nonce: keccak256(abi.encode("nonce", amount)),
            refundTokens: refundTokens,
            actions: actions,
            constraints: constraints
        });
    }

    function authorization(CobiaExecutorV2.ExecutionProgramV2 memory value)
        internal
        view
        returns (CobiaExecutorV2.VerifierAuthorizationV2 memory)
    {
        return CobiaExecutorV2.VerifierAuthorizationV2({
            executor: address(executor),
            chainId: block.chainid,
            executionCommitment: executor.executionProgramHash(value),
            policyHash: value.policyHash,
            manifestHash: value.manifestHash,
            canonicalProgramHash: value.canonicalProgramHash,
            simulationHash: value.simulationHash,
            pinnedBlockNumber: value.pinnedBlockNumber,
            pinnedBlockHash: value.pinnedBlockHash,
            owner: value.owner,
            inputToken: value.inputToken,
            inputAmount: value.inputAmount,
            deadline: value.deadline,
            nonce: value.nonce
        });
    }

    function sign(CobiaExecutorV2.VerifierAuthorizationV2 memory value) internal returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(VERIFIER_KEY, executor.authorizationDigest(value));
        return abi.encodePacked(r, s, v);
    }

    function executeAsOwner(
        CobiaExecutorV2.ExecutionProgramV2 memory value,
        CobiaExecutorV2.VerifierAuthorizationV2 memory auth
    ) internal {
        bytes memory signature = sign(auth);
        vm.prank(OWNER);
        executor.execute(value, auth, signature);
    }

    function expectOwnerRevert(
        bytes4 selector,
        CobiaExecutorV2.ExecutionProgramV2 memory value,
        CobiaExecutorV2.VerifierAuthorizationV2 memory auth
    ) internal {
        bytes memory signature = sign(auth);
        vm.expectRevert(selector);
        vm.prank(OWNER);
        executor.execute(value, auth, signature);
    }

    function _activateCapability(bytes32 key, bytes4 selector) internal {
        registry.propose(key, address(protocol), selector, address(protocol).codehash);
        vm.warp(block.timestamp + registry.ACTIVATION_DELAY());
        registry.activate(registry.permissionKey(key, address(protocol), selector));
    }

    function _configureRisk() private {
        riskManager.proposeWallet(OWNER);
        riskManager.proposeToken(address(input), CobiaRiskManagerV1.Limits(ROUTE_CAP, ROUTE_CAP * 2, ROUTE_CAP * 3));
        riskManager.proposeUnpause();
        vm.warp(block.timestamp + riskManager.CHANGE_DELAY());
        riskManager.activateWallet(OWNER);
        riskManager.activateToken(address(input));
        riskManager.activateUnpause();
    }
}
