import { GeneralAssetProgramV1Schema, parseGeneralAssetProgramV1 } from "../src/index";
import { describe, expect, it } from "vitest";

const owner = "0x1111111111111111111111111111111111111111";
const weth = "0x2222222222222222222222222222222222222222";
const usdt0 = "0x3333333333333333333333333333333333333333";
const router = "0x4444444444444444444444444444444444444444";
const hash = (byte: string) => `0x${byte.repeat(64)}`;

function stage(index: number, predecessorStageId: string | null) {
  return {
    stageId: hash(String(index + 1)),
    index,
    chainId: index === 0 ? 1 as const : 196 as const,
    predecessorStageId,
    adapter: { id: index === 0 ? "lifi.bridge" : "okx.swap", version: 1 },
    target: router,
    targetRuntimeCodeHash: hash("9"),
    calldata: "0x12345678",
    nativeValueAtomic: "0",
    input: { token: index === 0 ? weth : usdt0, maximumAtomic: "1000000" },
    outputs: [{ token: usdt0, minimumIncreaseAtomic: "900000" }],
    approvals: [{ token: index === 0 ? weth : usdt0, spender: router, maximumAtomic: "1000000" }],
    refundTokens: [index === 0 ? weth : usdt0],
    finality: { confirmations: index === 0 ? 12 : 1 },
    delivery: index === 0 ? {
      kind: "bridge" as const,
      destinationChainId: 196 as const,
      recipient: owner,
      minimumDeliveredAtomic: "900000",
    } : { kind: "none" as const },
  };
}

function program() {
  const first = stage(0, null);
  const second = stage(1, first.stageId);
  return {
    version: 1 as const,
    kind: "general-asset-program" as const,
    policyHash: hash("a"),
    manifestHash: hash("b"),
    canonicalProgramHash: hash("c"),
    owner,
    deadline: 2_000_000_600,
    identityEvidenceHashes: [hash("d"), hash("e")],
    valuationEvidenceHashes: [hash("f")],
    stages: [first, second],
    finalOutput: { chainId: 196 as const, token: usdt0, minimumAtomic: "900000" },
  };
}

describe("GeneralAssetProgramV1", () => {
  it("accepts an ordered source, delivery, and destination program", () => {
    expect(parseGeneralAssetProgramV1(program())).toMatchObject({
      stages: [
        { index: 0, chainId: 1, predecessorStageId: null },
        { index: 1, chainId: 196, predecessorStageId: hash("1") },
      ],
      finalOutput: { chainId: 196, token: usdt0, minimumAtomic: "900000" },
    });
  });

  it("rejects reordered or skipped predecessor stages", () => {
    const valid = program();
    expect(() => GeneralAssetProgramV1Schema.parse({
      ...valid, stages: [valid.stages[1], valid.stages[0]],
    })).toThrow(/ordered/i);
    expect(() => GeneralAssetProgramV1Schema.parse({
      ...valid,
      stages: [valid.stages[0], { ...valid.stages[1], predecessorStageId: null }],
    })).toThrow(/predecessor/i);
  });

  it("rejects a final output not produced by the final stage", () => {
    expect(() => GeneralAssetProgramV1Schema.parse({
      ...program(), finalOutput: { chainId: 1, token: weth, minimumAtomic: "1" },
    })).toThrow(/final output/i);
  });
});
