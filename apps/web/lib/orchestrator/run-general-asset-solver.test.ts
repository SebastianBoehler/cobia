import {
  AssetIdentityEvidenceV1Schema,
  AssetValuationEvidenceV1Schema,
  GeneralAssetPolicyV1Schema,
  commitment,
} from "@cobia/domain";
import { buildGeneralAssetDecisionV1 } from "@cobia/solvers";
import { describe, expect, it, vi } from "vitest";
import { publishAndRunGeneralAssetSolverV1 } from "./run-general-asset-solver";

const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;
const address = (byte: string) => `0x${byte.repeat(40)}` as `0x${string}`;
const owner = address("1");
const executor = address("2");
const inputToken = address("3");
const outputToken = address("4");
const target = address("5");
const spender = address("6");
const inputIdentity = AssetIdentityEvidenceV1Schema.parse({
  version: 1, chainId: 196, token: inputToken, runtimeCodeHash: hash("1"),
  proxy: { kind: "none" }, decimals: 18,
  behaviorModule: { id: "plain-erc20", version: 1 }, blockNumber: "123", blockHash: hash("2"),
  capturedAtSec: 2_000_000_000, expiresAtSec: 2_000_000_300,
});
const outputIdentity = AssetIdentityEvidenceV1Schema.parse({
  ...inputIdentity, token: outputToken, runtimeCodeHash: hash("3"),
});
const valuation = AssetValuationEvidenceV1Schema.parse({
  version: 1, assetIdentityHash: commitment(inputIdentity),
  referenceAsset: { chainId: 196, token: outputToken }, inputAtomic: "100",
  conservativeValueUsdE8: "250", maximumDisagreementBps: 0,
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
  displayGoal: "Swap", owner, sourceChainId: 196, destinationChainId: 196,
  nonce: hash("7"), createdAt: 2_000_000_000, deadline: 2_000_000_600,
  competition: { closesAt: 2_000_000_300, maxRevisionsPerSolver: 5 }, maxEvidenceAgeSec: 300,
  manifestHash: commitment(manifest), inputIdentityHash: commitment(inputIdentity),
  inputValuationHash: commitment(valuation),
  input: { chainId: 196, token: inputToken, maximumAtomic: "100", maximumUsdE8: "250" },
  outputs: [{ chainId: 196, token: outputToken, minimumAtomic: "90",
    identityHash: commitment(outputIdentity) }], allowedAdapters: [{ id: "okx.swap", version: 1 }],
  limits: { maxStages: 1, maxCallsPerStage: 1, maxApprovals: 1, maxCalldataBytes: 1024,
    maxGasPerStage: "1000000", maxNativeValueUsdE8: "1", maxBridgeFeeUsdE8: "1",
    maxSolverFeeUsdE8: "0", maxConversionLossBps: 200, maxSlippageBps: 100 },
  forbiddenTargets: [], forbiddenAssets: [],
});

function dependencies() {
  const artifacts: Array<[string, unknown]> = [];
  return {
    artifacts,
    assertReady: vi.fn(async () => undefined),
    publish: vi.fn(async () => ({ id: policy.requestId })),
    profiles: { register: vi.fn(async () => undefined) },
    runs: { create: vi.fn(async () => ({ id: "run-v4" })), start: vi.fn(), complete: vi.fn(),
      fail: vi.fn() },
    submissions: { append: vi.fn(async () => ({ id: "submission-v4" })),
      appendArtifact: vi.fn(async (_id: string, kind: string, value: unknown) => {
        artifacts.push([kind, value]);
      }), resolve: vi.fn() },
    build: () => buildGeneralAssetDecisionV1({ policy, evidence, executor,
      nowSec: 2_000_000_001, compile: async () => ({ target, data: "0x12345678", valueAtomic: "0",
        gasLimit: 300_000, approval: { spender, maximumAtomic: "100", data: "0x095ea7b3" },
        quoteHash: hash("8"), fetchedAtSec: 2_000_000_001, expiresAtSec: 2_000_000_031 }) }),
    verify: vi.fn(async () => ({ accepted: true as const, errorCodes: [],
      replay: { matches: true }, execution: { kind: "general-asset-execution" },
      authorization: [{ signature: hash("9") }], verificationValidUntilSec: 2_000_000_031 })),
    nowSec: () => 2_000_000_001,
  };
}

describe("production general asset solver orchestration", () => {
  it("readiness-gates publication then persists an attested general asset decision", async () => {
    const deps = dependencies();
    const result = await publishAndRunGeneralAssetSolverV1({ policy,
      ownerSignature: `0x${"aa".repeat(65)}`, evidence, revision: 1, nowSec: 2_000_000_001 }, deps);

    expect(result).toMatchObject({ intent: { id: policy.requestId },
      solution: { state: "attested", submissionId: "submission-v4" } });
    expect(deps.assertReady).toHaveBeenCalledBefore(deps.publish);
    expect(deps.profiles.register).toHaveBeenCalledWith(expect.objectContaining({
      id: "cobia-coding-agent", operatorKind: "internal",
      declaredCapabilities: expect.arrayContaining(["general-asset@1"]),
    }));
    expect(deps.artifacts.map(([kind]) => kind)).toEqual([
      "program", "evidence", "provenance", "verdict", "replay", "execution", "authorization",
    ]);
  });

  it("does not publish or advertise the lane while V4 is not public-ready", async () => {
    const deps = dependencies();
    deps.assertReady.mockRejectedValue(new Error("General asset V4 is not public-ready"));
    await expect(publishAndRunGeneralAssetSolverV1({ policy,
      ownerSignature: `0x${"aa".repeat(65)}`, evidence, revision: 1,
      nowSec: 2_000_000_001 }, deps)).rejects.toThrow("not public-ready");
    expect(deps.publish).not.toHaveBeenCalled();
    expect(deps.profiles.register).not.toHaveBeenCalled();
  });

  it("does not attest when verifier-owned time crosses the authorization deadline", async () => {
    const deps = dependencies();
    deps.nowSec = vi.fn()
      .mockReturnValueOnce(2_000_000_001)
      .mockReturnValueOnce(2_000_000_001)
      .mockReturnValueOnce(2_000_000_031);

    const result = await publishAndRunGeneralAssetSolverV1({ policy,
      ownerSignature: `0x${"aa".repeat(65)}`, evidence, revision: 1,
      nowSec: 2_000_000_001 }, deps);

    expect(result.solution).toMatchObject({ state: "failed",
      errorCodes: ["VERIFICATION_EXPIRED"] });
    expect(deps.submissions.resolve).toHaveBeenCalledWith("submission-v4", "verified", []);
    expect(deps.submissions.resolve).toHaveBeenCalledWith(
      "submission-v4", "failed", ["VERIFICATION_EXPIRED"],
    );
    expect(deps.submissions.resolve).not.toHaveBeenCalledWith("submission-v4", "attested", []);
  });
});
