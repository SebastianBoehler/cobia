import {
  assertVerifiedRouteVerdictV2,
  commitment,
  RouteBundleV2Schema,
  RouteSnapshotV2Schema,
  StablecoinPolicyV2Schema,
  type RouteBundleV2,
  type RouteSnapshotV2,
  type RouteVerificationVerdictV2,
  type StablecoinPolicyV2,
} from "@cobia/domain";
import {
  getAddress,
  isAddress,
  isAddressEqual,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { projectAtomicStepsV1 } from "./project-steps";
import { hashAtomicRouteV1 } from "./route-hash";
import {
  ATOMIC_EXECUTION_CHAIN_ID,
  ATOMIC_MAX_AUTHORIZATION_WINDOW_SEC,
  ATOMIC_ROUTE_CAP,
  type AtomicExecutionRouteV1,
  type ProjectedAtomicRouteV1,
} from "./types";

interface ProjectAtomicRouteInputV1 {
  policy: StablecoinPolicyV2;
  snapshot: RouteSnapshotV2;
  bundle: RouteBundleV2;
  verdict: RouteVerificationVerdictV2;
  executor: Address;
  simulationHash: Hex;
  nonce: Hex;
  nowSec: number;
}

const projectedRoutes = new WeakSet<ProjectedAtomicRouteV1>();
const hashPattern = /^0x[0-9a-fA-F]{64}$/;

function nonzeroHash(value: unknown, label: string): Hex {
  if (typeof value !== "string" || !hashPattern.test(value) || /^0x0{64}$/i.test(value)) {
    throw new Error(`${label} must be a nonzero 32-byte hash`);
  }
  return value as Hex;
}

function safeNow(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("Current time must be a non-negative safe integer");
  }
  return value;
}

export function assertProjectedAtomicRouteV1(
  projected: ProjectedAtomicRouteV1,
): void {
  if (!projectedRoutes.has(projected)) {
    throw new Error("Atomic route was not produced by projectAtomicRouteV1");
  }
  if (projected.route.routeHash !== hashAtomicRouteV1(projected.route)) {
    throw new Error("Atomic route hash no longer matches the projected route");
  }
}

export function projectAtomicRouteV1(
  input: ProjectAtomicRouteInputV1,
): ProjectedAtomicRouteV1 {
  assertVerifiedRouteVerdictV2(input.bundle, input.verdict);
  if (!input.verdict.routeAuthorized || input.verdict.errorCodes.length !== 0) {
    throw new Error("Atomic projection requires an authorized route verdict");
  }
  const policy = StablecoinPolicyV2Schema.parse(input.policy);
  const snapshot = RouteSnapshotV2Schema.parse(input.snapshot);
  const bundle = RouteBundleV2Schema.parse(input.bundle);
  if (commitment(policy) !== bundle.policyHash || commitment(snapshot) !== bundle.snapshotHash) {
    throw new Error("Atomic projection artifacts do not match the verified bundle");
  }
  const nowSec = safeNow(input.nowSec);
  if (bundle.validUntil <= nowSec ||
    bundle.validUntil > nowSec + ATOMIC_MAX_AUTHORIZATION_WINDOW_SEC) {
    throw new Error("Atomic authorization window is invalid");
  }
  if (!isAddress(input.executor) || isAddressEqual(input.executor, zeroAddress)) {
    throw new Error("Atomic executor address is invalid");
  }
  const simulationHash = nonzeroHash(input.simulationHash, "Simulation hash");
  const nonce = nonzeroHash(input.nonce, "Atomic nonce");
  const [leg] = bundle.routePlan.legs;
  if (!leg) throw new Error("Atomic execution requires one deployed route leg");
  const inputAmount = BigInt(leg.inputAtomic);
  if (inputAmount <= 1n || inputAmount > ATOMIC_ROUTE_CAP ||
    !isAddressEqual(bundle.routePlan.inputAsset, policy.asset)) {
    throw new Error("Atomic input amount or asset is invalid");
  }
  const projection = projectAtomicStepsV1({
    leg,
    inputAsset: policy.asset,
    owner: policy.owner,
    executor: getAddress(input.executor),
    deadline: bundle.validUntil,
  });
  const steps = Object.freeze(projection.steps.map((step) => Object.freeze(step)));
  const constraint = Object.freeze(projection.constraint);
  const route: AtomicExecutionRouteV1 = {
    policyHash: bundle.policyHash,
    snapshotHash: bundle.snapshotHash,
    bundleHash: input.verdict.bundleHash,
    routeHash: `0x${"00".repeat(32)}`,
    simulationHash,
    owner: policy.owner,
    inputToken: policy.asset,
    inputAmount,
    deadline: bundle.validUntil,
    nonce,
    steps,
    constraints: Object.freeze([constraint]),
  };
  route.routeHash = hashAtomicRouteV1(route);
  Object.freeze(route);
  const projected = Object.freeze({
    executionChainId: ATOMIC_EXECUTION_CHAIN_ID,
    executor: getAddress(input.executor),
    route,
  });
  projectedRoutes.add(projected);
  return projected;
}
