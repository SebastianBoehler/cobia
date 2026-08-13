import { commitment, type StablecoinPolicyV2 } from "@cobia/domain";
import type { Address } from "viem";
import type {
  CoordinateCapabilityDependenciesV1,
  CoordinateCapabilityInputV1,
} from "../coding-agent-sandbox/coordinator";
import { coordinateCapabilityProgramV1 } from "../coding-agent-sandbox/coordinator";

interface RequestStore {
  createRequest(policy: StablecoinPolicyV2): Promise<void>;
  saveSnapshot(requestId: string, snapshot: unknown): Promise<void>;
  finishMarket(requestId: string, state: "agent_ready"): Promise<void>;
  failRequest(requestId: string): Promise<void>;
}

export interface RunCodingAgentMarketDependenciesV2 {
  repository: RequestStore;
  captureSnapshot(policy: StablecoinPolicyV2): Promise<{
    blockNumber: string;
    blockHash: string;
    adapterRegistryHash: string;
  }>;
  capturePortfolio(input: {
    owner: Address;
    executor: Address;
    block: { number: string; hash: `0x${string}` };
  }): Promise<CoordinateCapabilityInputV1["portfolio"]>;
  manifest: unknown;
  executor: Address;
  coordinate?: (
    input: CoordinateCapabilityInputV1,
    dependencies?: CoordinateCapabilityDependenciesV1,
  ) => Promise<{ jobId: string; [key: string]: unknown }>;
  coordinatorDependencies?: CoordinateCapabilityDependenciesV1;
}

export async function runCodingAgentMarketV2(
  policy: StablecoinPolicyV2,
  dependencies: RunCodingAgentMarketDependenciesV2,
) {
  await dependencies.repository.createRequest(policy);
  try {
    const snapshot = await dependencies.captureSnapshot(policy);
    await dependencies.repository.saveSnapshot(policy.requestId, snapshot);
    const portfolio = await dependencies.capturePortfolio({
      owner: policy.owner,
      executor: dependencies.executor,
      block: { number: snapshot.blockNumber, hash: snapshot.blockHash as `0x${string}` },
    });
    if (!dependencies.coordinatorDependencies && !dependencies.coordinate) {
      throw new Error("Coding-agent coordinator dependencies are unavailable");
    }
    const coordinateInput: CoordinateCapabilityInputV1 = {
      job: {
        requestId: policy.requestId,
        owner: policy.owner,
        policyHash: commitment(policy),
        snapshotHash: commitment(snapshot),
        manifestHash: snapshot.adapterRegistryHash,
        blockNumber: snapshot.blockNumber,
        blockHash: snapshot.blockHash,
      },
      policy,
      snapshot,
      portfolio,
      manifest: dependencies.manifest,
      executor: dependencies.executor,
    };
    const result = dependencies.coordinate
      ? await dependencies.coordinate(coordinateInput, dependencies.coordinatorDependencies)
      : await coordinateCapabilityProgramV1(
          coordinateInput,
          dependencies.coordinatorDependencies as CoordinateCapabilityDependenciesV1,
        );
    await dependencies.repository.finishMarket(policy.requestId, "agent_ready");
    return result;
  } catch (error) {
    await dependencies.repository.failRequest(policy.requestId);
    throw error;
  }
}
