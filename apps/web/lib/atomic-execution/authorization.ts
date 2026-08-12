import {
  getAddress,
  isAddressEqual,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  ATOMIC_EXECUTION_CHAIN_ID,
  atomicAuthorizationPayloadHashV1,
  atomicConstraintsHashV1,
  atomicRouteCommitmentV1,
  type AtomicAuthorizationV1,
  type AtomicRouteV1,
} from "./types";

const TYPES = {
  VerifierAuthorizationV1: [{ name: "payloadHash", type: "bytes32" }],
} as const;

export function buildAtomicAuthorizationV1(
  route: AtomicRouteV1,
  executor: Address,
): AtomicAuthorizationV1 {
  return {
    executor: getAddress(executor),
    chainId: BigInt(ATOMIC_EXECUTION_CHAIN_ID),
    routeCommitment: atomicRouteCommitmentV1(route),
    policyHash: route.policyHash,
    snapshotHash: route.snapshotHash,
    bundleHash: route.bundleHash,
    routeHash: route.routeHash,
    simulationHash: route.simulationHash,
    constraintsHash: atomicConstraintsHashV1(route.constraints),
    owner: route.owner,
    inputToken: route.inputToken,
    inputAmount: route.inputAmount,
    deadline: route.deadline,
    nonce: route.nonce,
  };
}

export function atomicAuthorizationTypedDataV1(
  authorization: AtomicAuthorizationV1,
) {
  return {
    domain: {
      name: "CobiaAtomicExecutor",
      version: "1",
      chainId: ATOMIC_EXECUTION_CHAIN_ID,
      verifyingContract: authorization.executor,
    },
    types: TYPES,
    primaryType: "VerifierAuthorizationV1" as const,
    message: {
      payloadHash: atomicAuthorizationPayloadHashV1(authorization),
    },
  };
}

function matches(left: AtomicAuthorizationV1, right: AtomicAuthorizationV1): boolean {
  return isAddressEqual(left.executor, right.executor) &&
    left.chainId === right.chainId &&
    left.routeCommitment === right.routeCommitment &&
    left.policyHash === right.policyHash &&
    left.snapshotHash === right.snapshotHash &&
    left.bundleHash === right.bundleHash &&
    left.routeHash === right.routeHash &&
    left.simulationHash === right.simulationHash &&
    left.constraintsHash === right.constraintsHash &&
    isAddressEqual(left.owner, right.owner) &&
    isAddressEqual(left.inputToken, right.inputToken) &&
    left.inputAmount === right.inputAmount &&
    left.deadline === right.deadline &&
    left.nonce === right.nonce;
}

export async function signAtomicAuthorizationV1(input: {
  route: AtomicRouteV1;
  authorization: AtomicAuthorizationV1;
  expectedExecutor: Address;
  verifierPrivateKey: Hex;
  signTypedData?: (
    parameters: ReturnType<typeof atomicAuthorizationTypedDataV1>,
  ) => Promise<Hex>;
}): Promise<Hex> {
  const expected = buildAtomicAuthorizationV1(input.route, input.expectedExecutor);
  if (!matches(input.authorization, expected)) {
    throw new Error("Atomic authorization does not match the projected route");
  }
  const parameters = atomicAuthorizationTypedDataV1(input.authorization);
  if (input.signTypedData) return input.signTypedData(parameters);
  return privateKeyToAccount(input.verifierPrivateKey).signTypedData(parameters);
}
