import type { Address, Hex } from "viem";

export const ATOMIC_EXECUTION_CHAIN_ID = 196;
export const ATOMIC_ROUTE_CAP = 10_000_000n;
export const ATOMIC_MAX_AUTHORIZATION_WINDOW_SEC = 300;

export interface AtomicStepV1 {
  adapterId: Hex;
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

export interface AtomicExecutionRouteV1 {
  policyHash: Hex;
  snapshotHash: Hex;
  bundleHash: Hex;
  routeHash: Hex;
  simulationHash: Hex;
  owner: Address;
  inputToken: Address;
  inputAmount: bigint;
  deadline: number;
  nonce: Hex;
  steps: readonly AtomicStepV1[];
  constraints: readonly AtomicBalanceConstraintV1[];
}

export interface ProjectedAtomicRouteV1 {
  executionChainId: typeof ATOMIC_EXECUTION_CHAIN_ID;
  executor: Address;
  route: AtomicExecutionRouteV1;
}

export interface AtomicVerifierAuthorizationV1 {
  routeHash: Hex;
  validUntil: number;
}
