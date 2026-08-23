import { commitment, type GeneralAssetStageV1 } from "@cobia/domain";
import type {
  CompiledGeneralAssetStageV1,
  GeneralAssetProgramVerdictV1,
  GeneralAssetStageReplayV1,
} from "@cobia/solvers";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { attestExecutionProgramV4, generalAssetStageNonceV4 } from "./attestation";
import type { ExecutionProgramV4 } from "./commitment";
import { replayGeneralAssetStageV1 } from "./fork-replay";

const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;
const owner = "0x1111111111111111111111111111111111111111" as const;
const inputToken = "0x2222222222222222222222222222222222222222" as const;
const target = "0x3333333333333333333333333333333333333333" as const;
const outputToken = "0x4444444444444444444444444444444444444444" as const;
const executor = "0x5555555555555555555555555555555555555555" as const;
const blockHash = hash("d");

const stage = {
  stageId: hash("7"), index: 0, chainId: 196 as const, predecessorStageId: null,
  adapter: { id: "lifi.route", version: 1 }, target, targetRuntimeCodeHash: hash("a"),
  calldata: "0x12345678" as const, nativeValueAtomic: "0",
  input: { token: inputToken, maximumAtomic: "100" },
  outputs: [{ token: outputToken, minimumIncreaseAtomic: "99" }],
  approvals: [{ token: inputToken, spender: target, maximumAtomic: "100" }],
  refundTokens: [inputToken, outputToken], finality: { confirmations: 12 },
  delivery: { kind: "none" as const },
} satisfies GeneralAssetStageV1;
const compiled = {
  stageId: stage.stageId, chainId: 196 as const, adapterKey: hash("b"), target,
  targetRuntimeCodeHash: hash("a"), data: stage.calldata, valueAtomic: "0", gasLimit: 300_000,
  approvals: stage.approvals, refundTokens: stage.refundTokens, quoteHash: hash("c"),
  expiresAtSec: 2_000_000_200,
} satisfies CompiledGeneralAssetStageV1;
const simulated = {
  executedCallHash: commitment(compiled), success: true, gasUsed: "200000",
  ownerAssetDeltas: [{ token: inputToken, deltaAtomic: "-100" },
    { token: outputToken, deltaAtomic: "99" }],
  endingAllowances: [{ token: inputToken, spender: target, atomic: "0" }],
  traceHash: hash("e"), stateDiffHash: hash("9"),
};

function fork(overrides: Record<string, unknown> = {}) {
  return {
    getChainId: async () => 196,
    getBlockHash: async () => blockHash,
    getCodeHash: async () => hash("a"),
    simulate: async () => simulated,
    ...overrides,
  };
}

function accepted(
  replay: GeneralAssetStageReplayV1,
): Extract<GeneralAssetProgramVerdictV1, { accepted: true }> {
  const manifest = { version: 1 as const, entries: [{ providerFamily: "lifi" as const,
    adapter: stage.adapter, chainId: 196 as const, target, runtimeCodeHash: hash("a"),
    selectors: ["0x12345678"], approvalSpenders: [target] }] };
  const policy = { version: 1 as const, kind: "general-asset" as const,
    requestId: "550e8400-e29b-41d4-a716-446655440000", displayGoal: "Swap", owner,
    sourceChainId: 196 as const, destinationChainId: 196 as const, nonce: hash("1"),
    createdAt: 2_000_000_000, deadline: 2_000_000_300,
    competition: { closesAt: 2_000_000_100, maxRevisionsPerSolver: 5 }, maxEvidenceAgeSec: 300,
    manifestHash: commitment(manifest), inputIdentityHash: hash("4"), inputValuationHash: hash("5"),
    input: { chainId: 196 as const, token: inputToken, maximumAtomic: "100", maximumUsdE8: "100000000" },
    outputs: [{ chainId: 196 as const, token: outputToken, minimumAtomic: "99", identityHash: hash("6") }],
    allowedAdapters: [stage.adapter], limits: { maxStages: 2, maxCallsPerStage: 2, maxApprovals: 4,
      maxCalldataBytes: 1024, maxGasPerStage: "1000000", maxNativeValueUsdE8: "1000000",
      maxBridgeFeeUsdE8: "1000000", maxSolverFeeUsdE8: "100000", maxConversionLossBps: 200,
      maxSlippageBps: 100 }, forbiddenTargets: [], forbiddenAssets: [] };
  const program = { version: 1 as const, kind: "general-asset-program" as const,
    policyHash: commitment(policy), manifestHash: commitment(manifest), canonicalProgramHash: hash("3"),
    owner, deadline: 2_000_000_200, identityEvidenceHashes: [hash("4"), hash("6")],
    valuationEvidenceHashes: [hash("5")], stages: [stage],
    finalOutput: { chainId: 196 as const, token: outputToken, minimumAtomic: "99" } };
  return { accepted: true, errorCodes: [], policy, program, manifest,
    compiledStages: [compiled], replays: [replay], replayHash: commitment([replay]),
    inputExposureUsdE8: "100000000" };
}

function execution(verdict: Extract<GeneralAssetProgramVerdictV1, { accepted: true }>): ExecutionProgramV4 {
  return {
    policyHash: verdict.program.policyHash, manifestHash: verdict.program.manifestHash,
    canonicalProgramHash: verdict.program.canonicalProgramHash,
    inputIdentityEvidenceHash: hash("4"), outputIdentityEvidenceHash: hash("6"),
    valuationEvidenceHash: hash("5"), stageHash: commitment(stage), simulationHash: commitment(verdict.replays[0]),
    pinnedBlockNumber: 123n, pinnedBlockHash: blockHash, sourceChainId: 196n, owner,
    inputToken, outputToken, inputAmount: 100n, inputUsdE8: 100_000_000n,
    deadline: 2_000_000_200n,
    nonce: generalAssetStageNonceV4(verdict.policy.nonce, stage),
    refundTokens: [inputToken, outputToken],
    calls: [{ adapterKey: compiled.adapterKey, target, value: 0n, gasLimit: compiled.gasLimit,
      approvals: [{ token: inputToken, amount: 100n }], data: compiled.data }],
    constraints: [{ token: outputToken, kind: 1, minimum: 99n }],
  };
}

describe("general asset V4 fork replay and attestation", () => {
  it("derives a distinct executor nonce for each stage", () => {
    expect(generalAssetStageNonceV4(hash("1"), stage)).not.toBe(
      generalAssetStageNonceV4(hash("1"), { ...stage, stageId: hash("8"), index: 1 }),
    );
  });

  it("replays only the exact call against the pinned chain, block, and code", async () => {
    const replay = await replayGeneralAssetStageV1({
      stage, compiled, anchor: { chainId: 196, blockNumber: "123", blockHash }, fork: fork(),
    });
    expect(replay).toMatchObject({ matchesCompiledCalls: true, success: true, blockHash });

    await expect(replayGeneralAssetStageV1({ stage, compiled,
      anchor: { chainId: 196, blockNumber: "123", blockHash },
      fork: fork({ getCodeHash: async () => hash("f") }),
    })).rejects.toThrow(/code/i);
  });

  it("attests and encodes only an accepted exact replay", async () => {
    const replay = await replayGeneralAssetStageV1({
      stage, compiled, anchor: { chainId: 196, blockNumber: "123", blockHash }, fork: fork(),
    });
    const verdict = accepted(replay);
    const signer = privateKeyToAccount(hash("1"));
    const attestation = await attestExecutionProgramV4({
      verdict, stageIndex: 0, execution: execution(verdict), executor,
      signTypedData: (typedData) => signer.signTypedData(typedData),
    });
    expect(attestation.authorization.executionCommitment).toBeTruthy();
    expect(attestation.call).toMatchObject({ to: executor, value: 0n });
    expect(attestation.signature).toMatch(/^0x[0-9a-f]{130}$/);
  });

  it("never attests a rejected verdict or a changed stage commitment", async () => {
    const replay = await replayGeneralAssetStageV1({
      stage, compiled, anchor: { chainId: 196, blockNumber: "123", blockHash }, fork: fork(),
    });
    const verdict = accepted(replay);
    const changed = { ...execution(verdict), stageHash: hash("f") };
    await expect(attestExecutionProgramV4({ verdict, stageIndex: 0, execution: changed, executor,
      signTypedData: async () => hash("f") as `0x${string}` })).rejects.toThrow(/match/i);
    await expect(attestExecutionProgramV4({ verdict, stageIndex: 0,
      execution: { ...execution(verdict), inputUsdE8: 1n }, executor,
      signTypedData: async () => hash("f") as `0x${string}` })).rejects.toThrow(/match/i);
    await expect(attestExecutionProgramV4({ verdict: { accepted: false, errorCodes: ["REPLAY_DIVERGED"] },
      stageIndex: 0, execution: execution(verdict), executor,
      signTypedData: async () => hash("f") as `0x${string}` })).rejects.toThrow(/accepted/i);
  });
});
