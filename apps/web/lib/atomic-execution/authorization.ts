import {
  isAddressEqual,
  zeroAddress,
  type Address,
  type Hex,
  type TypedData,
} from "viem";
import { assertProjectedAtomicRouteV1 } from "./project-route";
import {
  ATOMIC_MAX_AUTHORIZATION_WINDOW_SEC,
  type AtomicVerifierAuthorizationV1,
  type ProjectedAtomicRouteV1,
} from "./types";

const authorizationTypes = {
  VerifierAuthorizationV1: [
    { name: "routeHash", type: "bytes32" },
    { name: "owner", type: "address" },
    { name: "nonce", type: "bytes32" },
    { name: "validUntil", type: "uint64" },
  ],
} as const satisfies TypedData;

export function buildAtomicAuthorizationTypedDataV1(
  projected: ProjectedAtomicRouteV1,
) {
  assertProjectedAtomicRouteV1(projected);
  return {
    domain: {
      name: "CobiaAtomicExecutor",
      version: "1",
      chainId: projected.executionChainId,
      verifyingContract: projected.executor,
    },
    types: authorizationTypes,
    primaryType: "VerifierAuthorizationV1" as const,
    message: {
      routeHash: projected.route.routeHash,
      owner: projected.route.owner,
      nonce: projected.route.nonce,
      validUntil: BigInt(projected.route.deadline),
    },
  };
}

export interface AtomicVerifierAccountV1 {
  address: Address;
  signTypedData(
    typedData: ReturnType<typeof buildAtomicAuthorizationTypedDataV1>,
  ): Promise<Hex>;
}

export async function signAtomicAuthorizationV1(
  input: { projected: ProjectedAtomicRouteV1; nowSec: number },
  dependencies: { account: AtomicVerifierAccountV1 },
) {
  assertProjectedAtomicRouteV1(input.projected);
  if (!Number.isSafeInteger(input.nowSec) || input.nowSec < 0 ||
    input.projected.route.deadline <= input.nowSec ||
    input.projected.route.deadline > input.nowSec + ATOMIC_MAX_AUTHORIZATION_WINDOW_SEC ||
    isAddressEqual(dependencies.account.address, zeroAddress)) {
    throw new Error("Atomic authorization context is invalid");
  }
  const typedData = buildAtomicAuthorizationTypedDataV1(input.projected);
  const signature = await dependencies.account.signTypedData(typedData);
  const authorization: AtomicVerifierAuthorizationV1 = Object.freeze({
    routeHash: input.projected.route.routeHash,
    validUntil: input.projected.route.deadline,
  });
  return Object.freeze({
    authorization,
    signature,
    verifier: dependencies.account.address,
  });
}
