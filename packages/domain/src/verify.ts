import {
  isAddressEqual,
  recoverMessageAddress,
  type Address,
} from "viem";
import type { DecisionBundle } from "./bundle";
import { commitment } from "./canonical";
import {
  atomicWeightedApyBps,
  splitAtomicAllocation,
} from "./allocation";
import type { StablecoinPolicy } from "./policy";
import { quoteRiskGrade, riskPenaltyBps } from "./score";
import type { MarketSnapshot } from "./snapshot";
import type { VerificationVerdict } from "./verdict";
import { RouteQuoteSchema, type RouteQuote } from "./route-quote";

export type VerificationErrorCode =
  | "REQUEST_ID_MISMATCH"
  | "POLICY_HASH_MISMATCH"
  | "SNAPSHOT_HASH_MISMATCH"
  | "SNAPSHOT_STALE"
  | "QUOTE_EXPIRED"
  | "ALLOCATION_TOTAL_INVALID"
  | "UNKNOWN_CANDIDATE"
  | "EXPOSURE_LIMIT_EXCEEDED"
  | "TVL_BELOW_MINIMUM"
  | "APY_BELOW_MINIMUM"
  | "EXPECTED_NET_APY_MISMATCH"
  | "ACTION_AMOUNT_MISMATCH"
  | "ACTION_NOT_ALLOWED"
  | "EVIDENCE_MISSING"
  | "EVIDENCE_STALE"
  | "CRITICAL_RISK"
  | "SOLVER_SIGNATURE_INVALID";

function pushUnique(
  errors: VerificationErrorCode[],
  code: VerificationErrorCode,
): void {
  if (!errors.includes(code)) errors.push(code);
}

async function hasValidSignature(
  bundle: DecisionBundle,
  expectedSolver: Address,
): Promise<boolean> {
  try {
    const { signature, ...unsigned } = bundle;
    const recovered = await recoverMessageAddress({
      message: { raw: commitment(unsigned) },
      signature,
    });
    return (
      isAddressEqual(bundle.solverAddress, expectedSolver) &&
      isAddressEqual(recovered, expectedSolver)
    );
  } catch {
    return false;
  }
}

export async function verifyBundle(
  policy: StablecoinPolicy,
  snapshot: MarketSnapshot,
  bundle: DecisionBundle,
  expectedSolver: Address,
  nowSec = Math.floor(Date.now() / 1_000),
): Promise<VerificationVerdict> {
  const errors: VerificationErrorCode[] = [];
  const bundleHash = commitment(bundle);

  if (bundle.requestId !== policy.requestId || snapshot.requestId !== policy.requestId) {
    pushUnique(errors, "REQUEST_ID_MISMATCH");
  }
  if (bundle.policyHash !== commitment(policy)) {
    pushUnique(errors, "POLICY_HASH_MISMATCH");
  }
  if (bundle.snapshotHash !== commitment(snapshot)) {
    pushUnique(errors, "SNAPSHOT_HASH_MISMATCH");
  }
  const capturedAtSec = Date.parse(snapshot.capturedAt) / 1_000;
  if (nowSec - capturedAtSec > policy.maxSnapshotAgeSec) {
    pushUnique(errors, "SNAPSHOT_STALE");
  }
  if (bundle.validUntil <= nowSec || policy.deadline <= nowSec) {
    pushUnique(errors, "QUOTE_EXPIRED");
  }

  const allocationTotal = bundle.allocations.reduce(
    (total, allocation) => total + allocation.bps,
    0,
  );
  if (allocationTotal !== 10_000) {
    pushUnique(errors, "ALLOCATION_TOTAL_INVALID");
  }

  const candidates = new Map(snapshot.candidates.map((item) => [item.id, item]));
  let recomputedNetApyBps = 0;
  let suppliedCandidateId: string | undefined;
  let suppliedBps = 0;
  let suppliedAllocationCount = 0;
  let protocolExposureBps = 0;
  let cashBps = 0;

  for (const allocation of bundle.allocations) {
    const candidate = candidates.get(allocation.candidateId);
    if (!candidate) {
      pushUnique(errors, "UNKNOWN_CANDIDATE");
      continue;
    }
    if (candidate.kind === "cash") {
      cashBps += allocation.bps;
    }
    if (candidate.kind === "aave-v3" && allocation.bps > 0) {
      const split = splitAtomicAllocation(
        policy.principalAtomic,
        allocation.bps,
      );
      recomputedNetApyBps += atomicWeightedApyBps(
        candidate.apyBps,
        split.protocolAtomic,
        policy.principalAtomic,
      );
      suppliedCandidateId = candidate.id;
      suppliedBps = allocation.bps;
      suppliedAllocationCount += 1;
      protocolExposureBps += allocation.bps;
      if (BigInt(candidate.tvlUsdE6) < BigInt(policy.minTvlUsdE6)) {
        pushUnique(errors, "TVL_BELOW_MINIMUM");
      }
    }
  }

  if (protocolExposureBps > policy.maxProtocolExposureBps) {
    pushUnique(errors, "EXPOSURE_LIMIT_EXCEEDED");
  }

  if (recomputedNetApyBps < policy.minNetApyBps) {
    pushUnique(errors, "APY_BELOW_MINIMUM");
  }
  if (bundle.expectedNetApyBps !== recomputedNetApyBps) {
    pushUnique(errors, "EXPECTED_NET_APY_MISMATCH");
  }

  if (suppliedCandidateId) {
    const candidate = candidates.get(suppliedCandidateId);
    const split = splitAtomicAllocation(policy.principalAtomic, suppliedBps);
    if (
      bundle.action.kind !== "aave-v3-supply" ||
      suppliedAllocationCount !== 1 ||
      split.protocolAtomic === "0" ||
      candidate?.kind !== "aave-v3" ||
      bundle.action.candidateId !== suppliedCandidateId ||
      bundle.action.investmentId !== candidate.investmentId
    ) {
      pushUnique(errors, "ACTION_NOT_ALLOWED");
    } else if (
      bundle.action.amountAtomic !== split.protocolAtomic
    ) {
      pushUnique(errors, "ACTION_AMOUNT_MISMATCH");
    }
  } else if (bundle.action.kind === "aave-v3-supply") {
    pushUnique(errors, "ACTION_NOT_ALLOWED");
  } else if (
    bundle.action.kind === "hold" &&
    bundle.action.amountAtomic !==
      splitAtomicAllocation(policy.principalAtomic, 10_000 - cashBps).cashAtomic
  ) {
    pushUnique(errors, "ACTION_AMOUNT_MISMATCH");
  }

  const evidenceByHash = new Map(
    bundle.evidence.map((item) => [item.contentHash, item]),
  );
  for (const flag of bundle.riskFlags) {
    if (flag.severity === "critical") pushUnique(errors, "CRITICAL_RISK");
    for (const evidenceHash of flag.evidenceHashes) {
      const evidence = evidenceByHash.get(evidenceHash);
      if (!evidence) {
        pushUnique(errors, "EVIDENCE_MISSING");
        continue;
      }
      const ageSec = nowSec - Date.parse(evidence.retrievedAt) / 1_000;
      if (ageSec > 90 * 86_400) pushUnique(errors, "EVIDENCE_STALE");
    }
  }

  if (!(await hasValidSignature(bundle, expectedSolver))) {
    pushUnique(errors, "SOLVER_SIGNATURE_INVALID");
  }

  const riskPenalty = riskPenaltyBps(bundle);
  return {
    bundleHash,
    executable: errors.length === 0,
    errorCodes: errors,
    recomputedNetApyBps,
    riskPenaltyBps: riskPenalty,
    score: recomputedNetApyBps - riskPenalty,
  };
}

export function projectRouteQuote(
  bundle: DecisionBundle,
  verdict: VerificationVerdict,
  priceAtomic: string,
  validUntil: number,
): RouteQuote {
  return RouteQuoteSchema.parse({
    version: 1,
    quoteId: verdict.bundleHash,
    requestId: bundle.requestId,
    solverId: bundle.solverId,
    solverAddress: bundle.solverAddress,
    bundleHash: verdict.bundleHash,
    expectedNetApyBps: verdict.recomputedNetApyBps,
    riskGrade: quoteRiskGrade(bundle),
    priceAtomic,
    validUntil: Math.min(validUntil, bundle.validUntil),
    verification: {
      executable: verdict.executable,
      errorCodes: verdict.errorCodes,
      score: verdict.score,
    },
  });
}
