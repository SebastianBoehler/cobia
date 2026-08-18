import { getAddress, isAddress, isAddressEqual, type Address, type Hex } from "viem";
import {
  ATOMIC_EXECUTION_CHAIN_ID_V3,
  atomicAuthorizationPayloadHashV3,
  atomicExecutionProgramHashV3,
  type AtomicAuthorizationV3,
  type AtomicExecutionProgramV3,
} from "./types-v3";

const TYPES = { VerifierAuthorizationV3: [{ name: "payloadHash", type: "bytes32" }] } as const;

export function buildAtomicAuthorizationV3(
  program: AtomicExecutionProgramV3,
  executor: Address,
): AtomicAuthorizationV3 {
  if (!isAddress(executor) || /^0x0{40}$/i.test(executor)) throw new Error("Atomic executor address is invalid");
  return {
    executor: getAddress(executor),
    chainId: BigInt(ATOMIC_EXECUTION_CHAIN_ID_V3),
    executionCommitment: atomicExecutionProgramHashV3(program),
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

export function atomicAuthorizationTypedDataV3(authorization: AtomicAuthorizationV3) {
  return {
    domain: {
      name: "CobiaCapabilityExecutor",
      version: "3",
      chainId: ATOMIC_EXECUTION_CHAIN_ID_V3,
      verifyingContract: authorization.executor,
    },
    types: TYPES,
    primaryType: "VerifierAuthorizationV3" as const,
    message: { payloadHash: atomicAuthorizationPayloadHashV3(authorization) },
  };
}

function matches(left: AtomicAuthorizationV3, right: AtomicAuthorizationV3) {
  return isAddressEqual(left.executor, right.executor) && left.chainId === right.chainId &&
    left.executionCommitment === right.executionCommitment && left.policyHash === right.policyHash &&
    left.manifestHash === right.manifestHash && left.canonicalProgramHash === right.canonicalProgramHash &&
    left.simulationHash === right.simulationHash && left.pinnedBlockNumber === right.pinnedBlockNumber &&
    left.pinnedBlockHash === right.pinnedBlockHash && isAddressEqual(left.owner, right.owner) &&
    isAddressEqual(left.inputToken, right.inputToken) && left.inputAmount === right.inputAmount &&
    left.deadline === right.deadline && left.nonce === right.nonce;
}

export async function signAtomicAuthorizationV3(input: {
  program: AtomicExecutionProgramV3;
  authorization: AtomicAuthorizationV3;
  expectedExecutor: Address;
  signTypedData(parameters: ReturnType<typeof atomicAuthorizationTypedDataV3>): Promise<Hex>;
}): Promise<Hex> {
  const expected = buildAtomicAuthorizationV3(input.program, input.expectedExecutor);
  if (!matches(input.authorization, expected)) {
    throw new Error("Atomic authorization does not match the verified general program");
  }
  return input.signTypedData(atomicAuthorizationTypedDataV3(input.authorization));
}
