import {
  CapabilityCompositionPolicyV1Schema,
  CapabilityCompositionSnapshotV1Schema,
  commitment,
  type CapabilityCompositionPolicyV1,
  type CapabilityCompositionSnapshotV1,
} from "@cobia/domain";
import type { SolverDecisionV1, SolverIntentV1 } from "@cobia/solver-sdk";
import {
  CapabilityProgramV2Schema,
  type CapabilityActionV1,
} from "@cobia/solvers";
import { isAddressEqual, type Address } from "viem";
import { PROTOCOL_REGISTRY } from "../../../apps/web/lib/adapters/registry";
import { productionCapabilityRegistryV1 } from "../../../apps/web/lib/capabilities/registry";
import { replayCapabilityProgramOnForkV2 } from
  "../../../apps/web/lib/coding-agent-sandbox/capability-fork-replay-v2";
import { deriveCompositionAuthorityV1 } from
  "../../../apps/web/lib/open-exchange/composition-authority";
import { startLocalFork } from "./local-fork";

interface Candidate {
  key: string;
  scoreUsdE8: bigint;
  inputAtomic: string;
  actions: CapabilityActionV1[];
  balanceConstraints: Array<{
    kind: "minimumIncrease";
    token: Address;
    atomic: string;
  }>;
}

function valueUsdE8(
  snapshot: CapabilityCompositionSnapshotV1,
  token: Address,
  atomic: string,
) {
  const valuation = snapshot.route.valuations.find(({ asset }) =>
    isAddressEqual(asset, token));
  if (!valuation) return undefined;
  return BigInt(atomic) * BigInt(valuation.priceUsdE8) /
    10n ** BigInt(valuation.decimals);
}

function receiptToken(asset: Address) {
  return Object.values(PROTOCOL_REGISTRY.aaveV3.assets).find(({ underlying }) =>
    isAddressEqual(underlying.address, asset))?.aToken.address;
}

function allowed(policy: CapabilityCompositionPolicyV1, id: string) {
  return policy.allowedCapabilities.some((item) => item.id === id && item.version === 1);
}

function netScore(
  snapshot: CapabilityCompositionSnapshotV1,
  terminalUsdE8: bigint,
  expectedGas: number,
  solverFeeAtomic: string,
) {
  const nativePrice = BigInt(snapshot.gas.nativePriceUsdE8);
  const gasUsdE8 = BigInt(expectedGas) * BigInt(snapshot.gas.priceAtomic) *
    nativePrice / 10n ** 18n;
  const feeUsdE8 = BigInt(solverFeeAtomic) * nativePrice / 10n ** 18n;
  const value = terminalUsdE8 - gasUsdE8 - feeUsdE8;
  return value > 0n ? value : 0n;
}

export function selectCompositionCandidate(
  policyInput: unknown,
  snapshotInput: unknown,
): Candidate | undefined {
  const policy = CapabilityCompositionPolicyV1Schema.parse(policyInput);
  const snapshot = CapabilityCompositionSnapshotV1Schema.parse(snapshotInput);
  if (policy.requestId !== snapshot.requestId || policy.manifestHash !== snapshot.manifestHash ||
      !allowed(policy, "aave-v3.supply")) return undefined;
  const inputValue = valueUsdE8(snapshot, policy.input.token, policy.input.maxAtomic);
  if (!inputValue) return undefined;
  const loss = policy.constraints.find((item) => item.kind === "maximum-conversion-loss")!;
  const floor = policy.constraints.find((item) =>
    item.kind === "minimum-registered-receipt-value")!;
  const candidates: Candidate[] = [];

  for (const supply of snapshot.route.opportunities.filter((item) =>
    item.kind === "aave-v3-supply")) {
    const aToken = receiptToken(supply.asset);
    const outputValue = valueUsdE8(snapshot, supply.asset, supply.validatedSupplyAtomic);
    if (!aToken || !outputValue) continue;
    const receiptAtomic = (BigInt(supply.validatedSupplyAtomic) > 1n
      ? BigInt(supply.validatedSupplyAtomic) - 1n
      : BigInt(supply.validatedSupplyAtomic)).toString();
    const receiptValue = valueUsdE8(snapshot, supply.asset, receiptAtomic);
    if (!receiptValue || receiptValue * 10_000n < inputValue * BigInt(floor.minimumValueBps)) {
      continue;
    }
    const terminal: CapabilityActionV1 = {
      capabilityId: "aave-v3.supply", capabilityVersion: 1, valueAtomic: "0",
      parameters: { asset: supply.asset, amountAtomic: supply.validatedSupplyAtomic },
    };
    const yieldValue = outputValue * BigInt(supply.supplyRateBps) *
      BigInt(policy.objective.horizonDays) / (365n * 10_000n);
    const terminalUsdE8 = outputValue + yieldValue;
    const balanceConstraints = [{ kind: "minimumIncrease" as const,
      token: aToken.toLowerCase() as Address, atomic: receiptAtomic }];

    if (isAddressEqual(supply.asset, policy.input.token) &&
        supply.validatedSupplyAtomic === policy.input.maxAtomic && supply.supplyRateBps > 0) {
      const scoreUsdE8 = netScore(snapshot, terminalUsdE8, 500_000,
        policy.limits.maxSolverFeeAtomic);
      if (scoreUsdE8 > 0n) candidates.push({ key: `direct:${supply.id}`, scoreUsdE8,
        inputAtomic: policy.input.maxAtomic, actions: [terminal], balanceConstraints });
    }
    for (const swap of snapshot.route.opportunities.filter((item) =>
      item.kind === "curve-stableswap-ng-exact-input" || item.kind === "uniswap-v3-exact-input")) {
      const capabilityId = swap.kind === "curve-stableswap-ng-exact-input"
        ? "curve-stableswap-ng.exact-input" : "uniswap-v3.exact-input";
      if (!allowed(policy, capabilityId) || !isAddressEqual(swap.tokenIn, policy.input.token) ||
          !isAddressEqual(swap.tokenOut, supply.asset) ||
          swap.quotedInputAtomic !== policy.input.maxAtomic ||
          swap.quotedOutputAtomic !== supply.validatedSupplyAtomic ||
          outputValue * 10_000n < inputValue * BigInt(10_000 - loss.maximumLossBps) ||
          supply.supplyRateBps <= 0) continue;
      const scoreUsdE8 = netScore(snapshot, terminalUsdE8, 1_200_000,
        policy.limits.maxSolverFeeAtomic);
      if (scoreUsdE8 === 0n) continue;
      candidates.push({ key: `${capabilityId}:${swap.id}:${supply.id}`, scoreUsdE8,
        inputAtomic: policy.input.maxAtomic,
        actions: [{ capabilityId, capabilityVersion: 1, valueAtomic: "0",
          parameters: { tokenIn: swap.tokenIn, tokenOut: swap.tokenOut,
            amountInAtomic: swap.quotedInputAtomic,
            minimumOutputAtomic: swap.quotedOutputAtomic } }, terminal],
        balanceConstraints });
    }
  }
  return candidates.sort((left, right) => left.scoreUsdE8 === right.scoreUsdE8
    ? left.key.localeCompare(right.key) : left.scoreUsdE8 > right.scoreUsdE8 ? -1 : 1)[0];
}

export async function solveComposition(intent: SolverIntentV1): Promise<SolverDecisionV1> {
  if (intent.policy.kind !== "capability-composition" ||
      intent.snapshot.kind !== "capability-composition") {
    return { version: 1, decision: "abstain", reasonCode: "UNSUPPORTED_COMPOSITION" };
  }
  const selected = selectCompositionCandidate(intent.policy, intent.snapshot);
  if (!selected) return { version: 1, decision: "abstain", reasonCode: "NO_POSITIVE_ROUTE" };
  const executor = process.env.COBIA_EXECUTOR_V3_ADDRESS as Address | undefined;
  const upstreamRpc = process.env.XLAYER_RPC_URL;
  if (!executor || !upstreamRpc) {
    return { version: 1, decision: "abstain", reasonCode: "REFERENCE_RUNTIME_UNAVAILABLE" };
  }
  const authority = deriveCompositionAuthorityV1(intent.policy, intent.snapshot, selected);
  const capturedAtSec = Math.floor(Date.parse(intent.snapshot.capturedAt) / 1_000);
  const deadline = Math.min(intent.policy.deadline,
    capturedAtSec + intent.policy.maxEvidenceAgeSec);
  if (deadline <= Math.floor(Date.now() / 1_000)) {
    return { version: 1, decision: "abstain", reasonCode: "SNAPSHOT_EXPIRED" };
  }
  const program = CapabilityProgramV2Schema.parse({
    version: 2, kind: "general-onchain", requestId: intent.id, chainId: 196,
    policyHash: commitment(authority.policy), manifestHash: authority.policy.manifestHash,
    owner: intent.policy.owner, executor,
    pinnedBlock: { number: authority.snapshot.blockNumber, hash: authority.snapshot.blockHash },
    deadline, nonce: intent.policy.nonce,
    input: { token: intent.policy.input.token, atomic: selected.inputAtomic },
    actions: selected.actions, balanceConstraints: selected.balanceConstraints,
    predicates: authority.policy.predicates, objective: authority.policy.objective,
  });
  const compiled = program.actions.map((action, actionIndex) => {
    const module = productionCapabilityRegistryV1.resolve(action.capabilityId,
      action.capabilityVersion);
    return module.compile({ program, actionIndex,
      parameters: module.parseParameters(action.parameters), manifest: authority.manifest });
  });
  const fork = await startLocalFork({ upstreamRpc, blockNumber: authority.snapshot.blockNumber,
    ...(process.env.ANVIL_PORT ? { port: Number(process.env.ANVIL_PORT) } : {}) });
  try {
    const replay = await replayCapabilityProgramOnForkV2({ program, compiled,
      forkRpc: fork.rpc, read: fork.read });
    return { version: 1, decision: "submit", proposalKind: "capability-v2", program,
      evidence: { version: 2, kind: "general-onchain", programHash: commitment(program),
        chainId: 196, blockNumber: authority.snapshot.blockNumber,
        blockHash: authority.snapshot.blockHash, traceHash: replay.traceHash,
        stateDiffHash: replay.stateDiffHash, eventsHash: replay.eventsHash,
        balanceDeltas: replay.balanceDeltas, deployments: replay.deployments,
        observations: replay.observations,
        ...(replay.objective ? { objective: replay.objective } : {}) },
      provenance: { version: 1, runner: "cobia-reference-composition@1",
        dependencies: [{ name: "anvil", version: "1.7.1" }], sources: [],
        commandHashes: [], generatedFiles: [] } };
  } finally { await fork.stop(); }
}
