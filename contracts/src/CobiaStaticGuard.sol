// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

library CobiaStaticGuard {
    uint256 internal constant MAX_READ_GAS = 250_000;
    uint256 internal constant MAX_RETURN_BYTES = 4_096;

    enum Phase { Before, After }
    enum DecodeType { Uint256, Int256, Address, Bool, Bytes32 }
    enum Comparator { Eq, Gte, Lte }

    struct ReadV1 {
        address target;
        bytes32 runtimeCodeHash;
        bytes data;
        uint16 returnWordIndex;
        DecodeType decodeType;
        uint32 gasLimit;
    }

    struct PredicateV1 {
        ReadV1 read;
        Phase phase;
        Comparator comparator;
        bytes32 bound;
    }

    error PredicateFalse();
    error StaticCallFailed();
    error StaticCodeMismatch();
    error StaticReadInvalid();
    error StaticReturnInvalid();

    function validate(PredicateV1 calldata predicate) internal pure {
        ReadV1 calldata read = predicate.read;
        if (
            read.target == address(0) || read.runtimeCodeHash == bytes32(0) || read.data.length < 4
                || read.gasLimit == 0 || read.gasLimit > MAX_READ_GAS
        ) revert StaticReadInvalid();
        if (read.decodeType > DecodeType.Int256 && predicate.comparator != Comparator.Eq) {
            revert StaticReadInvalid();
        }
        _validatePrimitive(read.decodeType, predicate.bound);
    }

    function evaluate(PredicateV1 calldata predicate) internal view returns (bytes32 word) {
        ReadV1 calldata read = predicate.read;
        if (read.target.code.length == 0 || read.target.codehash != read.runtimeCodeHash) {
            revert StaticCodeMismatch();
        }
        bytes memory data = read.data;
        bool success;
        uint256 returned;
        uint256 gasLimit = read.gasLimit;
        address target = read.target;
        assembly {
            success := staticcall(gasLimit, target, add(data, 32), mload(data), 0, 0)
            returned := returndatasize()
        }
        if (!success) revert StaticCallFailed();
        uint256 offset = uint256(read.returnWordIndex) * 32;
        if (returned < 32 || returned > MAX_RETURN_BYTES || returned % 32 != 0 || offset + 32 > returned) {
            revert StaticReturnInvalid();
        }
        assembly {
            returndatacopy(0, offset, 32)
            word := mload(0)
        }
        _validatePrimitive(read.decodeType, word);
        if (!_satisfies(read.decodeType, predicate.comparator, word, predicate.bound)) {
            revert PredicateFalse();
        }
    }

    function _validatePrimitive(DecodeType decodeType, bytes32 word) private pure {
        if (decodeType == DecodeType.Address && uint256(word) >> 160 != 0) {
            revert StaticReturnInvalid();
        }
        if (decodeType == DecodeType.Bool && uint256(word) > 1) {
            revert StaticReturnInvalid();
        }
    }

    function _satisfies(DecodeType decodeType, Comparator comparator, bytes32 left, bytes32 right)
        private pure returns (bool)
    {
        if (comparator == Comparator.Eq) return left == right;
        if (decodeType == DecodeType.Uint256) {
            return comparator == Comparator.Gte ? uint256(left) >= uint256(right) : uint256(left) <= uint256(right);
        }
        if (decodeType == DecodeType.Int256) {
            return comparator == Comparator.Gte
                ? int256(uint256(left)) >= int256(uint256(right))
                : int256(uint256(left)) <= int256(uint256(right));
        }
        revert StaticReadInvalid();
    }
}
