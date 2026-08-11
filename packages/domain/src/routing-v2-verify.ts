import {
  isAddressEqual,
  recoverMessageAddress,
  type Address,
} from "viem";
import { commitment } from "./canonical";
import { quoteRiskGrade } from "./score";
import {
  assessRouteAuthorizationV2,
  type RouteAuthorizationContextV2,
  type RoutePolicyErrorCodeV2,
} from "./routing-v2-assess";
import {
  RouteBundleV2Schema,
  RouteQuoteV2Schema,
  type RouteBundleV2,
  type RouteQuoteV2,
} from "./routing-v2-bundle";
import { estimateRouteEconomicsV2 } from "./routing-v2-economics";
import {
  StablecoinPolicyV2Schema,
  type StablecoinPolicyV2,
} from "./routing-v2-policy";
import {
  RouteSnapshotV2Schema,
  type RouteSnapshotV2,
} from "./routing-v2-snapshot";

export type RouteVerificationErrorCodeV2 = RoutePolicyErrorCodeV2 |
  "SNAPSHOT_FROM_FUTURE" |
  "SNAPSHOT_EXPIRED" |
  "QUOTE_EXPIRED" |
  "VALIDITY_EXCEEDS_POLICY" |
  "PRE_GAS_APY_MISMATCH" |
  "PRE_GAS_APY_BELOW_MINIMUM" |
  "PRE_GAS_GAIN_NOT_POSITIVE" |
  "ECONOMICS_INVALID" |
  "CRITICAL_RISK" |
  "EVIDENCE_MISSING" |
  "SOLVER_SIGNATURE_INVALID";

export interface RouteVerificationVerdictV2 {
  readonly bundleHash: `0x${string}`;
  readonly routeAuthorized: boolean;
  readonly errorCodes: readonly RouteVerificationErrorCodeV2[];
  readonly recomputedPreGasApyBps: number;
}

const verifiedRouteVerdictsV2 = new WeakSet<RouteVerificationVerdictV2>();

function pushUnique(
  errors: RouteVerificationErrorCodeV2[],
  code: RouteVerificationErrorCodeV2,
): void {
  if (!errors.includes(code)) errors.push(code);
}

async function validSolverSignature(
  bundle: RouteBundleV2,
  expectedSolver: Address,
): Promise<boolean> {
  if (!isAddressEqual(bundle.solverAddress, expectedSolver)) return false;
  const { signature, ...unsigned } = bundle;
  try {
    const recovered = await recoverMessageAddress({
      message: { raw: commitment(unsigned) },
      signature,
    });
    return isAddressEqual(recovered, expectedSolver);
  } catch {
    return false;
  }
}

export async function verifyRouteBundleV2(
  rawPolicy: StablecoinPolicyV2,
  rawSnapshot: RouteSnapshotV2,
  rawBundle: RouteBundleV2,
  expectedSolver: Address,
  context: RouteAuthorizationContextV2,
  nowSec: number,
): Promise<RouteVerificationVerdictV2> {
  const policy = StablecoinPolicyV2Schema.parse(rawPolicy);
  const snapshot = RouteSnapshotV2Schema.parse(rawSnapshot);
  const bundle = RouteBundleV2Schema.parse(rawBundle);
  const errors: RouteVerificationErrorCodeV2[] = [];
  const authorization = assessRouteAuthorizationV2(policy, snapshot, bundle, context);
  for (const code of authorization.errorCodes) pushUnique(errors, code);

  const capturedAtMs = Date.parse(snapshot.capturedAt);
  const capturedAtSec = Math.floor(capturedAtMs / 1_000);
  const cutoffSec = Math.min(
    policy.deadline,
    capturedAtSec + policy.maxSnapshotAgeSec,
  );
  if (capturedAtMs > nowSec * 1_000) pushUnique(errors, "SNAPSHOT_FROM_FUTURE");
  if (nowSec >= capturedAtSec + policy.maxSnapshotAgeSec) {
    pushUnique(errors, "SNAPSHOT_EXPIRED");
  }
  if (nowSec >= bundle.validUntil) pushUnique(errors, "QUOTE_EXPIRED");
  if (bundle.validUntil > cutoffSec) pushUnique(errors, "VALIDITY_EXCEEDS_POLICY");

  let recomputedPreGasApyBps = 0;
  try {
    const economics = estimateRouteEconomicsV2(
      policy,
      snapshot,
      bundle.routePlan,
    );
    recomputedPreGasApyBps = economics.estimatedPreGasApyBps;
    if (bundle.estimatedPreGasApyBps !== recomputedPreGasApyBps) {
      pushUnique(errors, "PRE_GAS_APY_MISMATCH");
    }
    if (recomputedPreGasApyBps < policy.minPreGasApyBps) {
      pushUnique(errors, "PRE_GAS_APY_BELOW_MINIMUM");
    }
    if (bundle.routePlan.legs.length > 0 && !economics.positiveGain) {
      pushUnique(errors, "PRE_GAS_GAIN_NOT_POSITIVE");
    }
  } catch {
    pushUnique(errors, "ECONOMICS_INVALID");
  }

  const evidenceHashes = new Set(bundle.evidence.map(({ contentHash }) => contentHash));
  for (const flag of bundle.riskFlags) {
    if (flag.severity === "critical") pushUnique(errors, "CRITICAL_RISK");
    if (flag.evidenceHashes.some((hash) => !evidenceHashes.has(hash))) {
      pushUnique(errors, "EVIDENCE_MISSING");
    }
  }
  if (!(await validSolverSignature(bundle, expectedSolver))) {
    pushUnique(errors, "SOLVER_SIGNATURE_INVALID");
  }

  const verdict: RouteVerificationVerdictV2 = Object.freeze({
    bundleHash: commitment(bundle),
    routeAuthorized: errors.length === 0,
    errorCodes: Object.freeze([...errors]),
    recomputedPreGasApyBps,
  });
  verifiedRouteVerdictsV2.add(verdict);
  return verdict;
}

export function assertVerifiedRouteVerdictV2(
  bundle: RouteBundleV2,
  verdict: RouteVerificationVerdictV2,
): void {
  if (!verifiedRouteVerdictsV2.has(verdict)) {
    throw new Error(
      "Route verdict was not produced by verifyRouteBundleV2",
    );
  }
  const bundleHash = commitment(RouteBundleV2Schema.parse(bundle));
  if (verdict.bundleHash.toLowerCase() !== bundleHash.toLowerCase()) {
    throw new Error("Verification verdict does not belong to this route bundle");
  }
  if (
    verdict.routeAuthorized &&
    verdict.recomputedPreGasApyBps !== bundle.estimatedPreGasApyBps
  ) {
    throw new Error("Authorized verdict does not match the signed route economics");
  }
}

export function projectRouteQuoteV2(
  bundle: RouteBundleV2,
  verdict: RouteVerificationVerdictV2,
  priceAtomic: string,
  validUntil: number,
): RouteQuoteV2 {
  const parsedBundle = RouteBundleV2Schema.parse(bundle);
  assertVerifiedRouteVerdictV2(parsedBundle, verdict);
  const bundleHash = verdict.bundleHash;
  return RouteQuoteV2Schema.parse({
    version: 2,
    quoteId: bundleHash,
    requestId: parsedBundle.requestId,
    solverId: parsedBundle.solverId,
    solverAddress: parsedBundle.solverAddress,
    bundleHash,
    estimatedPreGasApyBps: verdict.recomputedPreGasApyBps,
    riskGrade: quoteRiskGrade(parsedBundle),
    priceAtomic,
    validUntil: Math.min(validUntil, parsedBundle.validUntil),
    authorization: {
      routeAuthorized: verdict.routeAuthorized,
      errorCodes: verdict.errorCodes,
    },
  });
}
