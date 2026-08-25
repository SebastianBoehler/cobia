import { isNativeAssetAddress } from "@cobia/domain";
import type { SolverDecisionV1, SolverIntentV1 } from "@cobia/solver-sdk";
import type { ProviderArtifactV1 } from "@cobia/solvers";
import { isAddress, type Address } from "viem";
import { z } from "zod";
import {
  buildOkxRouteStage, fetchOkxRouteArtifact, okxMinimumOutputAtomic,
} from "./okx-route";
import { finalizeXLayerTransaction } from "./transaction-decision";

const AddressSchema = z.string().refine(isAddress).transform(
  (value) => value.toLowerCase() as Address,
);
const PositiveAtomicSchema = z.string().regex(/^[1-9][0-9]*$/).max(78);

export const TransactionAllocationPlanV1Schema = z.object({
  routes: z.array(z.object({
    inputToken: AddressSchema,
    outputToken: AddressSchema,
    inputAtomic: PositiveAtomicSchema,
  }).strict()).min(1).max(16),
}).strict();

export type TransactionAllocationPlanV1 = z.infer<typeof TransactionAllocationPlanV1Schema>;

export interface AllocationDependencies {
  nowSec(): number;
  fetchOkxArtifact(input: {
    owner: Address;
    inputToken: Address;
    outputToken: Address;
    inputAtomic: string;
    slippagePercent: string;
    stageId: string;
  }): Promise<unknown>;
  finalize(input: {
    intent: SolverIntentV1;
    stages: unknown[];
    artifacts: ProviderArtifactV1[];
    runner: string;
    nowSec: number;
  }): Promise<SolverDecisionV1>;
}

function defaultDependencies(): AllocationDependencies {
  return {
    nowSec: () => Math.floor(Date.now() / 1_000),
    async fetchOkxArtifact(input) {
      const apiKey = process.env.OKX_API_KEY;
      const secretKey = process.env.OKX_SECRET_KEY;
      const passphrase = process.env.OKX_PASSPHRASE;
      if (!apiKey || !secretKey || !passphrase) throw new Error("OKX credentials are unavailable");
      return fetchOkxRouteArtifact({ ...input, credentials: { apiKey, secretKey, passphrase } });
    },
    finalize: finalizeXLayerTransaction,
  };
}

const abstain = (reasonCode: string): SolverDecisionV1 => ({
  version: 1, decision: "abstain", reasonCode,
});

function add(map: Map<string, bigint>, token: string, amount: bigint) {
  const key = token.toLowerCase();
  map.set(key, (map.get(key) ?? 0n) + amount);
}

function setMaximum(map: Map<string, bigint>, token: string, amount: bigint) {
  const key = token.toLowerCase();
  map.set(key, amount > (map.get(key) ?? 0n) ? amount : map.get(key)!);
}

export async function solveTransactionAllocation(
  intent: SolverIntentV1,
  rawPlan: unknown,
  dependencies: AllocationDependencies = defaultDependencies(),
): Promise<SolverDecisionV1 | undefined> {
  if (intent.policy.kind !== "open-onchain" || intent.snapshot?.kind !== "open-onchain") return;
  const parsed = TransactionAllocationPlanV1Schema.safeParse(rawPlan);
  if (!parsed.success) return abstain("INVALID_ALLOCATION_PLAN");
  const policy = intent.policy;
  const outcomes = policy.outcomes.flatMap((outcome) => outcome.kind === "minimum-increase"
    ? [{ chainId: outcome.chainId, token: outcome.token, atomic: outcome.atomic }]
    : []);
  if (outcomes.length !== policy.outcomes.length ||
      policy.inputs.some(({ chainId }) => chainId !== 196) ||
      outcomes.some(({ chainId }) => chainId !== 196)) return abstain("UNSUPPORTED_ALLOCATION_POLICY");
  const routes = parsed.data.routes;
  const approvalCount = routes.filter(({ inputToken }) => !isNativeAssetAddress(inputToken)).length;
  if (routes.length < (policy.limits.minimumStages ?? 1) ||
      routes.length > policy.limits.maxStages || routes.length > policy.limits.maxTransactions ||
      approvalCount > policy.limits.maxApprovals) return abstain("INVALID_ALLOCATION_PLAN");

  const inputCaps = new Map(policy.inputs.map(({ token, maximumAtomic }) =>
    [token.toLowerCase(), BigInt(maximumAtomic)]));
  const outputFloors = new Map<string, bigint>();
  for (const { token, atomic } of outcomes) setMaximum(outputFloors, token, BigInt(atomic));
  const plannedInputs = new Map<string, bigint>();
  for (const route of routes) {
    if (!inputCaps.has(route.inputToken) || !outputFloors.has(route.outputToken)) {
      return abstain("INVALID_ALLOCATION_PLAN");
    }
    add(plannedInputs, route.inputToken, BigInt(route.inputAtomic));
  }
  if ([...plannedInputs].some(([token, amount]) => amount > inputCaps.get(token)!)) {
    return abstain("ALLOCATION_INPUT_LIMIT_EXCEEDED");
  }
  const nativeMaximum = policy.limits.maxNativeValueAtomicByChain
    .find(({ chainId }) => chainId === 196)?.atomic ?? "0";
  const nativePlanned = routes.filter(({ inputToken }) => isNativeAssetAddress(inputToken))
    .reduce((sum, { inputAtomic }) => sum + BigInt(inputAtomic), 0n);
  if (nativePlanned > BigInt(nativeMaximum)) return abstain("ALLOCATION_INPUT_LIMIT_EXCEEDED");

  try {
    const quoted = await Promise.all(routes.map(async (route, index) => {
      const stageId = `${String(index + 1).padStart(2, "0")}-okx-swap`;
      const artifact = await dependencies.fetchOkxArtifact({ owner: policy.owner,
        ...route, slippagePercent: "0.5", stageId });
      const minimumOutputAtomic = okxMinimumOutputAtomic(artifact);
      const built = buildOkxRouteStage({ artifact, owner: policy.owner, ...route,
        minimumOutputAtomic });
      return { ...built, outputToken: route.outputToken, minimumOutputAtomic };
    }));
    const quotedOutputs = new Map<string, bigint>();
    for (const route of quoted) {
      add(quotedOutputs, route.outputToken, BigInt(route.minimumOutputAtomic));
    }
    if ([...outputFloors].some(([token, floor]) => (quotedOutputs.get(token) ?? 0n) < floor)) {
      return abstain("NO_VERIFIED_OKX_ROUTE");
    }
    return dependencies.finalize({ intent, nowSec: dependencies.nowSec(),
      stages: quoted.map(({ stage }) => stage),
      artifacts: quoted.map(({ providerArtifact }) => providerArtifact),
      runner: "cobia-reference-okx-allocation@1" });
  } catch {
    return abstain("NO_VERIFIED_OKX_ROUTE");
  }
}
