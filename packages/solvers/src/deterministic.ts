import {
  atomicWeightedApyBps,
  commitment,
  splitAtomicAllocation,
  type DecisionBundle,
  type MarketCandidate,
} from "@cobia/domain";
import type { LocalAccount } from "viem";
import { signBundle } from "./sign";
import type { Solver, SolverInput } from "./types";

export interface DeterministicSolverOptions {
  solverId: string;
  account: LocalAccount;
}

type AaveCandidate = Extract<MarketCandidate, { kind: "aave-v3" }>;

function selectCandidate(input: SolverInput): AaveCandidate | undefined {
  const { policy, snapshot } = input;
  const split = splitAtomicAllocation(
    policy.principalAtomic,
    policy.maxProtocolExposureBps,
  );
  if (split.protocolAtomic === "0") return undefined;
  return snapshot.candidates
    .filter((candidate): candidate is AaveCandidate => {
      if (candidate.kind !== "aave-v3") return false;
      if (BigInt(candidate.tvlUsdE6) < BigInt(policy.minTvlUsdE6)) return false;
      return (
        atomicWeightedApyBps(
          candidate.apyBps,
          split.protocolAtomic,
          policy.principalAtomic,
        ) >=
        policy.minNetApyBps
      );
    })
    .sort(
      (left, right) =>
        right.apyBps - left.apyBps || left.id.localeCompare(right.id),
    )[0];
}

function snapshotExpiry(input: SolverInput): number {
  const capturedAtSec = Math.floor(Date.parse(input.snapshot.capturedAt) / 1_000);
  return Math.min(
    input.policy.deadline,
    capturedAtSec + input.policy.maxSnapshotAgeSec,
  );
}

export function buildDeterministicBundle(
  input: SolverInput,
  options: DeterministicSolverOptions,
): Omit<DecisionBundle, "signature"> {
  const { policy, snapshot } = input;
  let candidate = selectCandidate(input);
  const cashCandidates = snapshot.candidates.filter(
    (item) => item.kind === "cash",
  );
  if (cashCandidates.length !== 1) {
    throw new Error("Snapshot must contain exactly one cash candidate");
  }
  const cashCandidateId = cashCandidates[0].id;
  let exposureBps = candidate ? policy.maxProtocolExposureBps : 0;
  let split = splitAtomicAllocation(policy.principalAtomic, exposureBps);
  if (split.protocolAtomic === "0") {
    candidate = undefined;
    exposureBps = 0;
    split = splitAtomicAllocation(policy.principalAtomic, exposureBps);
  }
  const cashBps = 10_000 - exposureBps;

  return {
    version: 1,
    requestId: policy.requestId,
    solverId: options.solverId,
    solverAddress: options.account.address,
    policyHash: commitment(policy),
    snapshotHash: commitment(snapshot),
    allocations: candidate
      ? [
          { candidateId: cashCandidateId, bps: cashBps },
          { candidateId: candidate.id, bps: exposureBps },
        ]
      : [{ candidateId: cashCandidateId, bps: 10_000 }],
    evidence: [],
    riskFlags: [],
    expectedNetApyBps: candidate
      ? atomicWeightedApyBps(
          candidate.apyBps,
          split.protocolAtomic,
          policy.principalAtomic,
        )
      : 0,
    action: candidate
      ? {
          kind: "aave-v3-supply",
          candidateId: candidate.id,
          investmentId: candidate.investmentId,
          amountAtomic: split.protocolAtomic,
        }
      : { kind: "abstain", reason: "No market satisfies the policy" },
    validUntil: snapshotExpiry(input),
  };
}

export function createDeterministicSolver(
  options: DeterministicSolverOptions,
): Solver {
  return {
    id: options.solverId,
    address: options.account.address,
    solve: (input) =>
      signBundle(buildDeterministicBundle(input, options), options.account),
  };
}
