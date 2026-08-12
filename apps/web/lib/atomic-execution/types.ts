import {
  encodeAbiParameters,
  getAddress,
  isAddress,
  keccak256,
  parseAbiParameters,
  type Address,
  type Hash,
  type Hex,
} from "viem";

export const ATOMIC_EXECUTION_CHAIN_ID = 196 as const;
export const ATOMIC_ROUTE_CAP = 10_000_000n;

export interface AtomicStepV1 {
  adapterId: Hash;
  target: Address;
  spendToken: Address;
  spendAmount: bigint;
  data: Hex;
}

export interface AtomicBalanceConstraintV1 {
  token: Address;
  account: Address;
  minimumIncrease: bigint;
}

export interface AtomicRouteV1 {
  policyHash: Hash;
  snapshotHash: Hash;
  bundleHash: Hash;
  routeHash: Hash;
  simulationHash: Hash;
  owner: Address;
  inputToken: Address;
  inputAmount: bigint;
  deadline: bigint;
  nonce: Hash;
  steps: AtomicStepV1[];
  constraints: AtomicBalanceConstraintV1[];
}

export interface AtomicAuthorizationV1 {
  executor: Address;
  chainId: bigint;
  routeCommitment: Hash;
  policyHash: Hash;
  snapshotHash: Hash;
  bundleHash: Hash;
  routeHash: Hash;
  simulationHash: Hash;
  constraintsHash: Hash;
  owner: Address;
  inputToken: Address;
  inputAmount: bigint;
  deadline: bigint;
  nonce: Hash;
}

const HASH = /^0x[0-9a-fA-F]{64}$/;
const DATA = /^0x(?:[0-9a-fA-F]{2})+$/;
const uint128Max = (1n << 128n) - 1n;
const uint64Max = (1n << 64n) - 1n;

const routeParameters = parseAbiParameters(
  "(bytes32 policyHash,bytes32 snapshotHash,bytes32 bundleHash,bytes32 routeHash,bytes32 simulationHash,address owner,address inputToken,uint128 inputAmount,uint64 deadline,bytes32 nonce,(bytes32 adapterId,address target,address spendToken,uint128 spendAmount,bytes data)[] steps,(address token,address account,uint128 minimumIncrease)[] constraints)",
);
const constraintParameters = parseAbiParameters(
  "(address token,address account,uint128 minimumIncrease)[]",
);
const authorizationParameters = parseAbiParameters(
  "(address executor,uint256 chainId,bytes32 routeCommitment,bytes32 policyHash,bytes32 snapshotHash,bytes32 bundleHash,bytes32 routeHash,bytes32 simulationHash,bytes32 constraintsHash,address owner,address inputToken,uint128 inputAmount,uint64 deadline,bytes32 nonce)",
);

function assertHash(value: string, label: string): asserts value is Hash {
  if (!HASH.test(value)) throw new Error(`${label} must be bytes32`);
}

function assertAddress(value: string, label: string): asserts value is Address {
  if (!isAddress(value) || /^0x0{40}$/i.test(value)) {
    throw new Error(`${label} must be a nonzero address`);
  }
}

function assertUint(value: bigint, maximum: bigint, label: string): void {
  if (value <= 0n || value > maximum) throw new Error(`${label} is out of range`);
}

export function assertAtomicRouteV1(route: AtomicRouteV1): void {
  ["policyHash", "snapshotHash", "bundleHash", "routeHash", "simulationHash", "nonce"]
    .forEach((field) => assertHash(route[field as keyof AtomicRouteV1] as string, field));
  assertAddress(route.owner, "owner");
  assertAddress(route.inputToken, "inputToken");
  assertUint(route.inputAmount, uint128Max, "inputAmount");
  assertUint(route.deadline, uint64Max, "deadline");
  if (route.steps.length < 1 || route.steps.length > 8 ||
    route.constraints.length < 1 || route.constraints.length > 8) {
    throw new Error("Atomic route step or constraint count is invalid");
  }
  for (const step of route.steps) {
    assertHash(step.adapterId, "adapterId");
    assertAddress(step.target, "step target");
    assertAddress(step.spendToken, "step spendToken");
    assertUint(step.spendAmount, uint128Max, "step spendAmount");
    if (!DATA.test(step.data) || step.data.length < 10) throw new Error("Step calldata is invalid");
  }
  for (const constraint of route.constraints) {
    assertAddress(constraint.token, "constraint token");
    assertAddress(constraint.account, "constraint account");
    assertUint(constraint.minimumIncrease, uint128Max, "constraint minimumIncrease");
  }
}

export function atomicRouteCommitmentV1(route: AtomicRouteV1): Hash {
  assertAtomicRouteV1(route);
  return keccak256(encodeAbiParameters(routeParameters, [{
    ...route,
    owner: getAddress(route.owner),
    inputToken: getAddress(route.inputToken),
  }]));
}

export function atomicConstraintsHashV1(
  constraints: AtomicBalanceConstraintV1[],
): Hash {
  return keccak256(encodeAbiParameters(constraintParameters, [constraints]));
}

export function atomicAuthorizationPayloadHashV1(
  authorization: AtomicAuthorizationV1,
): Hash {
  return keccak256(encodeAbiParameters(authorizationParameters, [authorization]));
}
