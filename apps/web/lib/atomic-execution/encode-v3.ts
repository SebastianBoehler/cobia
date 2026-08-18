import { encodeFunctionData, getAddress, parseAbi, type Address, type Hex } from "viem";
import { buildAtomicAuthorizationV3 } from "./authorization-v3";
import {
  atomicAuthorizationPayloadHashV3,
  type AtomicAuthorizationV3,
  type AtomicExecutionProgramV3,
} from "./types-v3";

export const COBIA_EXECUTOR_V3_ABI = parseAbi([
  "struct ApprovalV3 { address token; uint128 amount; }",
  "struct ActionV3 { bytes32 capabilityKey; address target; ApprovalV3[] approvals; bytes data; }",
  "struct BalanceConstraintV3 { address token; uint8 kind; uint128 minimum; }",
  "struct ReadV1 { address target; bytes32 runtimeCodeHash; bytes data; uint16 returnWordIndex; uint8 decodeType; uint32 gasLimit; }",
  "struct PredicateV1 { ReadV1 read; uint8 phase; uint8 comparator; bytes32 bound; }",
  "struct ExecutionProgramV3 { bytes32 policyHash; bytes32 manifestHash; bytes32 canonicalProgramHash; bytes32 simulationHash; uint64 pinnedBlockNumber; bytes32 pinnedBlockHash; address owner; address inputToken; uint128 inputAmount; uint64 deadline; bytes32 nonce; address[] refundTokens; ActionV3[] actions; BalanceConstraintV3[] constraints; PredicateV1[] predicates; }",
  "struct VerifierAuthorizationV3 { address executor; uint256 chainId; bytes32 executionCommitment; bytes32 policyHash; bytes32 manifestHash; bytes32 canonicalProgramHash; bytes32 simulationHash; uint64 pinnedBlockNumber; bytes32 pinnedBlockHash; address owner; address inputToken; uint128 inputAmount; uint64 deadline; bytes32 nonce; }",
  "function execute(ExecutionProgramV3 program, VerifierAuthorizationV3 authorization, bytes signature)",
]);

export function encodeAtomicExecutionCallV3(input: {
  program: AtomicExecutionProgramV3;
  authorization: AtomicAuthorizationV3;
  expectedExecutor: Address;
  signature: Hex;
}) {
  const expected = buildAtomicAuthorizationV3(input.program, input.expectedExecutor);
  if (atomicAuthorizationPayloadHashV3(input.authorization) !== atomicAuthorizationPayloadHashV3(expected)) {
    throw new Error("Atomic authorization does not match the verified general program");
  }
  if (!/^0x(?:[0-9a-fA-F]{2}){65}$/.test(input.signature)) {
    throw new Error("Verifier signature must contain exactly 65 bytes");
  }
  return {
    to: getAddress(input.expectedExecutor),
    data: encodeFunctionData({
      abi: COBIA_EXECUTOR_V3_ABI,
      functionName: "execute",
      args: [input.program, input.authorization, input.signature],
    }),
    value: 0n as const,
  };
}
