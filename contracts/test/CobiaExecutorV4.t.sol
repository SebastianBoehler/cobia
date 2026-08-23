// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {CobiaExecutionTypesV4} from "../src/CobiaExecutionTypesV4.sol";
import {CobiaExecutorV4} from "../src/CobiaExecutorV4.sol";
import {ExecutorV4TestBase} from "./utils/ExecutorV4TestBase.sol";

contract CobiaExecutorV4Test is ExecutorV4TestBase {
    function test_executesAnyVerifiedTokenPairThroughARegisteredAdapter() public {
        CobiaExecutionTypesV4.ExecutionProgramV4 memory value = program(1_000_000);
        executeAsOwner(value);

        assert(input.balanceOf(OWNER) == 99_000_000);
        assert(output.balanceOf(OWNER) == 1_000_000);
        assert(input.balanceOf(address(executor)) == 0);
        assert(output.balanceOf(address(executor)) == 0);
        assert(input.allowance(address(executor), address(adapter)) == 0);
        assert(executor.nonceUsed(OWNER, value.nonce));
        assert(riskManager.walletRollingUsdE8(OWNER) == value.inputUsdE8);
    }

    function test_approvesAndCleansTheExactVerifierAuthorizedSpender() public {
        _activate(adapter.callExecutor.selector);
        CobiaExecutionTypesV4.ExecutionProgramV4 memory value = program(1_000_000);
        value.calls[0].approvals[0].spender = address(spender);
        value.calls[0].data = abi.encodeCall(
            adapter.callExecutor,
            (address(spender), abi.encodeCall(spender.pull, (input, address(executor), address(adapter), 1_000_000)))
        );
        output.mint(OWNER, 1);
        value.constraints[0] = CobiaExecutionTypesV4.BalanceConstraintV4(
            address(output), CobiaExecutionTypesV4.ConstraintKind.Absolute, 1
        );
        executeAsOwner(value);

        assert(input.balanceOf(address(adapter)) == 1_000_000);
        assert(input.allowance(address(executor), address(spender)) == 0);
        assert(input.allowance(address(executor), address(adapter)) == 0);
    }

    function test_nativeValueAndGasArePartOfTheExactRegisteredCall() public {
        CobiaExecutionTypesV4.ExecutionProgramV4 memory value = program(1);
        value.calls[0].value = 1;
        executeAsOwner(value);
        assert(address(executor).balance == 0);
        assert(address(adapter).balance == 1);
    }

    function test_executionAndAuthorizationPayloadHashesMatchFrozenTypeScriptVectors() public view {
        CobiaExecutionTypesV4.ExecutionProgramV4 memory value = _interopProgram();
        CobiaExecutionTypesV4.VerifierAuthorizationV4 memory auth = _interopAuthorization(value);
        assert(
            executor.executionProgramHash(value) == 0x12ba65e0c6f546afcee3930a8d32de483c1e468b2b0507e81287bb10ed22910f
        );
        assert(
            executor.authorizationPayloadHash(auth)
                == 0xad0e54c9297e926a6a499b7c0f242996f379586e94f7317fe53483a693eee94f
        );
    }

    function _interopProgram() private pure returns (CobiaExecutionTypesV4.ExecutionProgramV4 memory value) {
        address[] memory refunds = new address[](2);
        refunds[0] = address(0x2222222222222222222222222222222222222222);
        refunds[1] = address(0x4444444444444444444444444444444444444444);
        CobiaExecutionTypesV4.ApprovalV4[] memory approvals = new CobiaExecutionTypesV4.ApprovalV4[](1);
        approvals[0] = CobiaExecutionTypesV4.ApprovalV4(
            refunds[0], address(0x7777777777777777777777777777777777777777), 1_000_000
        );
        CobiaExecutionTypesV4.CallV4[] memory calls = new CobiaExecutionTypesV4.CallV4[](1);
        calls[0] = CobiaExecutionTypesV4.CallV4(
            bytes32(uint256(type(uint256).max) / 0xff * 0xbb),
            address(0x3333333333333333333333333333333333333333),
            123,
            300_000,
            approvals,
            hex"12345678"
        );
        CobiaExecutionTypesV4.BalanceConstraintV4[] memory constraints =
            new CobiaExecutionTypesV4.BalanceConstraintV4[](1);
        constraints[0] = CobiaExecutionTypesV4.BalanceConstraintV4(
            refunds[1], CobiaExecutionTypesV4.ConstraintKind.Increase, 990_000
        );
        value = CobiaExecutionTypesV4.ExecutionProgramV4({
            policyHash: _repeat(0x11),
            manifestHash: _repeat(0x22),
            canonicalProgramHash: _repeat(0x33),
            inputIdentityEvidenceHash: _repeat(0x44),
            outputIdentityEvidenceHash: _repeat(0x55),
            valuationEvidenceHash: _repeat(0x66),
            stageHash: _repeat(0x77),
            simulationHash: _repeat(0x88),
            pinnedBlockNumber: 12_345,
            pinnedBlockHash: _repeat(0x99),
            sourceChainId: 196,
            owner: address(0x1111111111111111111111111111111111111111),
            inputToken: refunds[0],
            outputToken: refunds[1],
            inputAmount: 1_000_000,
            inputUsdE8: 100_000_000,
            deadline: 1_900_000_000,
            nonce: _repeat(0xaa),
            refundTokens: refunds,
            calls: calls,
            constraints: constraints
        });
    }

    function _interopAuthorization(CobiaExecutionTypesV4.ExecutionProgramV4 memory value)
        private
        view
        returns (CobiaExecutionTypesV4.VerifierAuthorizationV4 memory auth)
    {
        auth = authorization(value);
        auth.executor = address(0x5555555555555555555555555555555555555555);
        auth.chainId = 196;
    }

    function _repeat(uint8 value) private pure returns (bytes32 result) {
        result = bytes32(uint256(type(uint256).max) / 0xff * value);
    }
}
