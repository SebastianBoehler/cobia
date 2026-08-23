import {
  AssetIdentityEvidenceV1Schema,
  AssetValuationEvidenceV1Schema,
  GeneralAssetProgramV1Schema,
  commitment,
} from "@cobia/domain";
import { describe, expect, it } from "vitest";
import { SolverDecisionV1Schema } from "../src/transaction-program/decision";

const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;
const owner = "0x1111111111111111111111111111111111111111" as const;
const inputToken = "0x2222222222222222222222222222222222222222" as const;
const outputToken = "0x3333333333333333333333333333333333333333" as const;
const target = "0x4444444444444444444444444444444444444444" as const;

const identity = AssetIdentityEvidenceV1Schema.parse({
  version: 1, chainId: 1, token: inputToken, runtimeCodeHash: hash("1"),
  proxy: { kind: "none" }, decimals: 18,
  behaviorModule: { id: "plain-erc20", version: 1 }, blockNumber: "123", blockHash: hash("2"),
  capturedAtSec: 2_000_000_000, expiresAtSec: 2_000_000_300,
});
const outputIdentity = AssetIdentityEvidenceV1Schema.parse({
  ...identity, chainId: 196, token: outputToken, runtimeCodeHash: hash("3"),
});
const valuation = AssetValuationEvidenceV1Schema.parse({
  version: 1, assetIdentityHash: commitment(identity), referenceAsset: { chainId: 1, token: outputToken },
  inputAtomic: "100", conservativeValueUsdE8: "100000000", maximumDisagreementBps: 0,
  quotes: [{ adapter: { id: "okx.market", version: 1 }, outputAtomic: "100",
    referenceValueUsdE8: "100000000", liquidityUsdE8: "1000000000", priceImpactBps: 0,
    fetchedAtSec: 2_000_000_000, expiresAtSec: 2_000_000_300, quoteHash: hash("4") }],
  capturedAtSec: 2_000_000_000, expiresAtSec: 2_000_000_300,
});
const manifest = { version: 1 as const, entries: [{ providerFamily: "okx" as const,
  adapter: { id: "okx.market", version: 1 }, chainId: 1 as const, target,
  runtimeCodeHash: hash("5"), selectors: ["0x12345678"], approvalSpenders: [] }] };
const program = GeneralAssetProgramV1Schema.parse({
  version: 1, kind: "general-asset-program", policyHash: hash("6"),
  manifestHash: commitment(manifest), canonicalProgramHash: hash("7"), owner,
  deadline: 2_000_000_200,
  identityEvidenceHashes: [commitment(identity), commitment(outputIdentity)].sort(),
  valuationEvidenceHashes: [commitment(valuation)],
  stages: [{ stageId: hash("8"), index: 0, chainId: 1, predecessorStageId: null,
    adapter: { id: "okx.market", version: 1 }, target, targetRuntimeCodeHash: hash("5"),
    calldata: "0x12345678", nativeValueAtomic: "0",
    input: { token: inputToken, maximumAtomic: "100", maximumUsdE8: "100000000",
      identityEvidenceHash: commitment(identity), valuationEvidenceHash: commitment(valuation) },
    outputs: [{ token: outputToken, minimumIncreaseAtomic: "90",
      identityEvidenceHash: commitment(outputIdentity) }], approvals: [],
    refundTokens: [inputToken, outputToken].sort(), finality: { confirmations: 12 },
    delivery: { kind: "none" } }],
  finalOutput: { chainId: 1, token: outputToken, minimumAtomic: "90" },
});

function proposal() {
  return { version: 1 as const, decision: "submit" as const,
    proposalKind: "general-asset-program" as const, program,
    evidence: { version: 1 as const, kind: "general-asset-evidence" as const,
      identities: [identity, outputIdentity],
      valuations: [valuation], manifest },
    provenance: { version: 1 as const, runner: "general-solver@1", dependencies: [],
      sources: [], commandHashes: [], generatedFiles: [] } };
}

describe("general asset solver decision", () => {
  it("accepts a program with complete committed verification evidence", () => {
    expect(SolverDecisionV1Schema.parse(proposal())).toMatchObject({
      proposalKind: "general-asset-program", program, evidence: { manifest },
    });
  });

  it("rejects evidence that is not exactly committed by the program", () => {
    expect(() => SolverDecisionV1Schema.parse({ ...proposal(), evidence: {
      ...proposal().evidence, identities: [identity],
    } })).toThrow();
    expect(() => SolverDecisionV1Schema.parse({ ...proposal(), evidence: {
      ...proposal().evidence, valuations: [],
    } })).toThrow();
  });
});
