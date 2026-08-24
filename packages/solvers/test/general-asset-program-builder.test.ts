import {
  AssetIdentityEvidenceV1Schema,
  AssetValuationEvidenceV1Schema,
  GeneralAssetPolicyV1Schema,
  NATIVE_ASSET_ADDRESS,
  commitment,
} from "@cobia/domain";
import { describe, expect, it } from "vitest";
import { SolverDecisionV1Schema } from "../src/transaction-program/decision";
import { buildGeneralAssetDecisionV1 } from "../src/general-assets/program-builder";

const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;
const owner = `0x${"11".repeat(20)}` as const;
const executor = `0x${"12".repeat(20)}` as const;
const inputToken = `0x${"22".repeat(20)}` as const;
const outputToken = `0x${"33".repeat(20)}` as const;
const target = `0x${"44".repeat(20)}` as const;
const spender = `0x${"55".repeat(20)}` as const;
const inputIdentity = AssetIdentityEvidenceV1Schema.parse({
  version: 1, chainId: 196, token: inputToken, runtimeCodeHash: hash("1"),
  proxy: { kind: "none" }, decimals: 18,
  behaviorModule: { id: "plain-erc20", version: 1 },
  blockNumber: "123", blockHash: hash("2"),
  capturedAtSec: 2_000_000_000, expiresAtSec: 2_000_000_300,
});
const outputIdentity = AssetIdentityEvidenceV1Schema.parse({
  ...inputIdentity, token: outputToken, runtimeCodeHash: hash("3"),
});
const valuation = AssetValuationEvidenceV1Schema.parse({
  version: 1, assetIdentityHash: commitment(inputIdentity),
  referenceAsset: { chainId: 196, token: outputToken },
  inputAtomic: "100", conservativeValueUsdE8: "250", maximumDisagreementBps: 0,
  quotes: [{ adapter: { id: "okx.swap", version: 1 }, outputAtomic: "90",
    referenceValueUsdE8: "250", liquidityUsdE8: "100000000", priceImpactBps: 0,
    fetchedAtSec: 2_000_000_000, expiresAtSec: 2_000_000_300, quoteHash: hash("4") }],
  capturedAtSec: 2_000_000_000, expiresAtSec: 2_000_000_300,
});
const manifest = { version: 1 as const, entries: [{ providerFamily: "okx" as const,
  adapter: { id: "okx.swap", version: 1 }, chainId: 196 as const, target,
  runtimeCodeHash: hash("5"), selectors: ["0x12345678"],
  approvalSpenders: [{ address: spender, runtimeCodeHash: hash("6") }] }] };
const evidence = { version: 1 as const, kind: "general-asset-evidence" as const,
  identities: [inputIdentity, outputIdentity], valuations: [valuation], manifest };
const policy = GeneralAssetPolicyV1Schema.parse({
  version: 1, kind: "general-asset", requestId: "550e8400-e29b-41d4-a716-446655440088",
  displayGoal: "Swap the exact X Layer pair", owner,
  sourceChainId: 196, destinationChainId: 196, nonce: hash("7"), createdAt: 2_000_000_000,
  deadline: 2_000_000_600, competition: { closesAt: 2_000_000_300, maxRevisionsPerSolver: 5 },
  maxEvidenceAgeSec: 300, manifestHash: commitment(manifest),
  inputIdentityHash: commitment(inputIdentity), inputValuationHash: commitment(valuation),
  input: { chainId: 196, token: inputToken, maximumAtomic: "100", maximumUsdE8: "250" },
  outputs: [{ chainId: 196, token: outputToken, minimumAtomic: "90",
    identityHash: commitment(outputIdentity) }],
  allowedAdapters: [{ id: "okx.swap", version: 1 }],
  limits: { maxStages: 1, maxCallsPerStage: 1, maxApprovals: 1, maxCalldataBytes: 1024,
    maxGasPerStage: "1000000", maxNativeValueUsdE8: "1", maxBridgeFeeUsdE8: "1",
    maxSolverFeeUsdE8: "0", maxConversionLossBps: 200, maxSlippageBps: 100 },
  forbiddenTargets: [], forbiddenAssets: [],
});

const compile = async () => ({
  target, data: "0x12345678" as const, valueAtomic: "0" as const, gasLimit: 300_000,
  approval: { spender, maximumAtomic: "100", data: "0x095ea7b300000000000000000000000055555555555555555555555555555555555555550000000000000000000000000000000000000000000000000000000000000064" as const },
  quoteHash: hash("8"), fetchedAtSec: 2_000_000_001, expiresAtSec: 2_000_000_031,
});

describe("general asset program builder", () => {
  it("builds a schema-valid exact one-stage OKX decision from signed policy evidence", async () => {
    const decision = await buildGeneralAssetDecisionV1({
      policy, evidence, executor, nowSec: 2_000_000_001, compile,
    });

    expect(SolverDecisionV1Schema.parse(decision)).toMatchObject({
      decision: "submit", proposalKind: "general-asset-program",
      program: {
        owner, manifestHash: commitment(manifest),
        stages: [{ chainId: 196, target, calldata: "0x12345678",
          input: { token: inputToken, maximumAtomic: "100", maximumUsdE8: "250" },
          outputs: [{ token: outputToken, minimumIncreaseAtomic: "90" }],
          approvals: [{ token: inputToken, spender, maximumAtomic: "100" }],
          delivery: { kind: "none" },
        }],
        finalOutput: { chainId: 196, token: outputToken, minimumAtomic: "90" },
      },
      evidence,
    });
  });

  it("builds native gas input with exact value and no approval", async () => {
    const nativeIdentity = AssetIdentityEvidenceV1Schema.parse({
      version: 1, chainId: 196, token: NATIVE_ASSET_ADDRESS, decimals: 18,
      behaviorModule: { id: "native-gas", version: 1 }, blockNumber: "123",
      blockHash: hash("2"), capturedAtSec: 2_000_000_000, expiresAtSec: 2_000_000_300,
    });
    const nativeValuation = AssetValuationEvidenceV1Schema.parse({
      ...valuation, assetIdentityHash: commitment(nativeIdentity), inputAtomic: "100",
    });
    const nativeEvidence = { ...evidence,
      identities: [nativeIdentity, outputIdentity], valuations: [nativeValuation] };
    const nativePolicy = GeneralAssetPolicyV1Schema.parse({ ...policy,
      manifestHash: commitment(nativeEvidence.manifest),
      inputIdentityHash: commitment(nativeIdentity),
      inputValuationHash: commitment(nativeValuation),
      input: { ...policy.input, token: NATIVE_ASSET_ADDRESS },
      limits: { ...policy.limits, maxApprovals: 0 },
    });

    const decision = await buildGeneralAssetDecisionV1({
      policy: nativePolicy, evidence: nativeEvidence, executor, nowSec: 2_000_000_001,
      compile: async () => ({ ...(await compile()), valueAtomic: "100", approval: undefined }),
    });

    expect(decision).toMatchObject({ decision: "submit", program: { stages: [{
      input: { token: NATIVE_ASSET_ADDRESS }, nativeValueAtomic: "100", approvals: [],
      refundTokens: [outputToken],
    }] } });
  });

  it("does not make baseline evidence expiry the execution deadline", async () => {
    const identities = evidence.identities.map((value) => ({
      ...value, expiresAtSec: 2_000_000_010,
    }));
    const shortBaseline = {
      ...evidence,
      identities,
      valuations: evidence.valuations.map((value) => ({ ...value,
        assetIdentityHash: commitment(identities[0]!), expiresAtSec: 2_000_000_010 })),
    };
    const shortPolicy = GeneralAssetPolicyV1Schema.parse({
      ...policy,
      manifestHash: commitment(shortBaseline.manifest),
      inputIdentityHash: commitment(shortBaseline.identities[0]!),
      inputValuationHash: commitment(shortBaseline.valuations[0]!),
      outputs: [{ ...policy.outputs[0]!, identityHash: commitment(shortBaseline.identities[1]!) }],
    });

    const decision = await buildGeneralAssetDecisionV1({
      policy: shortPolicy, evidence: shortBaseline, executor, nowSec: 2_000_000_001, compile,
    });

    if (decision.decision !== "submit") throw new Error("Expected a submitted program");
    expect(decision.program.deadline).toBe(2_000_000_031);
  });

  it("fails closed when OKX compiles an unregistered target or approval spender", async () => {
    await expect(buildGeneralAssetDecisionV1({ policy, evidence, executor,
      nowSec: 2_000_000_001, compile: async () => ({ ...(await compile()), target: owner }) }))
      .rejects.toThrow(/registered target/i);
    await expect(buildGeneralAssetDecisionV1({ policy, evidence, executor,
      nowSec: 2_000_000_001, compile: async () => ({ ...(await compile()),
        approval: { ...(await compile()).approval, spender: owner } }) }))
      .rejects.toThrow(/registered approval spender/i);
  });
});
