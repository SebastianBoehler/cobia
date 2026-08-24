import {
  AssetIdentityEvidenceV1Schema,
  AssetValuationEvidenceV1Schema,
  GeneralAssetPolicyV1Schema,
  NATIVE_ASSET_ADDRESS,
  parseAssetIdentityEvidenceV1,
  parseAssetValuationEvidenceV1,
  parseGeneralAssetPolicyV1,
} from "../src/index";
import { describe, expect, it } from "vitest";

const owner = "0x1111111111111111111111111111111111111111";
const weth = "0x2222222222222222222222222222222222222222";
const usdt0 = "0x3333333333333333333333333333333333333333";
const reference = "0x4444444444444444444444444444444444444444";
const hash = (byte: string) => `0x${byte.repeat(64)}`;

function identity() {
  return {
    version: 1 as const,
    chainId: 1 as const,
    token: weth,
    runtimeCodeHash: hash("1"),
    proxy: { kind: "none" as const },
    decimals: 18,
    behaviorModule: { id: "plain-erc20", version: 1 as const },
    blockNumber: "70000000",
    blockHash: hash("2"),
    capturedAtSec: 2_000_000_000,
    expiresAtSec: 2_000_000_300,
  };
}

function valuation() {
  return {
    version: 1 as const,
    assetIdentityHash: hash("3"),
    referenceAsset: { chainId: 1 as const, token: reference },
    inputAtomic: "1000000000000000000",
    conservativeValueUsdE8: "300000000000",
    maximumDisagreementBps: 100,
    quotes: [{
      adapter: { id: "lifi.quote", version: 1 },
      outputAtomic: "3000000000",
      referenceValueUsdE8: "300000000000",
      liquidityUsdE8: "1000000000000",
      priceImpactBps: 25,
      fetchedAtSec: 2_000_000_000,
      expiresAtSec: 2_000_000_120,
      quoteHash: hash("4"),
    }],
    capturedAtSec: 2_000_000_000,
    expiresAtSec: 2_000_000_120,
  };
}

function policy() {
  return {
    version: 1 as const,
    kind: "general-asset" as const,
    requestId: "550e8400-e29b-41d4-a716-446655440000",
    displayGoal: "Use at most 1 WETH to acquire USDt0 on X Layer",
    owner,
    sourceChainId: 1 as const,
    destinationChainId: 196 as const,
    nonce: hash("5"),
    createdAt: 2_000_000_000,
    deadline: 2_000_000_600,
    competition: { closesAt: 2_000_000_300, maxRevisionsPerSolver: 5 },
    maxEvidenceAgeSec: 300,
    manifestHash: hash("6"),
    inputIdentityHash: hash("3"),
    inputValuationHash: hash("7"),
    input: {
      chainId: 1 as const,
      token: weth,
      maximumAtomic: "1000000000000000000",
      maximumUsdE8: "300000000000",
    },
    outputs: [{ chainId: 196 as const, token: usdt0, minimumAtomic: "250000000",
      identityHash: hash("8") }],
    allowedAdapters: [
      { id: "lifi.bridge", version: 1 },
      { id: "okx.swap", version: 1 },
    ],
    limits: {
      maxStages: 4,
      maxCallsPerStage: 8,
      maxApprovals: 16,
      maxCalldataBytes: 16384,
      maxGasPerStage: "5000000",
      maxNativeValueUsdE8: "100000000",
      maxBridgeFeeUsdE8: "100000000",
      maxSolverFeeUsdE8: "0",
      maxConversionLossBps: 500,
      maxSlippageBps: 300,
    },
    forbiddenTargets: [],
    forbiddenAssets: [],
  };
}

describe("general asset evidence", () => {
  it("accepts exact chain-bound identity and executable valuation evidence", () => {
    expect(AssetIdentityEvidenceV1Schema.parse(identity())).toMatchObject({ chainId: 1, token: weth });
    expect(AssetValuationEvidenceV1Schema.parse(valuation())).toMatchObject({
      conservativeValueUsdE8: "300000000000",
    });
  });

  it("represents native gas identity without fake token bytecode or proxy evidence", () => {
    const native = AssetIdentityEvidenceV1Schema.parse({
      version: 1, chainId: 196, token: NATIVE_ASSET_ADDRESS, decimals: 18,
      behaviorModule: { id: "native-gas", version: 1 },
      blockNumber: "123", blockHash: hash("9"),
      capturedAtSec: 2_000_000_000, expiresAtSec: 2_000_000_300,
    });

    expect(native).toMatchObject({ token: NATIVE_ASSET_ADDRESS,
      behaviorModule: { id: "native-gas" } });
    expect(native).not.toHaveProperty("runtimeCodeHash");
    expect(native).not.toHaveProperty("proxy");
  });

  it("rejects expired evidence and zero token authority", () => {
    expect(() => parseAssetIdentityEvidenceV1(identity(), 2_000_000_301)).toThrow(/expired/i);
    expect(() => parseAssetValuationEvidenceV1(valuation(), 2_000_000_121)).toThrow(/expired/i);
    expect(() => AssetIdentityEvidenceV1Schema.parse({
      ...identity(), token: "0x0000000000000000000000000000000000000000",
    })).toThrow();
  });
});

describe("GeneralAssetPolicyV1", () => {
  it("binds atomic and USD input maxima plus exact ordered outputs and adapters", () => {
    expect(parseGeneralAssetPolicyV1(policy(), 2_000_000_001)).toMatchObject({
      sourceChainId: 1,
      destinationChainId: 196,
      input: { token: weth, maximumAtomic: "1000000000000000000", maximumUsdE8: "300000000000" },
      outputs: [{ chainId: 196, token: usdt0, minimumAtomic: "250000000", identityHash: hash("8") }],
    });
  });

  it("rejects missing USD authority, symbol authority, and output substitution", () => {
    const { maximumUsdE8: _, ...atomicOnly } = policy().input;
    expect(GeneralAssetPolicyV1Schema.safeParse({ ...policy(), input: atomicOnly }).success).toBe(false);
    expect(GeneralAssetPolicyV1Schema.safeParse({
      ...policy(), input: { ...policy().input, symbol: "WETH" },
    }).success).toBe(false);
    expect(GeneralAssetPolicyV1Schema.safeParse({
      ...policy(), outputs: [{ ...policy().outputs[0], chainId: 1 }],
    }).success).toBe(false);
    const output = policy().outputs[0]!;
    const unboundOutput = { chainId: output.chainId, token: output.token,
      minimumAtomic: output.minimumAtomic };
    expect(GeneralAssetPolicyV1Schema.safeParse({ ...policy(), outputs: [unboundOutput] }).success).toBe(false);
  });

  it("rejects noncanonical adapter and output ordering", () => {
    expect(() => GeneralAssetPolicyV1Schema.parse({
      ...policy(), allowedAdapters: [...policy().allowedAdapters].reverse(),
    })).toThrow(/sorted/i);
    expect(() => GeneralAssetPolicyV1Schema.parse({
      ...policy(),
      outputs: [
        { chainId: 196, token: usdt0, minimumAtomic: "1", identityHash: hash("8") },
        { chainId: 1, token: weth, minimumAtomic: "1", identityHash: hash("9") },
      ],
    })).toThrow(/sorted/i);
  });
});
