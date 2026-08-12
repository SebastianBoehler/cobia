import { encodeFunctionData, type Hex } from "viem";
import type { OwnerTransactionV2 } from "../execution-v2/types";
import { assertProjectedAtomicRouteV1 } from "./project-route";
import type {
  AtomicVerifierAuthorizationV1,
  ProjectedAtomicRouteV1,
} from "./types";

export const ATOMIC_EXECUTOR_ABI = [{
  type: "function",
  name: "execute",
  stateMutability: "nonpayable",
  inputs: [{
    name: "route",
    type: "tuple",
    components: [
      { name: "policyHash", type: "bytes32" },
      { name: "snapshotHash", type: "bytes32" },
      { name: "bundleHash", type: "bytes32" },
      { name: "routeHash", type: "bytes32" },
      { name: "simulationHash", type: "bytes32" },
      { name: "owner", type: "address" },
      { name: "inputToken", type: "address" },
      { name: "inputAmount", type: "uint128" },
      { name: "deadline", type: "uint64" },
      { name: "nonce", type: "bytes32" },
      {
        name: "steps",
        type: "tuple[]",
        components: [
          { name: "adapterId", type: "bytes32" },
          { name: "target", type: "address" },
          { name: "spendToken", type: "address" },
          { name: "spendAmount", type: "uint128" },
          { name: "data", type: "bytes" },
        ],
      },
      {
        name: "constraints",
        type: "tuple[]",
        components: [
          { name: "token", type: "address" },
          { name: "account", type: "address" },
          { name: "minimumIncrease", type: "uint128" },
        ],
      },
    ],
  }, {
    name: "authorization",
    type: "tuple",
    components: [
      { name: "routeHash", type: "bytes32" },
      { name: "validUntil", type: "uint64" },
    ],
  }, { name: "signature", type: "bytes" }],
  outputs: [],
}] as const;

export function buildAtomicExecutionTransactionV1(
  projected: ProjectedAtomicRouteV1,
  signed: { authorization: AtomicVerifierAuthorizationV1; signature: Hex },
): OwnerTransactionV2 {
  assertProjectedAtomicRouteV1(projected);
  if (signed.authorization.routeHash !== projected.route.routeHash ||
    signed.authorization.validUntil !== projected.route.deadline) {
    throw new Error("Atomic authorization does not match the projected route");
  }
  if (!/^0x[0-9a-fA-F]{130}$/.test(signed.signature)) {
    throw new Error("Atomic verifier signature must be 65 bytes");
  }
  const route = {
    ...projected.route,
    deadline: BigInt(projected.route.deadline),
  };
  return {
    label: "cobia-atomic-route-v1",
    chainId: projected.executionChainId,
    from: projected.route.owner,
    to: projected.executor,
    value: 0n,
    data: encodeFunctionData({
      abi: ATOMIC_EXECUTOR_ABI,
      functionName: "execute",
      args: [route, {
        routeHash: signed.authorization.routeHash,
        validUntil: BigInt(signed.authorization.validUntil),
      }, signed.signature],
    }),
  };
}
