import { getAddress, isAddress, isAddressEqual, type Address, type Hex } from "viem";
import {
  ATOMIC_EXECUTION_CHAIN_ID_V2,
  atomicAuthorizationPayloadHashV2,
  atomicExecutionProgramHashV2,
  type AtomicAuthorizationV2,
  type AtomicExecutionProgramV2,
} from "./types-v2";

const TYPES = {
  VerifierAuthorizationV2: [{ name: "payloadHash", type: "bytes32" }],
} as const;

export function buildAtomicAuthorizationV2(
  program: AtomicExecutionProgramV2,
  executor: Address,
): AtomicAuthorizationV2 {
  if (!isAddress(executor) || /^0x0{40}$/i.test(executor)) {
    throw new Error("Atomic executor address is invalid");
  }
  return {
    executor: getAddress(executor),
    chainId: BigInt(ATOMIC_EXECUTION_CHAIN_ID_V2),
    executionCommitment: atomicExecutionProgramHashV2(program),
    policyHash: program.policyHash,
    manifestHash: program.manifestHash,
    canonicalProgramHash: program.canonicalProgramHash,
    simulationHash: program.simulationHash,
    pinnedBlockNumber: program.pinnedBlockNumber,
    pinnedBlockHash: program.pinnedBlockHash,
    owner: program.owner,
    inputToken: program.inputToken,
    inputAmount: program.inputAmount,
    deadline: program.deadline,
    nonce: program.nonce,
  };
}

export function atomicAuthorizationTypedDataV2(authorization: AtomicAuthorizationV2) {
  return {
    domain: {
      name: "CobiaCapabilityExecutor",
      version: "2",
      chainId: ATOMIC_EXECUTION_CHAIN_ID_V2,
      verifyingContract: authorization.executor,
    },
    types: TYPES,
    primaryType: "VerifierAuthorizationV2" as const,
    message: {
      payloadHash: atomicAuthorizationPayloadHashV2(authorization),
    },
  };
}

function matches(left: AtomicAuthorizationV2, right: AtomicAuthorizationV2): boolean {
  return isAddressEqual(left.executor, right.executor) &&
    left.chainId === right.chainId &&
    left.executionCommitment === right.executionCommitment &&
    left.policyHash === right.policyHash &&
    left.manifestHash === right.manifestHash &&
    left.canonicalProgramHash === right.canonicalProgramHash &&
    left.simulationHash === right.simulationHash &&
    left.pinnedBlockNumber === right.pinnedBlockNumber &&
    left.pinnedBlockHash === right.pinnedBlockHash &&
    isAddressEqual(left.owner, right.owner) &&
    isAddressEqual(left.inputToken, right.inputToken) &&
    left.inputAmount === right.inputAmount &&
    left.deadline === right.deadline &&
    left.nonce === right.nonce;
}

export async function signAtomicAuthorizationV2(input: {
  program: AtomicExecutionProgramV2;
  authorization: AtomicAuthorizationV2;
  expectedExecutor: Address;
  signTypedData: (
    parameters: ReturnType<typeof atomicAuthorizationTypedDataV2>,
  ) => Promise<Hex>;
}): Promise<Hex> {
  const expected = buildAtomicAuthorizationV2(input.program, input.expectedExecutor);
  if (!matches(input.authorization, expected)) {
    throw new Error("Atomic authorization does not match the verified capability program");
  }
  return input.signTypedData(atomicAuthorizationTypedDataV2(input.authorization));
}
