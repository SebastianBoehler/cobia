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
  encodeFunctionData,
  getAddress,
  isAddress,
  isAddressEqual,
  keccak256,
  stringToHex,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { PROTOCOL_REGISTRY } from "../adapters/registry";
import { AAVE_POOL_SUPPLY_ABI } from "../execution-v2/abis";
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

function registeredAaveAsset(asset: Address) {
  const registered = Object.values(PROTOCOL_REGISTRY.aaveV3.assets).find((candidate) =>
    isAddressEqual(candidate.underlying.address, asset));
  if (!registered) throw new Error("Atomic input asset is not registered");
  return registered;
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
  const [action, secondAction] = leg?.actions ?? [];
  if (!leg || secondAction || action?.kind !== "aave-v3-supply") {
    throw new Error("Atomic V1 projection currently supports direct Aave supply only");
  }
  const inputAmount = BigInt(leg.inputAtomic);
  if (inputAmount <= 1n || inputAmount > ATOMIC_ROUTE_CAP ||
    !isAddressEqual(action.asset, policy.asset) ||
    !isAddressEqual(bundle.routePlan.inputAsset, policy.asset)) {
    throw new Error("Atomic direct-supply amount or asset is invalid");
  }
  const asset = registeredAaveAsset(policy.asset);
  const step = Object.freeze({
    adapterId: keccak256(stringToHex(PROTOCOL_REGISTRY.aaveV3.adapterId)),
    target: PROTOCOL_REGISTRY.aaveV3.pool.address,
    spendToken: policy.asset,
    spendAmount: inputAmount,
    data: encodeFunctionData({
      abi: AAVE_POOL_SUPPLY_ABI,
      functionName: "supply",
      args: [asset.underlying.address, inputAmount, policy.owner, 0],
    }),
  });
  const constraint = Object.freeze({
    token: asset.aToken.address,
    account: policy.owner,
    minimumIncrease: inputAmount - 1n,
  });
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
    steps: Object.freeze([step]),
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
