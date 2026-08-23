import { describe, expect, it } from "vitest";
import type { GeneralAssetDraftV1 } from "./general-asset-draft";
import { buildIntentComposerPolicy, intentComposerExecutionChainIds } from "./build-composer-policy";

const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;
const owner = "0x1111111111111111111111111111111111111111" as const;
const inputToken = "0x2222222222222222222222222222222222222222" as const;
const outputToken = "0x3333333333333333333333333333333333333333" as const;

function draft(): GeneralAssetDraftV1 {
  return {
    kind: "general-asset-draft", templateId: "general-asset", displayGoal: "Swap random assets",
    sourceChainId: 196, destinationChainId: 1, manifestHash: hash("1"),
    input: { token: inputToken, symbol: "IN", decimals: 18, maximumAtomic: "100",
      maximumUsdE8: "50000000000", identityHash: hash("2"), valuationHash: hash("3") },
    output: { token: outputToken, symbol: "OUT", decimals: 6,
      minimumAtomic: "90", identityHash: hash("4") },
    allowedAdapters: [{ id: "lifi.route", version: 1 }, { id: "okx.dex", version: 1 }],
    limits: { maxStages: 4, maxCallsPerStage: 4, maxApprovals: 8, maxCalldataBytes: 4096,
      maxGasPerStage: "2000000", maxNativeValueUsdE8: "1000000000",
      maxBridgeFeeUsdE8: "5000000000", maxSolverFeeUsdE8: "0",
      maxConversionLossBps: 400, maxSlippageBps: 200 },
  };
}

describe("general asset composer policy", () => {
  it("builds exact chain/address authority with global USD bounds", () => {
    const values = draft();
    const policy = buildIntentComposerPolicy({
      values, requestId: "550e8400-e29b-41d4-a716-446655440099", owner,
      inputAtomic: null, minimumAtomic: null, nonce: hash("5"), nowSec: 2_000_000_000,
      displayGoal: values.displayGoal, excludedProtocols: ["aave-v3"],
    });

    expect(policy).toMatchObject({
      kind: "general-asset", sourceChainId: 196, destinationChainId: 1,
      input: { chainId: 196, token: inputToken, maximumAtomic: "100", maximumUsdE8: "50000000000" },
      outputs: [{ chainId: 1, token: outputToken, minimumAtomic: "90", identityHash: hash("4") }],
      inputIdentityHash: hash("2"), inputValuationHash: hash("3"),
      competition: { closesAt: 2_000_000_300 }, deadline: 2_000_001_800,
      forbiddenTargets: [expect.objectContaining({ chainId: 196 })],
    });
    expect(intentComposerExecutionChainIds(values)).toEqual([1, 196]);
  });

  it("refuses an edited value over the route cap", () => {
    const values = draft();
    values.input.maximumUsdE8 = "100000000001";
    expect(() => buildIntentComposerPolicy({
      values, requestId: "550e8400-e29b-41d4-a716-446655440099", owner,
      inputAtomic: null, minimumAtomic: null, nonce: hash("5"), nowSec: 2_000_000_000,
      displayGoal: values.displayGoal, excludedProtocols: [],
    })).toThrow("$1,000");
  });
});
