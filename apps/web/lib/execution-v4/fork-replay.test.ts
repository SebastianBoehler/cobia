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
const spender = "0x7777777777777777777777777777777777777777" as const;
const blockHash = hash("d");

const stage = {
  stageId: hash("7"), index: 0, chainId: 196 as const, predecessorStageId: null,
  adapter: { id: "lifi.route", version: 1 }, target, targetRuntimeCodeHash: hash("a"),
  calldata: "0x12345678" as const, nativeValueAtomic: "0",
  input: { token: inputToken, maximumAtomic: "100", maximumUsdE8: "100000000",
    identityEvidenceHash: hash("4"), valuationEvidenceHash: hash("5") },
  outputs: [{ token: outputToken, minimumIncreaseAtomic: "99", identityEvidenceHash: hash("6") }],
  approvals: [{ token: inputToken, spender, maximumAtomic: "100" }],
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
  endingAllowances: [{ token: inputToken, spender, atomic: "0" }],
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
    selectors: ["0x12345678"],
    approvalSpenders: [{ address: spender, runtimeCodeHash: hash("f") }] }] };
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
    stageInputExposuresUsdE8: ["100000000"] };
}

function execution(
  verdict: Extract<GeneralAssetProgramVerdictV1, { accepted: true }>,
  stageIndex = 0,
): ExecutionProgramV4 {
  const exactStage = verdict.program.stages[stageIndex]!;
  const exactCompiled = verdict.compiledStages[stageIndex]!;
  const exactReplay = verdict.replays[stageIndex]!;
  return {
    policyHash: verdict.program.policyHash, manifestHash: verdict.program.manifestHash,
    canonicalProgramHash: verdict.program.canonicalProgramHash,
    inputIdentityEvidenceHash: exactStage.input.identityEvidenceHash,
    outputIdentityEvidenceHash: exactStage.outputs[0]!.identityEvidenceHash,
    valuationEvidenceHash: exactStage.input.valuationEvidenceHash,
    stageHash: commitment(exactStage), simulationHash: commitment(exactReplay),
    pinnedBlockNumber: BigInt(exactReplay.blockNumber), pinnedBlockHash: exactReplay.blockHash,
    sourceChainId: BigInt(exactStage.chainId), owner,
    inputToken: exactStage.input.token, outputToken: exactStage.outputs[0]!.token,
    inputAmount: BigInt(exactStage.input.maximumAtomic),
    inputUsdE8: BigInt(verdict.stageInputExposuresUsdE8[stageIndex]!),
    deadline: 2_000_000_200n,
    nonce: generalAssetStageNonceV4(verdict.policy.nonce, exactStage),
    refundTokens: exactCompiled.refundTokens,
    calls: [{ adapterKey: exactCompiled.adapterKey, target: exactCompiled.target,
      value: BigInt(exactCompiled.valueAtomic), gasLimit: exactCompiled.gasLimit,
      approvals: exactCompiled.approvals.map(({ token, spender, maximumAtomic }) =>
        ({ token, spender, amount: BigInt(maximumAtomic) })), data: exactCompiled.data }],
    constraints: exactStage.outputs.map(({ token, minimumIncreaseAtomic }) =>
      ({ token, kind: 1 as const, minimum: BigInt(minimumIncreaseAtomic) })),
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

  it("rejects an approval spender that differs from the manifest-verified compilation", async () => {
    const replay = await replayGeneralAssetStageV1({
      stage, compiled, anchor: { chainId: 196, blockNumber: "123", blockHash }, fork: fork(),
    });
    const verdict = accepted(replay);
    const changed = execution(verdict);
    changed.calls[0]!.approvals[0]!.spender = target;
    await expect(attestExecutionProgramV4({ verdict, stageIndex: 0, execution: changed, executor,
      signTypedData: async () => hash("f") as `0x${string}` })).rejects.toThrow(/match/i);
  });

  it("attests a destination stage against its own token evidence and USD exposure", async () => {
    const replay = await replayGeneralAssetStageV1({
      stage, compiled, anchor: { chainId: 196, blockNumber: "123", blockHash }, fork: fork(),
    });
    const verdict = accepted(replay);
    const destinationToken = "0x6666666666666666666666666666666666666666" as const;
    const destinationStage = { ...stage, stageId: hash("8"), index: 1,
      predecessorStageId: stage.stageId, input: { token: outputToken, maximumAtomic: "99",
        maximumUsdE8: "99000000", identityEvidenceHash: hash("6"), valuationEvidenceHash: hash("8") },
      outputs: [{ token: destinationToken, minimumIncreaseAtomic: "95", identityEvidenceHash: hash("9") }],
      approvals: [{ token: outputToken, spender, maximumAtomic: "99" }],
      refundTokens: [outputToken, destinationToken].sort() as typeof stage.refundTokens };
    const destinationCompiled = { ...compiled, stageId: destinationStage.stageId,
      approvals: destinationStage.approvals, refundTokens: destinationStage.refundTokens };
    const destinationReplay = { ...replay, stageId: destinationStage.stageId,
      compiledCallHash: commitment(destinationCompiled), ownerAssetDeltas: [
        { token: outputToken, deltaAtomic: "-99" },
        { token: destinationToken, deltaAtomic: "95" },
      ], endingAllowances: [{ token: outputToken, spender, atomic: "0" }] };
    const destinationVerdict = { ...verdict,
      program: { ...verdict.program, identityEvidenceHashes: [hash("4"), hash("6"), hash("9")],
        valuationEvidenceHashes: [hash("5"), hash("8")], stages: [stage, destinationStage] },
      compiledStages: [compiled, destinationCompiled], replays: [replay, destinationReplay],
      replayHash: commitment([replay, destinationReplay]),
      stageInputExposuresUsdE8: ["100000000", "99000000"] };
    const signer = privateKeyToAccount(hash("1"));
    await expect(attestExecutionProgramV4({ verdict: destinationVerdict, stageIndex: 1,
      execution: execution(destinationVerdict, 1), executor,
      signTypedData: (typedData) => signer.signTypedData(typedData),
    })).resolves.toMatchObject({ stageIndex: 1 });
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
