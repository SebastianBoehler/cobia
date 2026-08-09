import {
  commitment,
  type DecisionBundle,
  type MarketCandidate,
} from "@cobia/domain";
import type { LocalAccount } from "viem";
import { signBundle } from "./sign";
import type { Solver, SolverInput } from "./types";

interface DeterministicSolverOptions {
  solverId: string;
  account: LocalAccount;
}

type AaveCandidate = Extract<MarketCandidate, { kind: "aave-v3" }>;

function expectedNetApy(apyBps: number, exposureBps: number): number {
  return Math.floor((apyBps * exposureBps) / 10_000);
}

function selectCandidate(input: SolverInput): AaveCandidate | undefined {
  const { policy, snapshot } = input;
  return snapshot.candidates
    .filter((candidate): candidate is AaveCandidate => {
      if (candidate.kind !== "aave-v3") return false;
      if (BigInt(candidate.tvlUsdE6) < BigInt(policy.minTvlUsdE6)) return false;
      return (
        expectedNetApy(candidate.apyBps, policy.maxProtocolExposureBps) >=
        policy.minNetApyBps
      );
    })
    .sort(
      (left, right) =>
        right.apyBps - left.apyBps || left.id.localeCompare(right.id),
    )[0];
}

function snapshotExpiry(input: SolverInput): number {
  const capturedAtSec = Date.parse(input.snapshot.capturedAt) / 1_000;
  return Math.min(
    input.policy.deadline,
    capturedAtSec + input.policy.maxSnapshotAgeSec,
  );
}

async function solve(
  input: SolverInput,
  options: DeterministicSolverOptions,
): Promise<DecisionBundle> {
  const { policy, snapshot } = input;
  const candidate = selectCandidate(input);
  const cashCandidates = snapshot.candidates.filter(
    (item) => item.kind === "cash",
  );
  if (cashCandidates.length !== 1) {
    throw new Error("Snapshot must contain exactly one cash candidate");
  }
  const cashCandidateId = cashCandidates[0].id;
  const exposureBps = candidate ? policy.maxProtocolExposureBps : 0;
  const cashBps = 10_000 - exposureBps;
  const amountAtomic = (
    (BigInt(policy.principalAtomic) * BigInt(exposureBps)) /
    10_000n
  ).toString();

  return signBundle(
    {
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
        ? expectedNetApy(candidate.apyBps, exposureBps)
        : 0,
      action: candidate
        ? {
            kind: "aave-v3-supply",
            candidateId: candidate.id,
            investmentId: candidate.investmentId,
            amountAtomic,
          }
        : { kind: "abstain", reason: "No market satisfies the policy" },
      validUntil: snapshotExpiry(input),
    },
    options.account,
  );
}

export function createDeterministicSolver(
  options: DeterministicSolverOptions,
): Solver {
  return {
    id: options.solverId,
    address: options.account.address,
    solve: (input) => solve(input, options),
  };
}
