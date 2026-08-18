// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {CobiaExecutorV3} from "../src/CobiaExecutorV3.sol";
import {CobiaStaticGuard} from "../src/CobiaStaticGuard.sol";
import {ExecutorV3TestBase} from "./utils/ExecutorV3TestBase.sol";

contract CobiaExecutorV3SecurityTest is ExecutorV3TestBase {
    function test_rejectsWrongCallerSignerAndChangedCommitment() public {
        CobiaExecutorV3.ExecutionProgramV3 memory value = program(1);
        CobiaExecutorV3.VerifierAuthorizationV3 memory auth = authorization(value);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(VERIFIER_KEY, executor.authorizationDigest(auth));
        vm.expectRevert(CobiaExecutorV3.InvalidProgram.selector);
        executor.execute(value, auth, abi.encodePacked(r, s, v));

        auth.canonicalProgramHash = keccak256("changed");
        (v, r, s) = vm.sign(VERIFIER_KEY, executor.authorizationDigest(auth));
        vm.expectRevert(CobiaExecutorV3.AuthorizationMismatch.selector);
        vm.prank(OWNER);
        executor.execute(value, auth, abi.encodePacked(r, s, v));

        auth = authorization(value);
        (v, r, s) = vm.sign(0xBADC0DE, executor.authorizationDigest(auth));
        vm.expectRevert(CobiaExecutorV3.VerifierSignatureInvalid.selector);
        vm.prank(OWNER);
        executor.execute(value, auth, abi.encodePacked(r, s, v));
    }

    function test_falseAfterPredicateRollsBackFundsNonceAndBudget() public {
        CobiaExecutorV3.ExecutionProgramV3 memory value = program(100);
        value.predicates[0].bound = bytes32(uint256(101));
        expectOwnerRevert(CobiaStaticGuard.PredicateFalse.selector, value);
        assert(input.balanceOf(OWNER) == 100_000_000);
        assert(!executor.nonceUsed(OWNER, value.nonce));
        assert(riskManager.cumulativeInput(address(input)) == 0);
    }

    function test_rejectsCodeDriftRevertGasShortOversizedAndDirtyWords() public {
        CobiaExecutorV3.ExecutionProgramV3 memory value = program(1);
        value.predicates[0] = staticPredicate(abi.encodeCall(reads.unsignedValue, ()), CobiaStaticGuard.DecodeType.Uint256, bytes32(uint256(42)));
        vm.etch(address(reads), hex"00");
        expectOwnerRevert(CobiaStaticGuard.StaticCodeMismatch.selector, value);

        setUp();
        value = program(2);
        value.predicates[0] = staticPredicate(abi.encodeCall(reads.revertRead, ()), CobiaStaticGuard.DecodeType.Uint256, bytes32(0));
        expectOwnerRevert(CobiaStaticGuard.StaticCallFailed.selector, value);

        value = program(3);
        value.predicates[0] = staticPredicate(abi.encodeCall(reads.consumeGas, ()), CobiaStaticGuard.DecodeType.Uint256, bytes32(0));
        value.predicates[0].read.gasLimit = 1_000;
        expectOwnerRevert(CobiaStaticGuard.StaticCallFailed.selector, value);

        value = program(4);
        value.predicates[0] = staticPredicate(
            abi.encodeCall(reads.shortReturn, ()), CobiaStaticGuard.DecodeType.Uint256, bytes32(uint256(1))
        );
        expectOwnerRevert(CobiaStaticGuard.StaticReturnInvalid.selector, value);

        value = program(5);
        value.predicates[0] = staticPredicate(abi.encodeCall(reads.oversizedReturn, ()), CobiaStaticGuard.DecodeType.Uint256, bytes32(0));
        expectOwnerRevert(CobiaStaticGuard.StaticReturnInvalid.selector, value);

        value = program(6);
        value.predicates[0] = staticPredicate(abi.encodeCall(reads.dirtyAddress, ()), CobiaStaticGuard.DecodeType.Address, bytes32(0));
        expectOwnerRevert(CobiaStaticGuard.StaticReturnInvalid.selector, value);

        value = program(7);
        value.predicates[0] = staticPredicate(abi.encodeCall(reads.dirtyBool, ()), CobiaStaticGuard.DecodeType.Bool, bytes32(0));
        expectOwnerRevert(CobiaStaticGuard.StaticReturnInvalid.selector, value);
    }

    function test_rejectsDuplicatesAndAggregatePredicateLimits() public {
        CobiaExecutorV3.ExecutionProgramV3 memory value = program(1);
        CobiaStaticGuard.PredicateV1[] memory duplicate = new CobiaStaticGuard.PredicateV1[](2);
        duplicate[0] = value.predicates[0];
        duplicate[1] = value.predicates[0];
        value.predicates = duplicate;
        expectOwnerRevert(CobiaExecutorV3.InvalidProgram.selector, value);

        value = program(2);
        value.predicates[0].read.gasLimit = 250_001;
        expectOwnerRevert(CobiaExecutorV3.InvalidProgram.selector, value);
    }

    function test_preservesAuthorizationReplayRegistryAndProtocolFailureGuards() public {
        CobiaExecutorV3.ExecutionProgramV3 memory value = program(1);
        CobiaExecutorV3.VerifierAuthorizationV3 memory auth = authorization(value);
        auth.chainId += 1;
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(VERIFIER_KEY, executor.authorizationDigest(auth));
        vm.expectRevert(CobiaExecutorV3.AuthorizationMismatch.selector);
        vm.prank(OWNER);
        executor.execute(value, auth, abi.encodePacked(r, s, v));

        executeAsOwner(value);
        expectOwnerRevert(CobiaExecutorV3.NonceAlreadyUsed.selector, value);

        value = program(2);
        value.actions[0].capabilityKey = keccak256("inactive@1");
        expectOwnerRevert(CobiaExecutorV3.PermissionInactive.selector, value);

        value = program(3);
        protocol.setFailNext(true);
        expectOwnerRevert(CobiaExecutorV3.ProtocolCallFailed.selector, value);
        assert(input.balanceOf(OWNER) == 99_999_999);
    }

    function test_reentrantProgramCannotConsumeEitherNonce() public {
        _activateCapability(CAPABILITY_KEY, protocol.callExecutor.selector);
        CobiaExecutorV3.ExecutionProgramV3 memory nested = program(1);
        nested.nonce = keccak256("nested");
        CobiaExecutorV3.VerifierAuthorizationV3 memory nestedAuth = authorization(nested);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(VERIFIER_KEY, executor.authorizationDigest(nestedAuth));

        CobiaExecutorV3.ExecutionProgramV3 memory outer = program(2);
        outer.nonce = keccak256("outer");
        outer.actions[0].approvals = new CobiaExecutorV3.ApprovalV3[](0);
        outer.actions[0].data = abi.encodeCall(
            protocol.callExecutor,
            (address(executor), abi.encodeCall(executor.execute, (nested, nestedAuth, abi.encodePacked(r, s, v))))
        );
        expectOwnerRevert(CobiaExecutorV3.ProtocolCallFailed.selector, outer);
        assert(!executor.nonceUsed(OWNER, nested.nonce));
        assert(!executor.nonceUsed(OWNER, outer.nonce));
    }
}
