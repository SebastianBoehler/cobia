// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {CobiaExecutorV3} from "../src/CobiaExecutorV3.sol";
import {CobiaStaticGuard} from "../src/CobiaStaticGuard.sol";
import {ExecutorV3TestBase} from "./utils/ExecutorV3TestBase.sol";

contract CobiaExecutorV3Test is ExecutorV3TestBase {
    function test_executesWithBeforeAndAfterPredicates() public {
        CobiaExecutorV3.ExecutionProgramV3 memory value = program(ROUTE_CAP);
        CobiaStaticGuard.PredicateV1[] memory predicates = new CobiaStaticGuard.PredicateV1[](2);
        predicates[0] = balancePredicate(input, CobiaStaticGuard.Phase.Before, 95_000_000);
        predicates[1] = value.predicates[0];
        value.predicates = predicates;
        executeAsOwner(value);
        assert(input.balanceOf(OWNER) == 90_000_000);
        assert(receipt.balanceOf(OWNER) == ROUTE_CAP);
        assert(input.allowance(address(executor), address(protocol)) == 0);
        assert(executor.nonceUsed(OWNER, value.nonce));
    }

    function test_enforcesAbsoluteAndIncreaseBalances() public {
        receipt.mint(OWNER, 5);
        CobiaExecutorV3.ExecutionProgramV3 memory value = program(100);
        value.constraints[0] = CobiaExecutorV3.BalanceConstraintV3({
            token: address(receipt), kind: CobiaExecutorV3.ConstraintKind.Absolute, minimum: 105
        });
        executeAsOwner(value);
        assert(receipt.balanceOf(OWNER) == 105);
    }

    function test_decodesEveryPrimitiveType() public {
        CobiaExecutorV3.ExecutionProgramV3 memory value = program(1);
        CobiaStaticGuard.PredicateV1[] memory predicates = new CobiaStaticGuard.PredicateV1[](6);
        predicates[0] = staticPredicate(abi.encodeCall(reads.unsignedValue, ()), CobiaStaticGuard.DecodeType.Uint256, bytes32(uint256(42)));
        predicates[1] = staticPredicate(
            abi.encodeCall(reads.signedValue, ()), CobiaStaticGuard.DecodeType.Int256,
            bytes32(type(uint256).max - 6)
        );
        predicates[2] = staticPredicate(abi.encodeCall(reads.addressValue, ()), CobiaStaticGuard.DecodeType.Address, bytes32(uint256(uint160(address(0xBEEF)))));
        predicates[3] = staticPredicate(abi.encodeCall(reads.boolValue, ()), CobiaStaticGuard.DecodeType.Bool, bytes32(uint256(1)));
        predicates[4] = staticPredicate(abi.encodeCall(reads.bytesValue, ()), CobiaStaticGuard.DecodeType.Bytes32, keccak256("cobia"));
        predicates[5] = value.predicates[0];
        value.predicates = predicates;
        executeAsOwner(value);
    }

    function test_allowsPredicateOnlyPostcondition() public {
        CobiaExecutorV3.ExecutionProgramV3 memory value = program(1);
        value.constraints = new CobiaExecutorV3.BalanceConstraintV3[](0);
        executeAsOwner(value);
    }
}
