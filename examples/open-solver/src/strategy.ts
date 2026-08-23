import { commitment } from "@cobia/domain";
import type { SolverDecisionV1, SolverIntentV1 } from "@cobia/solver-sdk";
import { CapabilityProgramV2Schema } from "@cobia/solvers";
import { isAddressEqual, type Address } from "viem";
import { PROTOCOL_REGISTRY } from "../../../apps/web/lib/adapters/registry";
import { productionCapabilityRegistryV1 } from "../../../apps/web/lib/capabilities/registry";
import { replayCapabilityProgramOnForkV2 } from
  "../../../apps/web/lib/coding-agent-sandbox/capability-fork-replay-v2";
import { deriveCapabilityAuthorityV2 } from "../../../apps/web/lib/open-exchange/capability-authority";
import { startLocalFork } from "./local-fork";
import { solveRegisteredInstrument } from "./rwa-strategy";
import { buildSwapActions } from "./swap-routes";
import { solveComposition } from "./composition-strategy";
import { solveTransactionIntent } from "./transaction-strategy";

function aaveAsset(input: Address, output: Address) {
  return Object.values(PROTOCOL_REGISTRY.aaveV3.assets).find(({ underlying, aToken }) =>
    isAddressEqual(underlying.address, input) && isAddressEqual(aToken.address, output));
}

function registeredSwap(input: Address, output: Address) {
  const assets = Object.values(PROTOCOL_REGISTRY.aaveV3.assets);
  return assets.some(({ underlying }) => isAddressEqual(underlying.address, input)) &&
    assets.some(({ underlying }) => isAddressEqual(underlying.address, output));
}

/** Reference lane: a real, fork-replayed Aave supply. Other solvers remain free to use transaction programs. */
export async function solve(intent: SolverIntentV1): Promise<SolverDecisionV1> {
  if (intent.policy.kind === "capability-composition") return solveComposition(intent);
  const input = intent.policy.inputs[0];
  const outcome = intent.policy.outcomes[0];
  if (input && intent.policy.inputs.length === 1 && intent.policy.outcomes.length === 1 &&
      outcome?.kind === "registered-instrument") {
    return solveRegisteredInstrument(intent, input, outcome);
  }
  const supportedCapability = input && outcome?.kind === "minimum-increase" &&
    (Boolean(aaveAsset(input.token, outcome.token)) || registeredSwap(input.token, outcome.token));
  if (!supportedCapability) {
    const transaction = await solveTransactionIntent(intent);
    if (transaction) return transaction;
  }
  if (!input || intent.policy.inputs.length !== 1 || intent.policy.outcomes.length !== 1 ||
      outcome?.kind !== "minimum-increase" ||
      !supportedCapability) {
    return { version: 1, decision: "abstain", reasonCode: "NO_SUPPORTED_REFERENCE_ROUTE" };
  }
  if (!intent.snapshot || intent.snapshot.kind !== "open-onchain") {
    return { version: 1, decision: "abstain", reasonCode: "SNAPSHOT_KIND_MISMATCH" };
  }
  const executor = process.env.COBIA_EXECUTOR_V3_ADDRESS as Address | undefined;
  const upstreamRpc = process.env.XLAYER_RPC_URL;
  if (!executor || !upstreamRpc) {
    return { version: 1, decision: "abstain", reasonCode: "REFERENCE_RUNTIME_UNAVAILABLE" };
  }
  const authority = deriveCapabilityAuthorityV2(intent.policy, intent.snapshot);
  const deadline = Math.min(intent.policy.deadline,
    Math.floor(Date.parse(authority.snapshot.capturedAt) / 1_000) + intent.policy.maxEvidenceAgeSec);
  if (deadline <= Math.floor(Date.now() / 1_000)) {
    return { version: 1, decision: "abstain", reasonCode: "SNAPSHOT_EXPIRED" };
  }
  const supply = Boolean(aaveAsset(input.token, outcome.token));
  const actions = supply ? [{
    capabilityId: "aave-v3.supply", capabilityVersion: 1 as const,
    valueAtomic: "0", parameters: { asset: input.token, amountAtomic: input.maximumAtomic },
  }] : await buildSwapActions({
    rpcUrl: upstreamRpc,
    block: { number: BigInt(authority.snapshot.blockNumber), hash: authority.snapshot.blockHash,
      timestamp: BigInt(Math.floor(Date.parse(authority.snapshot.capturedAt) / 1_000)) },
    inputToken: input.token,
    outputToken: outcome.token,
    inputAtomic: BigInt(input.maximumAtomic),
    minimumOutputAtomic: BigInt(outcome.atomic),
  });
  if (!actions) {
    return { version: 1, decision: "abstain",
      reasonCode: isAddressEqual(input.token, outcome.token)
        ? "NO_PROFITABLE_ROUTE" : "NO_VERIFIED_SWAP_ROUTE" };
  }
  const program = CapabilityProgramV2Schema.parse({
    version: 2, kind: "general-onchain", requestId: intent.id, chainId: 196,
    policyHash: commitment(authority.policy), manifestHash: authority.policy.manifestHash,
    owner: intent.policy.owner, executor,
    pinnedBlock: { number: authority.snapshot.blockNumber, hash: authority.snapshot.blockHash },
    deadline, nonce: intent.policy.nonce,
    input: { token: input.token, atomic: input.maximumAtomic },
    actions,
    balanceConstraints: authority.policy.balanceConstraints,
    predicates: authority.policy.predicates,
    objective: authority.policy.objective,
  });
  const compiled = program.actions.map((action, actionIndex) => {
    const module = productionCapabilityRegistryV1.resolve(
      action.capabilityId,
      action.capabilityVersion,
    );
    return module.compile({ program, actionIndex,
      parameters: module.parseParameters(action.parameters), manifest: authority.manifest });
  });
  const fork = await startLocalFork({ upstreamRpc, blockNumber: authority.snapshot.blockNumber,
    ...(process.env.ANVIL_PORT ? { port: Number(process.env.ANVIL_PORT) } : {}) });
  try {
    const replay = await replayCapabilityProgramOnForkV2({ program, compiled,
      forkRpc: fork.rpc, read: fork.read });
    return {
      version: 1, decision: "submit", proposalKind: "capability-v2", program,
      evidence: { version: 2, kind: "general-onchain", programHash: commitment(program),
        chainId: 196, blockNumber: authority.snapshot.blockNumber,
        blockHash: authority.snapshot.blockHash, traceHash: replay.traceHash,
        stateDiffHash: replay.stateDiffHash, eventsHash: replay.eventsHash,
        balanceDeltas: replay.balanceDeltas, deployments: replay.deployments,
        observations: replay.observations, ...(replay.objective ? { objective: replay.objective } : {}) },
      provenance: { version: 1, runner: `cobia-reference-${supply ? "aave" : "swap"}@2`,
        dependencies: [{ name: "anvil", version: "1.7.1" }], sources: [],
        commandHashes: [], generatedFiles: [] },
    };
  } finally {
    await fork.stop();
  }
}
