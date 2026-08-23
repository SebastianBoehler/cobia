import { commitment, type GeneralAssetStageV1 } from "@cobia/domain";
import type {
  CompiledGeneralAssetStageV1,
  GeneralAssetStageReplayV1,
} from "@cobia/solvers";
import type { Address, Hash } from "viem";

interface StageAnchorV1 {
  chainId: 1 | 196;
  blockNumber: string;
  blockHash: Hash;
}

interface SimulatedGeneralAssetStageV1 {
  executedCallHash: Hash;
  success: boolean;
  gasUsed: string;
  ownerAssetDeltas: GeneralAssetStageReplayV1["ownerAssetDeltas"];
  endingAllowances: GeneralAssetStageReplayV1["endingAllowances"];
  traceHash: Hash;
  stateDiffHash: Hash;
}

export interface GeneralAssetForkV1 {
  getChainId(): Promise<number>;
  getBlockHash(blockNumber: string): Promise<Hash | undefined>;
  getCodeHash(address: Address, blockNumber: string): Promise<Hash | undefined>;
  simulate(input: {
    stage: GeneralAssetStageV1;
    compiled: CompiledGeneralAssetStageV1;
    anchor: StageAnchorV1;
  }): Promise<SimulatedGeneralAssetStageV1>;
}

function matchesStage(stage: GeneralAssetStageV1, compiled: CompiledGeneralAssetStageV1): boolean {
  return compiled.stageId === stage.stageId && compiled.chainId === stage.chainId &&
    compiled.target === stage.target && compiled.targetRuntimeCodeHash === stage.targetRuntimeCodeHash &&
    compiled.data === stage.calldata && compiled.valueAtomic === stage.nativeValueAtomic &&
    commitment(compiled.approvals) === commitment(stage.approvals) &&
    commitment(compiled.refundTokens) === commitment(stage.refundTokens);
}

export async function replayGeneralAssetStageV1(input: {
  stage: GeneralAssetStageV1;
  compiled: CompiledGeneralAssetStageV1;
  anchor: StageAnchorV1;
  fork: GeneralAssetForkV1;
}): Promise<GeneralAssetStageReplayV1> {
  if (input.stage.chainId !== input.anchor.chainId || !matchesStage(input.stage, input.compiled)) {
    throw new Error("General asset stage compilation does not match the pinned stage");
  }
  if (await input.fork.getChainId() !== input.stage.chainId) {
    throw new Error("General asset fork chain does not match the stage");
  }
  if (await input.fork.getBlockHash(input.anchor.blockNumber) !== input.anchor.blockHash) {
    throw new Error("General asset fork anchor hash changed");
  }
  if (await input.fork.getCodeHash(input.compiled.target, input.anchor.blockNumber) !==
      input.compiled.targetRuntimeCodeHash) {
    throw new Error("General asset adapter code identity changed");
  }
  const simulation = await input.fork.simulate(input);
  const compiledCallHash = commitment(input.compiled) as Hash;
  return {
    stageId: input.stage.stageId,
    chainId: input.stage.chainId,
    blockNumber: input.anchor.blockNumber,
    blockHash: input.anchor.blockHash,
    compiledCallHash,
    matchesCompiledCalls: simulation.executedCallHash === compiledCallHash,
    success: simulation.success,
    gasUsed: simulation.gasUsed,
    ownerAssetDeltas: simulation.ownerAssetDeltas,
    endingAllowances: simulation.endingAllowances,
    traceHash: simulation.traceHash,
    stateDiffHash: simulation.stateDiffHash,
  };
}
