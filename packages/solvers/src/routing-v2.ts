import {
  RouteBundleV2Schema,
  RouteSnapshotV2Schema,
  StablecoinPolicyV2Schema,
  assessRouteAuthorizationV2,
  compareRouteEconomicsV2,
  commitment,
  estimateRouteEconomicsV2,
  type RouteEconomicsV2,
  type RoutePlanV2,
  type RouteSnapshotV2,
  type StablecoinPolicyV2,
} from "@cobia/domain";
import {
  isAddressEqual,
  type Address,
  type Hash,
  type LocalAccount,
} from "viem";
import { signRouteBundleV2 } from "./sign";

const BPS_SCALE = 10_000n;
const UnsignedRouteBundleV2Schema = RouteBundleV2Schema.omit({ signature: true });

export interface RouteSolverInputV2 {
  policy: StablecoinPolicyV2;
  snapshot: RouteSnapshotV2;
  nowSec: number;
}

export interface RouteBuilderOptionsV2 {
  solverId: string;
  solverAddress: Address;
  expectedAdapterRegistryHash: Hash;
}

export type UnsignedRouteBundleV2 = Omit<
  ReturnType<typeof RouteBundleV2Schema.parse>,
  "signature"
>;

export interface DeterministicRouteSolverOptionsV2 {
  solverId: string;
  account: LocalAccount;
  expectedAdapterRegistryHash: Hash;
}

export interface RouteSolverV2 {
  id: string;
  address: Address;
  solve(input: RouteSolverInputV2): Promise<ReturnType<typeof RouteBundleV2Schema.parse>>;
}

interface Candidate {
  id: string;
  economics: RouteEconomicsV2;
  plan: RoutePlanV2;
}

function noActionPlan(policy: StablecoinPolicyV2): RoutePlanV2 {
  return {
    version: 2,
    inputAsset: policy.asset,
    inputAtomic: policy.principalAtomic,
    retainedAtomic: policy.principalAtomic,
    horizonDays: policy.horizonDays,
    legs: [],
  };
}

function noActionCandidate(policy: StablecoinPolicyV2): Candidate {
  return {
    id: "no-action",
    economics: {
      estimatedPreGasApyBps: 0,
      positiveGain: false,
    },
    plan: noActionPlan(policy),
  };
}

function validUntil(input: RouteSolverInputV2): number {
  const capturedAtSec = Math.floor(Date.parse(input.snapshot.capturedAt) / 1_000);
  return Math.min(
    input.policy.deadline,
    capturedAtSec + input.policy.maxSnapshotAgeSec,
  );
}

function selectCandidate(
  policy: StablecoinPolicyV2,
  snapshot: RouteSnapshotV2,
): Candidate {
  const principal = BigInt(policy.principalAtomic);
  const deployed = principal * BigInt(policy.protocolExposureBps) / BPS_SCALE;
  const retained = principal - deployed;
  if (deployed === 0n) return noActionCandidate(policy);
  const candidates: Candidate[] = [];
  const addCandidate = (id: string, plan: RoutePlanV2) => {
    candidates.push({
      id,
      economics: estimateRouteEconomicsV2(policy, snapshot, plan),
      plan,
    });
  };

  const supplyEligible = (
    supply: Extract<RouteSnapshotV2["opportunities"][number], { kind: "aave-v3-supply" }>,
    asset: Address,
    amountAtomic: string,
  ) => policy.allowedAdapters.includes(supply.adapterId) &&
    policy.allowedOutputAssets.some((allowed) => isAddressEqual(allowed, asset)) &&
    isAddressEqual(supply.asset, asset) &&
    supply.validatedSupplyAtomic === amountAtomic &&
    BigInt(supply.tvlUsdE6) >= BigInt(policy.minTvlUsdE6);

  for (const supply of snapshot.opportunities) {
    if (supply.kind !== "aave-v3-supply") continue;
    if (supplyEligible(supply, policy.asset, deployed.toString())) {
      addCandidate(`direct:${supply.id}`, {
        version: 2,
        inputAsset: policy.asset,
        inputAtomic: policy.principalAtomic,
        retainedAtomic: retained.toString(),
        horizonDays: policy.horizonDays,
        legs: [{
          id: "direct-supply",
          inputAtomic: deployed.toString(),
          actions: [{
            kind: "aave-v3-supply",
            opportunityId: supply.id,
            consume: "all",
            asset: supply.asset,
          }],
        }],
      });
    }
  }

  for (const swap of snapshot.opportunities) {
    if (swap.kind !== "uniswap-v3-exact-input") continue;
    if (
      !policy.allowedAdapters.includes(swap.adapterId) ||
      !isAddressEqual(swap.tokenIn, policy.asset) ||
      !policy.allowedOutputAssets.some((asset) => isAddressEqual(asset, swap.tokenOut)) ||
      swap.quotedInputAtomic !== deployed.toString()
    ) continue;
    for (const supply of snapshot.opportunities) {
      if (
        supply.kind !== "aave-v3-supply" ||
        !supplyEligible(supply, swap.tokenOut, swap.quotedOutputAtomic)
      ) continue;
      const minimumOutputNumerator = BigInt(swap.quotedOutputAtomic) *
        BigInt(10_000 - policy.maxSlippageBps);
      const minimumOutput =
        (minimumOutputNumerator + BPS_SCALE - 1n) / BPS_SCALE;
      addCandidate(`swap:${swap.id}:${supply.id}`, {
        version: 2,
        inputAsset: policy.asset,
        inputAtomic: policy.principalAtomic,
        retainedAtomic: retained.toString(),
        horizonDays: policy.horizonDays,
        legs: [{
          id: "swap-then-supply",
          inputAtomic: deployed.toString(),
          actions: [{
            kind: "uniswap-v3-exact-input",
            opportunityId: swap.id,
            consume: "all",
            tokenIn: swap.tokenIn,
            tokenOut: swap.tokenOut,
            quotedOutputAtomic: swap.quotedOutputAtomic,
            minimumOutputAtomic: (minimumOutput > 0n ? minimumOutput : 1n).toString(),
          }, {
            kind: "aave-v3-supply",
            opportunityId: supply.id,
            consume: "all",
            asset: supply.asset,
          }],
        }],
      });
    }
  }

  candidates.sort((left, right) => {
    const economicsOrder = compareRouteEconomicsV2(
      policy,
      snapshot,
      left.plan,
      right.plan,
    );
    if (economicsOrder !== 0) return economicsOrder;
    return left.id.localeCompare(right.id);
  });
  const best = candidates[0];
  return best?.economics.positiveGain ? best : noActionCandidate(policy);
}

export function buildDeterministicRouteBundleV2(
  rawInput: RouteSolverInputV2,
  options: RouteBuilderOptionsV2,
): UnsignedRouteBundleV2 {
  const policy = StablecoinPolicyV2Schema.parse(rawInput.policy);
  const snapshot = RouteSnapshotV2Schema.parse(rawInput.snapshot);
  const input = { ...rawInput, policy, snapshot };
  if (snapshot.requestId !== policy.requestId) {
    throw new Error("Policy and snapshot request IDs do not match");
  }
  if (Date.parse(snapshot.capturedAt) > rawInput.nowSec * 1_000) {
    throw new Error("Routing snapshot is from the future");
  }
  const expiry = validUntil(input);
  if (expiry <= rawInput.nowSec) throw new Error("Routing snapshot is expired");
  const candidate = selectCandidate(policy, snapshot);
  const apy = candidate.economics.estimatedPreGasApyBps;
  const meetsNetFloor = candidate.economics.positiveGain &&
    apy >= policy.minPreGasApyBps;

  const bundle = UnsignedRouteBundleV2Schema.parse({
    version: 2,
    requestId: policy.requestId,
    solverId: options.solverId,
    solverAddress: options.solverAddress,
    policyHash: commitment(policy),
    snapshotHash: commitment(snapshot),
    routePlan: meetsNetFloor ? candidate.plan : noActionPlan(policy),
    evidence: [],
    riskFlags: [],
    estimatedPreGasApyBps: meetsNetFloor ? apy : 0,
    validUntil: expiry,
  });
  const authorization = assessRouteAuthorizationV2(policy, snapshot, bundle, {
    expectedAdapterRegistryHash: options.expectedAdapterRegistryHash,
  });
  if (!authorization.authorizationValid) {
    throw new Error(
      `Generated route is not authorized: ${authorization.errorCodes.join(",").toLowerCase()}`,
    );
  }
  return bundle;
}

export function createDeterministicRouteSolverV2(
  options: DeterministicRouteSolverOptionsV2,
): RouteSolverV2 {
  return {
    id: options.solverId,
    address: options.account.address,
    solve: (input) => signRouteBundleV2(
      buildDeterministicRouteBundleV2(input, {
        solverId: options.solverId,
        solverAddress: options.account.address,
        expectedAdapterRegistryHash: options.expectedAdapterRegistryHash,
      }),
      options.account,
    ),
  };
}
