import {
  commitment,
  estimateRouteEconomicsV2,
  RoutePlanV2Schema,
  verifyRouteBundleV2,
  type RouteBundleV2,
  type RoutePlanV2,
} from "@cobia/domain";
import { privateKeyToAccount } from "viem/accounts";
import { registryHash } from "../adapters/registry";
import {
  DEADLINE_SEC,
  NOW_SEC,
  curvePlan,
  directPlan,
  executionPolicy,
  executionSnapshot,
  swapPlan,
  usdg,
  usdt0,
} from "../execution-v2/test-fixtures";

const solver = privateKeyToAccount(`0x${"41".repeat(32)}`);
const deployedAtomic = "10000000";
const quotedOutputAtomic = "9999000";
const minimumOutputAtomic = "9949005";

export async function verifiedAtomicFixture(
  kind: "direct" | "curve" | "uniswap" = "direct",
) {
  const policy = {
    ...executionPolicy,
    protocolExposureBps: 1_000,
  };
  const sourcePlan = kind === "curve" ? curvePlan
    : kind === "uniswap" ? swapPlan : directPlan;
  const routePlan: RoutePlanV2 = RoutePlanV2Schema.parse({
    ...sourcePlan,
    retainedAtomic: "90000000",
    legs: [{
      ...sourcePlan.legs[0],
      inputAtomic: deployedAtomic,
      actions: sourcePlan.legs[0].actions.map((action) =>
        action.kind === "curve-stableswap-ng-exact-input" ||
          action.kind === "uniswap-v3-exact-input"
          ? { ...action, quotedOutputAtomic, minimumOutputAtomic }
          : action),
    }],
  });
  const snapshot = {
    ...executionSnapshot,
    opportunities: executionSnapshot.opportunities.map((opportunity) =>
      opportunity.kind === "aave-v3-supply"
        ? {
            ...opportunity,
            validatedSupplyAtomic: opportunity.asset.toLowerCase() === usdt0.toLowerCase()
              ? deployedAtomic
              : opportunity.asset.toLowerCase() === usdg.toLowerCase()
                ? quotedOutputAtomic
                : opportunity.validatedSupplyAtomic,
          }
        : opportunity.kind === "curve-stableswap-ng-exact-input" ||
            opportunity.kind === "uniswap-v3-exact-input"
          ? {
              ...opportunity,
              quotedInputAtomic: deployedAtomic,
              quotedOutputAtomic,
            }
          : opportunity),
  };
  const unsigned: Omit<RouteBundleV2, "signature"> = {
    version: 2,
    requestId: policy.requestId,
    solverId: "atomic-test-solver",
    solverAddress: solver.address.toLowerCase() as RouteBundleV2["solverAddress"],
    policyHash: commitment(policy),
    snapshotHash: commitment(snapshot),
    routePlan,
    evidence: [],
    riskFlags: [],
    estimatedPreGasApyBps: estimateRouteEconomicsV2(
      policy,
      snapshot,
      routePlan,
    ).estimatedPreGasApyBps,
    validUntil: DEADLINE_SEC,
  };
  const signature = await solver.signMessage({
    message: { raw: commitment(unsigned) },
  });
  const bundle: RouteBundleV2 = { ...unsigned, signature };
  const verdict = await verifyRouteBundleV2(
    policy,
    snapshot,
    bundle,
    solver.address,
    { expectedAdapterRegistryHash: registryHash },
    NOW_SEC,
  );
  if (!verdict.routeAuthorized) {
    throw new Error(`Atomic fixture rejected: ${verdict.errorCodes.join(",")}`);
  }
  return { policy, snapshot, bundle, verdict };
}
