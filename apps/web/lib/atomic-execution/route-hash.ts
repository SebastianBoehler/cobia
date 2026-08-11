import {
  concat,
  encodeAbiParameters,
  keccak256,
  parseAbiParameters,
  stringToHex,
} from "viem";
import type { AtomicExecutionRouteV1 } from "./types";

const stepTypeHash = keccak256(stringToHex(
  "StepV1(bytes32 adapterId,address target,address spendToken,uint128 spendAmount,bytes32 dataHash)",
));
const constraintTypeHash = keccak256(stringToHex(
  "BalanceConstraintV1(address token,address account,uint128 minimumIncrease)",
));
const routeTypeHash = keccak256(stringToHex(
  "ExecutionRouteV1(bytes32 policyHash,bytes32 snapshotHash,bytes32 bundleHash,bytes32 simulationHash,address owner,address inputToken,uint128 inputAmount,uint64 deadline,bytes32 nonce,bytes32 stepsHash,bytes32 constraintsHash)",
));

export function hashAtomicRouteV1(route: AtomicExecutionRouteV1) {
  const stepHashes = route.steps.map((step) => keccak256(encodeAbiParameters(
    parseAbiParameters("bytes32,bytes32,address,address,uint128,bytes32"),
    [
      stepTypeHash,
      step.adapterId,
      step.target,
      step.spendToken,
      step.spendAmount,
      keccak256(step.data),
    ],
  )));
  const constraintHashes = route.constraints.map((constraint) =>
    keccak256(encodeAbiParameters(
      parseAbiParameters("bytes32,address,address,uint128"),
      [
        constraintTypeHash,
        constraint.token,
        constraint.account,
        constraint.minimumIncrease,
      ],
    )));
  return keccak256(encodeAbiParameters(
    parseAbiParameters(
      "bytes32,bytes32,bytes32,bytes32,bytes32,address,address,uint128,uint64,bytes32,bytes32,bytes32",
    ),
    [
      routeTypeHash,
      route.policyHash,
      route.snapshotHash,
      route.bundleHash,
      route.simulationHash,
      route.owner,
      route.inputToken,
      route.inputAmount,
      BigInt(route.deadline),
      route.nonce,
      keccak256(concat(stepHashes)),
      keccak256(concat(constraintHashes)),
    ],
  ));
}
