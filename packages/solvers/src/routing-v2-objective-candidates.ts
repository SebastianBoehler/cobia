import {
  routeObjectiveV2,
  type RoutePlanV2,
  type RouteSnapshotV2,
  type StablecoinPolicyV2,
} from "@cobia/domain";
import { isAddressEqual } from "viem";
import type { RouteCandidateV2 } from "./routing-v2-candidates";

const BPS_SCALE = 10_000n;
type SwapOpportunity = Extract<
  RouteSnapshotV2["opportunities"][number],
  { kind: "uniswap-v3-exact-input" | "curve-stableswap-ng-exact-input" }
>;
type ExactSwapAction = Extract<
  RoutePlanV2["legs"][number]["actions"][number],
  { kind: "uniswap-v3-exact-input" | "curve-stableswap-ng-exact-input" }
>;

function minimumAfterSlippage(value: string, slippageBps: number): string {
  return ((BigInt(value) * BigInt(10_000 - slippageBps) + BPS_SCALE - 1n) /
    BPS_SCALE).toString();
}

function maximumAtomic(left: string, right: string): string {
  return BigInt(left) >= BigInt(right) ? left : right;
}

function action(
  swap: SwapOpportunity,
  minimumOutputAtomic: string,
  consume: "all" | "exact" = "all",
): ExactSwapAction {
  const common = {
    opportunityId: swap.id,
    consume,
    ...(consume === "exact" ? { inputAtomic: swap.quotedInputAtomic } : {}),
    tokenIn: swap.tokenIn,
    tokenOut: swap.tokenOut,
    quotedOutputAtomic: swap.quotedOutputAtomic,
    minimumOutputAtomic,
  };
  return swap.kind === "curve-stableswap-ng-exact-input"
    ? { ...common, kind: "curve-stableswap-ng-exact-input", pool: swap.pool,
      inputIndex: swap.inputIndex,
      outputIndex: swap.outputIndex, fee: swap.fee }
    : { ...common, kind: "uniswap-v3-exact-input" };
}

function candidate(
  policy: StablecoinPolicyV2,
  id: string,
  actions: [ExactSwapAction] | [ExactSwapAction, ExactSwapAction],
): RouteCandidateV2 {
  return {
    id,
    economics: { estimatedPreGasApyBps: 0, positiveGain: true },
    plan: {
      version: 2,
      inputAsset: policy.asset,
      inputAtomic: policy.principalAtomic,
      retainedAtomic: "0",
      horizonDays: policy.horizonDays,
      legs: [{ id, inputAtomic: policy.principalAtomic, actions }],
    },
  };
}

function executableSwaps(policy: StablecoinPolicyV2, snapshot: RouteSnapshotV2) {
  return snapshot.opportunities.filter((value): value is SwapOpportunity =>
    (value.kind === "uniswap-v3-exact-input" ||
      value.kind === "curve-stableswap-ng-exact-input") &&
    policy.allowedAdapters.includes(value.adapterId));
}

export function objectiveRouteCandidatesV2(
  policy: StablecoinPolicyV2,
  snapshot: RouteSnapshotV2,
): RouteCandidateV2[] {
  const objective = routeObjectiveV2(policy);
  if (objective.kind === "earn") return [];
  const swaps = executableSwaps(policy, snapshot);
  if (objective.kind === "swap") {
    return swaps.filter((swap) =>
      isAddressEqual(swap.tokenIn, policy.asset) &&
      isAddressEqual(swap.tokenOut, objective.outputAsset) &&
      swap.quotedInputAtomic === policy.principalAtomic &&
      BigInt(swap.quotedOutputAtomic) >= BigInt(objective.minimumOutputAtomic)
    ).sort((left, right) => {
      const leftOutput = BigInt(left.quotedOutputAtomic);
      const rightOutput = BigInt(right.quotedOutputAtomic);
      return leftOutput === rightOutput ? left.id.localeCompare(right.id) :
        leftOutput > rightOutput ? -1 : 1;
    }).map((swap) => candidate(policy, `terminal:${swap.id}`, [
      action(swap, maximumAtomic(
        objective.minimumOutputAtomic,
        minimumAfterSlippage(swap.quotedOutputAtomic, policy.maxSlippageBps),
      )),
    ]));
  }

  const candidates: Array<{ candidate: RouteCandidateV2; outputAtomic: bigint }> = [];
  for (const first of swaps) {
    if (!isAddressEqual(first.tokenIn, policy.asset) ||
      first.quotedInputAtomic !== policy.principalAtomic) continue;
    const conservativeOutput = minimumAfterSlippage(
      first.quotedOutputAtomic, policy.maxSlippageBps,
    );
    for (const second of swaps) {
      if (!isAddressEqual(second.tokenIn, first.tokenOut) ||
        !isAddressEqual(second.tokenOut, policy.asset) ||
        second.quotedInputAtomic !== conservativeOutput ||
        BigInt(second.quotedOutputAtomic) < BigInt(objective.minimumFinalAtomic)) continue;
      candidates.push({
        candidate: candidate(policy, `round-trip:${first.id}:${second.id}`, [
          action(first, conservativeOutput),
          action(second, maximumAtomic(
            objective.minimumFinalAtomic,
            minimumAfterSlippage(second.quotedOutputAtomic, policy.maxSlippageBps),
          ), "exact"),
        ]),
        outputAtomic: BigInt(second.quotedOutputAtomic),
      });
    }
  }
  return candidates.sort((left, right) => {
    return left.outputAtomic === right.outputAtomic
      ? left.candidate.id.localeCompare(right.candidate.id)
      : left.outputAtomic > right.outputAtomic ? -1 : 1;
  }).map(({ candidate: value }) => value);
}
