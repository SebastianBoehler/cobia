// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {CobiaAdapterRegistry} from "../../src/CobiaAdapterRegistry.sol";
import {CobiaExecutionTypesV4} from "../../src/CobiaExecutionTypesV4.sol";
import {CobiaExecutorV4} from "../../src/CobiaExecutorV4.sol";
import {CobiaRiskManagerV2} from "../../src/CobiaRiskManagerV2.sol";
import {ExecutorVm, MockToken} from "./ExecutorTestBase.sol";

interface ExecutorV4Vm {
    function chainId(uint256 chainId) external;
    function deal(address account, uint256 newBalance) external;
}

contract MockAdapterV4 {
    bool public failNext;

    function setFailNext(bool value) external {
        failNext = value;
    }

    function supply(MockToken input, MockToken output, address beneficiary, uint256 amount) external payable {
        if (failNext) revert("adapter failure");
        input.transferFrom(msg.sender, address(this), amount);
        output.mint(beneficiary, amount);
    }

    function supplyFromNative(MockToken output, address beneficiary, uint256 amount) external payable {
        require(msg.value == amount, "native amount");
        output.mint(beneficiary, amount);
    }

    function swapForNative(MockToken token, uint256 inputAmount, uint256 outputAmount) external {
        token.transferFrom(msg.sender, address(this), inputAmount);
        (bool success,) = msg.sender.call{value: outputAmount}("");
        require(success, "native output");
    }

    function returnNative(uint256 amount) external payable {
        require(msg.value == amount, "native amount");
        (bool success,) = msg.sender.call{value: amount}("");
        require(success, "native return");
    }

    function debitWallet(MockToken token, address owner, address recipient, uint256 amount) external {
        token.transferFrom(owner, recipient, amount);
    }

    function callExecutor(address target, bytes calldata payload) external {
        (bool success,) = target.call(payload);
        require(success, "nested execution failed");
    }
}

contract MockApprovalSpenderV4 {
    function pull(MockToken token, address owner, address recipient, uint256 amount) external {
        token.transferFrom(owner, recipient, amount);
    }
}

contract ExecutorV4Deployer {
    function deploy(address owner, CobiaAdapterRegistry registry, address verifier)
        external
        returns (CobiaExecutorV4 executor, CobiaRiskManagerV2 riskManager)
    {
        address predicted = address(uint160(uint256(keccak256(abi.encodePacked(hex"d694", address(this), hex"02")))));
        riskManager = new CobiaRiskManagerV2(owner, predicted, verifier, 48 hours);
        executor = new CobiaExecutorV4(registry, riskManager);
        require(address(executor) == predicted, "prediction");
    }
}

abstract contract ExecutorV4TestBase {
    ExecutorVm internal constant vm = ExecutorVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    ExecutorV4Vm private constant vmV4 = ExecutorV4Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    bytes32 internal constant ADAPTER_KEY = keccak256("semantic.protocol@1");
    address internal constant NATIVE_ASSET = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    uint256 internal constant VERIFIER_KEY = 0xA11CE;
    address internal constant OWNER = address(0xC0B1A);
    address internal constant THIEF = address(0xBAD);

    CobiaAdapterRegistry internal registry;
    CobiaExecutorV4 internal executor;
    CobiaRiskManagerV2 internal riskManager;
    MockToken internal input;
    MockToken internal output;
    MockAdapterV4 internal adapter;
    MockApprovalSpenderV4 internal spender;

    function setUp() public virtual {
        vmV4.chainId(196);
        vmV4.deal(OWNER, 1 ether);
        registry = new CobiaAdapterRegistry(address(this));
        input = new MockToken("RANDOM-IN");
        output = new MockToken("RANDOM-OUT");
        adapter = new MockAdapterV4();
        spender = new MockApprovalSpenderV4();
        ExecutorV4Deployer deployer = new ExecutorV4Deployer();
        (executor, riskManager) = deployer.deploy(address(this), registry, vm.addr(VERIFIER_KEY));
        riskManager.proposeWallet(OWNER);
        riskManager.proposeUnpause();
        vm.warp(block.timestamp + riskManager.CHANGE_DELAY());
        riskManager.activateWallet(OWNER);
        riskManager.activateUnpause();

        input.mint(OWNER, 100_000_000);
        vm.prank(OWNER);
        input.approve(address(executor), type(uint256).max);
    }

    function program(uint128 amount) internal view returns (CobiaExecutionTypesV4.ExecutionProgramV4 memory value) {
        CobiaExecutionTypesV4.ApprovalV4[] memory approvals = new CobiaExecutionTypesV4.ApprovalV4[](1);
        approvals[0] = CobiaExecutionTypesV4.ApprovalV4(address(input), address(adapter), amount);
        CobiaExecutionTypesV4.CallV4[] memory calls = new CobiaExecutionTypesV4.CallV4[](1);
        calls[0] = CobiaExecutionTypesV4.CallV4({
            adapterKey: ADAPTER_KEY,
            target: address(adapter),
            targetRuntimeCodeHash: address(adapter).codehash,
            value: 0,
            gasLimit: 300_000,
            approvals: approvals,
            data: abi.encodeCall(adapter.supply, (input, output, OWNER, amount))
        });
        CobiaExecutionTypesV4.BalanceConstraintV4[] memory constraints =
            new CobiaExecutionTypesV4.BalanceConstraintV4[](1);
        constraints[0] = CobiaExecutionTypesV4.BalanceConstraintV4({
            token: address(output), kind: CobiaExecutionTypesV4.ConstraintKind.Increase, minimum: amount
        });
        address[] memory refunds = new address[](2);
        refunds[0] = address(input);
        refunds[1] = address(output);
        value = CobiaExecutionTypesV4.ExecutionProgramV4({
            policyHash: keccak256("policy"),
            manifestHash: keccak256("manifest"),
            canonicalProgramHash: keccak256("program"),
            inputIdentityEvidenceHash: keccak256("input evidence"),
            outputIdentityEvidenceHash: keccak256("output evidence"),
            valuationEvidenceHash: keccak256("valuation evidence"),
            stageHash: keccak256("stage"),
            simulationHash: keccak256("simulation"),
            pinnedBlockNumber: 123,
            pinnedBlockHash: keccak256("block"),
            sourceChainId: block.chainid,
            owner: OWNER,
            inputToken: address(input),
            outputToken: address(output),
            inputAmount: amount,
            inputUsdE8: 100e8,
            deadline: uint64(block.timestamp + 300),
            nonce: keccak256(abi.encode("nonce", amount)),
            refundTokens: refunds,
            calls: calls,
            constraints: constraints
        });
    }

    function authorization(CobiaExecutionTypesV4.ExecutionProgramV4 memory value)
        internal
        view
        returns (CobiaExecutionTypesV4.VerifierAuthorizationV4 memory)
    {
        return CobiaExecutionTypesV4.VerifierAuthorizationV4({
            executor: address(executor),
            chainId: block.chainid,
            executionCommitment: executor.executionProgramHash(value),
            policyHash: value.policyHash,
            manifestHash: value.manifestHash,
            canonicalProgramHash: value.canonicalProgramHash,
            inputIdentityEvidenceHash: value.inputIdentityEvidenceHash,
            outputIdentityEvidenceHash: value.outputIdentityEvidenceHash,
            valuationEvidenceHash: value.valuationEvidenceHash,
            stageHash: value.stageHash,
            simulationHash: value.simulationHash,
            pinnedBlockNumber: value.pinnedBlockNumber,
            pinnedBlockHash: value.pinnedBlockHash,
            owner: value.owner,
            inputToken: value.inputToken,
            outputToken: value.outputToken,
            inputAmount: value.inputAmount,
            inputUsdE8: value.inputUsdE8,
            deadline: value.deadline,
            nonce: value.nonce
        });
    }

    function nativeInputProgram(uint128 amount)
        internal
        view
        returns (CobiaExecutionTypesV4.ExecutionProgramV4 memory value)
    {
        value = program(amount);
        value.inputToken = NATIVE_ASSET;
        value.calls[0].approvals = new CobiaExecutionTypesV4.ApprovalV4[](0);
        value.calls[0].value = uint96(amount);
        value.calls[0].data = abi.encodeCall(adapter.supplyFromNative, (output, OWNER, amount));
        value.refundTokens = new address[](1);
        value.refundTokens[0] = address(output);
    }

    function nativeOutputProgram(uint128 amount)
        internal
        returns (CobiaExecutionTypesV4.ExecutionProgramV4 memory value)
    {
        vmV4.deal(address(adapter), amount);
        value = program(amount);
        value.outputToken = NATIVE_ASSET;
        value.calls[0].data = abi.encodeCall(adapter.swapForNative, (input, amount, amount));
        value.constraints[0] = CobiaExecutionTypesV4.BalanceConstraintV4(
            NATIVE_ASSET, CobiaExecutionTypesV4.ConstraintKind.Increase, amount
        );
        value.refundTokens = new address[](1);
        value.refundTokens[0] = address(input);
    }

    function nativeRoundTripProgram(uint128 amount)
        internal
        view
        returns (CobiaExecutionTypesV4.ExecutionProgramV4 memory value)
    {
        value = nativeInputProgram(amount);
        value.outputToken = NATIVE_ASSET;
        value.calls[0].data = abi.encodeCall(adapter.returnNative, (amount));
        value.constraints[0] = CobiaExecutionTypesV4.BalanceConstraintV4(
            NATIVE_ASSET, CobiaExecutionTypesV4.ConstraintKind.Increase, amount
        );
        value.refundTokens = new address[](0);
    }

    function executeAsOwner(CobiaExecutionTypesV4.ExecutionProgramV4 memory value) internal {
        CobiaExecutionTypesV4.VerifierAuthorizationV4 memory auth = authorization(value);
        bytes memory signature = _sign(auth);
        vm.prank(OWNER);
        executor.execute{value: _nativeValue(value)}(value, auth, signature);
    }

    function expectOwnerRevert(bytes4 selector, CobiaExecutionTypesV4.ExecutionProgramV4 memory value) internal {
        CobiaExecutionTypesV4.VerifierAuthorizationV4 memory auth = authorization(value);
        bytes memory signature = _sign(auth);
        vm.expectRevert(selector);
        vm.prank(OWNER);
        executor.execute{value: _nativeValue(value)}(value, auth, signature);
    }

    function _sign(CobiaExecutionTypesV4.VerifierAuthorizationV4 memory auth) internal returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(VERIFIER_KEY, executor.authorizationDigest(auth));
        return abi.encodePacked(r, s, v);
    }

    function _nativeValue(CobiaExecutionTypesV4.ExecutionProgramV4 memory value) internal pure returns (uint256 total) {
        for (uint256 index; index < value.calls.length; ++index) {
            total += value.calls[index].value;
        }
    }

    function _activate(bytes4 selector) internal {
        registry.propose(ADAPTER_KEY, address(adapter), selector, address(adapter).codehash);
        vm.warp(block.timestamp + registry.ACTIVATION_DELAY());
        registry.activate(registry.permissionKey(ADAPTER_KEY, address(adapter), selector));
    }
}
