import { commitment, GeneralAssetPolicyV1Schema } from "@cobia/domain";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { createSolverExchangeClient } from "./client";

const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;
const nowSec = 2_000_000_000;
const owner = privateKeyToAccount(`0x${"11".repeat(32)}`);
const inputToken = "0x2222222222222222222222222222222222222222";
const outputToken = "0x3333333333333333333333333333333333333333";
const identity = (token: `0x${string}`, decimals: number, byte: string) => ({
  version: 1 as const, chainId: 196 as const, token, runtimeCodeHash: hash(byte),
  proxy: { kind: "none" as const }, decimals,
  behaviorModule: { id: "plain-erc20" as const, version: 1 as const },
  blockNumber: "1", blockHash: hash("4"), capturedAtSec: nowSec - 10, expiresAtSec: nowSec + 120,
});
const inputIdentity = identity(inputToken, 6, "1");
const outputIdentity = identity(outputToken, 18, "2");
const valuation = { version: 1 as const, assetIdentityHash: commitment(inputIdentity),
  referenceAsset: { chainId: 196 as const, token: outputToken }, inputAtomic: "50000000",
  conservativeValueUsdE8: "5000000000", maximumDisagreementBps: 100,
  quotes: [{ adapter: { id: "okx.market", version: 1 }, outputAtomic: "1",
    referenceValueUsdE8: "5000000000", liquidityUsdE8: "10000000000", priceImpactBps: 10,
    fetchedAtSec: nowSec - 10, expiresAtSec: nowSec + 120, quoteHash: hash("5") }],
  capturedAtSec: nowSec - 10, expiresAtSec: nowSec + 120 };
const manifest = { version: 1 as const, entries: [{ providerFamily: "okx" as const,
  adapter: { id: "okx.swap", version: 1 }, chainId: 196 as const,
  target: "0x4444444444444444444444444444444444444444", runtimeCodeHash: hash("6"),
  selectors: ["0x12345678"], approvalSpenders: [] }] };
const evidence = { version: 1 as const, kind: "general-asset-evidence" as const,
  identities: [inputIdentity, outputIdentity], valuations: [valuation], manifest };
const policy = GeneralAssetPolicyV1Schema.parse({
  version: 1, kind: "general-asset", requestId: "550e8400-e29b-41d4-a716-446655440000",
  displayGoal: "Acquire AAPLx", owner: owner.address.toLowerCase(),
  sourceChainId: 196, destinationChainId: 196, nonce: hash("7"), createdAt: nowSec - 10,
  deadline: nowSec + 600, competition: { closesAt: nowSec + 300, maxRevisionsPerSolver: 5 },
  maxEvidenceAgeSec: 300, manifestHash: commitment(manifest),
  inputIdentityHash: commitment(inputIdentity), inputValuationHash: commitment(valuation),
  input: { chainId: 196, token: inputToken, maximumAtomic: "50000000",
    maximumUsdE8: "5000000000" },
  outputs: [{ chainId: 196, token: outputToken, minimumAtomic: "250000000000000000",
    identityHash: commitment(outputIdentity) }],
  allowedAdapters: [{ id: "okx.swap", version: 1 }],
  limits: { maxStages: 1, maxCallsPerStage: 1, maxApprovals: 1, maxCalldataBytes: 1024,
    maxGasPerStage: "1000000", maxNativeValueUsdE8: "1", maxBridgeFeeUsdE8: "1",
    maxSolverFeeUsdE8: "0", maxConversionLossBps: 100, maxSlippageBps: 100 },
  forbiddenTargets: [], forbiddenAssets: [],
});

describe("general asset solver exchange transport", () => {
  it("accepts evidence-bound X Layer policies from the public solver feed", async () => {
    const ownerSignature = await owner.signMessage({ message: { raw: commitment(policy) } });
    const fetch = async () => new Response(JSON.stringify({ observedAt: nowSec, intents: [{
      id: policy.requestId, policy, policyHash: commitment(policy), ownerSignature,
      snapshot: evidence, snapshotHash: commitment(evidence),
      competitionClosesAt: policy.competition.closesAt,
      links: { intent: `/api/intents/${policy.requestId}`,
        decisions: `/api/intents/${policy.requestId}/decisions` },
    }] }), { headers: { "content-type": "application/json" } });

    const result = await createSolverExchangeClient({ baseUrl: "https://cobia.example",
      fetch: fetch as typeof globalThis.fetch }).listIntents();

    expect(result.intents[0]).toMatchObject({ policy: { kind: "general-asset" },
      snapshot: { kind: "general-asset-evidence" } });
  });
});
