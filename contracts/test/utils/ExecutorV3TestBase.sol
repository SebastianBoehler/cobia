// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {CobiaAdapterRegistry} from "../../src/CobiaAdapterRegistry.sol";
import {CobiaExecutorV3} from "../../src/CobiaExecutorV3.sol";
import {CobiaRiskManagerV1} from "../../src/CobiaRiskManagerV1.sol";
import {CobiaStaticGuard} from "../../src/CobiaStaticGuard.sol";
import {ExecutorVm, MockProtocol, MockToken} from "./ExecutorTestBase.sol";
import {StaticGuardTarget} from "./StaticGuardTarget.sol";

contract ExecutorV3Deployer {
    function deploy(address owner, CobiaAdapterRegistry registry, address verifier)
        external returns (CobiaExecutorV3 executor, CobiaRiskManagerV1 riskManager)
    {
        address predicted = address(uint160(uint256(keccak256(abi.encodePacked(hex"d694", address(this), hex"02")))));
        riskManager = new CobiaRiskManagerV1(owner, predicted, verifier);
        executor = new CobiaExecutorV3(registry, riskManager);
        require(address(executor) == predicted, "prediction");
    }
}

abstract contract ExecutorV3TestBase {
    ExecutorVm internal constant vm = ExecutorVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    bytes32 internal constant CAPABILITY_KEY = keccak256("research.protocol.action@7");
    uint256 internal constant VERIFIER_KEY = 0xA11CE;
    uint128 internal constant ROUTE_CAP = 10_000_000;
    address internal constant OWNER = address(0xC0B1A);

    CobiaAdapterRegistry internal registry;
    CobiaExecutorV3 internal executor;
    CobiaRiskManagerV1 internal riskManager;
    MockToken internal input;
    MockToken internal receipt;
    MockProtocol internal protocol;
    StaticGuardTarget internal reads;

    function setUp() public virtual {
        registry = new CobiaAdapterRegistry(address(this));
        input = new MockToken("USDG");
        receipt = new MockToken("OUTPUT");
        protocol = new MockProtocol();
        reads = new StaticGuardTarget();
        _activateCapability(CAPABILITY_KEY, protocol.supply.selector);
        ExecutorV3Deployer deployer = new ExecutorV3Deployer();
        (executor, riskManager) = deployer.deploy(address(this), registry, vm.addr(VERIFIER_KEY));
        _configureRisk();
        input.mint(OWNER, 100_000_000);
        vm.prank(OWNER);
        input.approve(address(executor), type(uint256).max);
    }

    function program(uint128 amount) internal view returns (CobiaExecutorV3.ExecutionProgramV3 memory value) {
        CobiaExecutorV3.ApprovalV3[] memory approvals = new CobiaExecutorV3.ApprovalV3[](1);
        approvals[0] = CobiaExecutorV3.ApprovalV3(address(input), amount);
        CobiaExecutorV3.ActionV3[] memory actions = new CobiaExecutorV3.ActionV3[](1);
        actions[0] = CobiaExecutorV3.ActionV3({
            capabilityKey: CAPABILITY_KEY,
            target: address(protocol),
            approvals: approvals,
            data: abi.encodeCall(protocol.supply, (input, receipt, OWNER, amount))
        });
        CobiaExecutorV3.BalanceConstraintV3[] memory constraints = new CobiaExecutorV3.BalanceConstraintV3[](1);
        constraints[0] = CobiaExecutorV3.BalanceConstraintV3({
            token: address(receipt), kind: CobiaExecutorV3.ConstraintKind.Increase, minimum: amount
        });
        CobiaStaticGuard.PredicateV1[] memory predicates = new CobiaStaticGuard.PredicateV1[](1);
        predicates[0] = balancePredicate(receipt, CobiaStaticGuard.Phase.After, amount);
        address[] memory refunds = new address[](2);
        refunds[0] = address(input);
        refunds[1] = address(receipt);
        value = CobiaExecutorV3.ExecutionProgramV3({
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
            refundTokens: refunds,
            actions: actions,
            constraints: constraints,
            predicates: predicates
        });
    }

    function balancePredicate(MockToken token, CobiaStaticGuard.Phase phase, uint256 bound)
        internal view returns (CobiaStaticGuard.PredicateV1 memory)
    {
        return CobiaStaticGuard.PredicateV1({
            read: CobiaStaticGuard.ReadV1({
                target: address(token), runtimeCodeHash: address(token).codehash,
                data: abi.encodeCall(token.balanceOf, (OWNER)), returnWordIndex: 0,
                decodeType: CobiaStaticGuard.DecodeType.Uint256, gasLimit: 50_000
            }),
            phase: phase,
            comparator: CobiaStaticGuard.Comparator.Gte,
            bound: bytes32(bound)
        });
    }

    function authorization(CobiaExecutorV3.ExecutionProgramV3 memory value)
        internal view returns (CobiaExecutorV3.VerifierAuthorizationV3 memory)
    {
        return CobiaExecutorV3.VerifierAuthorizationV3({
            executor: address(executor), chainId: block.chainid,
            executionCommitment: executor.executionProgramHash(value), policyHash: value.policyHash,
            manifestHash: value.manifestHash, canonicalProgramHash: value.canonicalProgramHash,
            simulationHash: value.simulationHash, pinnedBlockNumber: value.pinnedBlockNumber,
            pinnedBlockHash: value.pinnedBlockHash, owner: value.owner, inputToken: value.inputToken,
            inputAmount: value.inputAmount, deadline: value.deadline, nonce: value.nonce
        });
    }

    function executeAsOwner(CobiaExecutorV3.ExecutionProgramV3 memory value) internal {
        CobiaExecutorV3.VerifierAuthorizationV3 memory auth = authorization(value);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(VERIFIER_KEY, executor.authorizationDigest(auth));
        vm.prank(OWNER);
        executor.execute(value, auth, abi.encodePacked(r, s, v));
    }

    function expectOwnerRevert(bytes4 selector, CobiaExecutorV3.ExecutionProgramV3 memory value) internal {
        CobiaExecutorV3.VerifierAuthorizationV3 memory auth = authorization(value);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(VERIFIER_KEY, executor.authorizationDigest(auth));
        vm.expectRevert(selector);
        vm.prank(OWNER);
        executor.execute(value, auth, abi.encodePacked(r, s, v));
    }

    function staticPredicate(bytes memory data, CobiaStaticGuard.DecodeType decodeType, bytes32 bound)
        internal view returns (CobiaStaticGuard.PredicateV1 memory)
    {
        return CobiaStaticGuard.PredicateV1({
            read: CobiaStaticGuard.ReadV1({
                target: address(reads), runtimeCodeHash: address(reads).codehash, data: data,
                returnWordIndex: 0, decodeType: decodeType, gasLimit: 50_000
            }), phase: CobiaStaticGuard.Phase.Before,
            comparator: CobiaStaticGuard.Comparator.Eq, bound: bound
        });
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
