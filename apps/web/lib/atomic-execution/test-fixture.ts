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
  directPlan,
  executionPolicy,
  executionSnapshot,
  usdt0,
} from "../execution-v2/test-fixtures";

const solver = privateKeyToAccount(`0x${"41".repeat(32)}`);
const deployedAtomic = "10000000";

export async function verifiedAtomicFixture() {
  const policy = {
    ...executionPolicy,
    protocolExposureBps: 1_000,
  };
  const routePlan: RoutePlanV2 = RoutePlanV2Schema.parse({
    ...directPlan,
    retainedAtomic: "90000000",
    legs: [{
      ...directPlan.legs[0],
      inputAtomic: deployedAtomic,
    }],
  });
  const snapshot = {
    ...executionSnapshot,
    opportunities: executionSnapshot.opportunities.map((opportunity) =>
      opportunity.kind === "aave-v3-supply" &&
        opportunity.asset.toLowerCase() === usdt0.toLowerCase()
        ? { ...opportunity, validatedSupplyAtomic: deployedAtomic }
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
