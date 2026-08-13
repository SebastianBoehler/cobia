import {
  encodeFunctionData,
  getAddress,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import { buildAtomicAuthorizationV2 } from "./authorization-v2";
import {
  atomicAuthorizationPayloadHashV2,
  type AtomicAuthorizationV2,
  type AtomicExecutionProgramV2,
} from "./types-v2";

export const COBIA_EXECUTOR_V2_ABI = parseAbi([
  "struct ApprovalV2 { address token; uint128 amount; }",
  "struct ActionV2 { bytes32 capabilityKey; address target; ApprovalV2[] approvals; bytes data; }",
  "struct BalanceConstraintV2 { address token; uint128 minimumIncrease; }",
  "struct ExecutionProgramV2 { bytes32 policyHash; bytes32 manifestHash; bytes32 canonicalProgramHash; bytes32 simulationHash; uint64 pinnedBlockNumber; bytes32 pinnedBlockHash; address owner; address inputToken; uint128 inputAmount; uint64 deadline; bytes32 nonce; address[] refundTokens; ActionV2[] actions; BalanceConstraintV2[] constraints; }",
  "struct VerifierAuthorizationV2 { address executor; uint256 chainId; bytes32 executionCommitment; bytes32 policyHash; bytes32 manifestHash; bytes32 canonicalProgramHash; bytes32 simulationHash; uint64 pinnedBlockNumber; bytes32 pinnedBlockHash; address owner; address inputToken; uint128 inputAmount; uint64 deadline; bytes32 nonce; }",
  "function execute(ExecutionProgramV2 program, VerifierAuthorizationV2 authorization, bytes signature)",
]);

export interface AtomicExecutionCallV2 {
  to: Address;
  data: Hex;
  value: 0n;
}

export function encodeAtomicExecutionCallV2(input: {
  program: AtomicExecutionProgramV2;
  authorization: AtomicAuthorizationV2;
  expectedExecutor: Address;
  signature: Hex;
}): AtomicExecutionCallV2 {
  const expected = buildAtomicAuthorizationV2(input.program, input.expectedExecutor);
  if (atomicAuthorizationPayloadHashV2(input.authorization) !==
    atomicAuthorizationPayloadHashV2(expected)) {
    throw new Error("Atomic authorization does not match the verified capability program");
  }
  if (!/^0x(?:[0-9a-fA-F]{2}){65}$/.test(input.signature)) {
    throw new Error("Verifier signature must contain exactly 65 bytes");
  }
  return {
    to: getAddress(input.expectedExecutor),
    data: encodeFunctionData({
      abi: COBIA_EXECUTOR_V2_ABI,
      functionName: "execute",
      args: [input.program, input.authorization, input.signature],
    }),
    value: 0n,
  };
}
