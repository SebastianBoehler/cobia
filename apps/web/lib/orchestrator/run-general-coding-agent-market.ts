import { commitment, type GeneralIntentPolicyV2, type GeneralIntentSnapshotV1 } from "@cobia/domain";
import type { Address } from "viem";
import type { CoordinateCapabilityDependenciesV2 } from "../coding-agent-sandbox/coordinator-v2";
import { coordinateCapabilityProgramV2 } from "../coding-agent-sandbox/coordinator-v2";
import type { CoordinateCapabilityInputV1 } from "../coding-agent-sandbox/coordinator";

interface GeneralRequestStore {
  createRequest(policy: GeneralIntentPolicyV2): Promise<void>;
  saveSnapshot(requestId: string, snapshot: GeneralIntentSnapshotV1): Promise<void>;
  finishMarket(requestId: string, state: "agent_ready"): Promise<void>;
  failRequest(requestId: string): Promise<void>;
}

export interface RunGeneralCodingAgentMarketDependenciesV1 {
  repository: GeneralRequestStore;
  assertReady(policy: GeneralIntentPolicyV2): Promise<void>;
  captureSnapshot(policy: GeneralIntentPolicyV2): Promise<GeneralIntentSnapshotV1>;
  capturePortfolio(input: {
    owner: Address;
    executor: Address;
    block: { number: string; hash: `0x${string}` };
  }): Promise<CoordinateCapabilityInputV1["portfolio"]>;
  manifest: unknown;
  executor: Address;
  coordinate?: (
    input: CoordinateCapabilityInputV1,
    dependencies?: CoordinateCapabilityDependenciesV2,
  ) => Promise<{ jobId: string; [key: string]: unknown }>;
  coordinatorDependencies?: CoordinateCapabilityDependenciesV2;
}

export async function runGeneralCodingAgentMarketV1(
  policy: GeneralIntentPolicyV2,
  dependencies: RunGeneralCodingAgentMarketDependenciesV1,
) {
  await dependencies.assertReady(policy);
  await dependencies.repository.createRequest(policy);
  try {
    const snapshot = await dependencies.captureSnapshot(policy);
    await dependencies.repository.saveSnapshot(policy.requestId, snapshot);
    const portfolio = await dependencies.capturePortfolio({
      owner: policy.owner,
      executor: dependencies.executor,
      block: { number: snapshot.blockNumber, hash: snapshot.blockHash },
    });
    if (!dependencies.coordinatorDependencies && !dependencies.coordinate) {
      throw new Error("General coding-agent coordinator dependencies are unavailable");
    }
    const coordinateInput: CoordinateCapabilityInputV1 = {
      job: {
        requestId: policy.requestId,
        owner: policy.owner,
        policyHash: commitment(policy),
        snapshotHash: commitment(snapshot),
        manifestHash: policy.manifestHash,
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
      : await coordinateCapabilityProgramV2(
          coordinateInput,
          dependencies.coordinatorDependencies as CoordinateCapabilityDependenciesV2,
        );
    await dependencies.repository.finishMarket(policy.requestId, "agent_ready");
    return result;
  } catch (error) {
    await dependencies.repository.failRequest(policy.requestId);
    throw error;
  }
}
