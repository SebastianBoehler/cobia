import { commitment, GeneralAssetPolicyV1Schema, OpenIntentPolicyV3Schema } from "@cobia/domain";
import { buildCapabilityCompositionPolicyV1 } from "../../../lib/intents/composition-policy";
import { PROTOCOL_REGISTRY } from "../../../lib/adapters/registry";
import { privateKeyToAccount } from "viem/accounts";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listDiscoverWithSnapshots: vi.fn(),
  publish: vi.fn(async () => undefined),
  publishComposition: vi.fn(async () => undefined),
  publishGeneralAsset: vi.fn(async () => undefined),
}));
vi.mock("../../../lib/runtime/market", () => ({
  getIntentRepository: () => ({ listDiscoverWithSnapshots: mocks.listDiscoverWithSnapshots }),
  publishOpenIntent: mocks.publish,
  publishCapabilityCompositionIntent: mocks.publishComposition,
  publishGeneralAssetIntent: mocks.publishGeneralAsset,
  OwnerBalanceRequiredError: class OwnerBalanceRequiredError extends Error {},
  IntentSnapshotUnavailableError: class IntentSnapshotUnavailableError extends Error {},
  GeneralAssetRefreshRequiredError: class GeneralAssetRefreshRequiredError extends Error {},
  ActiveManifestMismatchError: class ActiveManifestMismatchError extends Error {},
}));

import { GET, POST } from "./route";

const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
const nowSec = 2_000_000_100;
const policy = OpenIntentPolicyV3Schema.parse({
  version: 3, kind: "open-onchain", requestId: "550e8400-e29b-41d4-a716-446655440000",
  displayGoal: "Increase the verified Aave receipt balance",
  owner: account.address.toLowerCase(), executionChainIds: [196], nonce: `0x${"22".repeat(32)}`,
  createdAt: nowSec - 100, deadline: nowSec + 1_800, maxEvidenceAgeSec: 300,
  competition: { closesAt: nowSec + 300, maxRevisionsPerSolver: 5 },
  inputs: [{ chainId: 196, token: "0x2222222222222222222222222222222222222222",
    maximumAtomic: "10000000" }],
  outcomes: [{ kind: "minimum-increase", chainId: 196,
    token: "0x4444444444444444444444444444444444444444", atomic: "9950000" }],
  limits: { maxStages: 4, maxTransactions: 2, maxApprovals: 2, maxCalldataBytes: 1024,
    maxGasPerTransaction: "1000000",
    maxNativeValueAtomicByChain: [{ chainId: 196, atomic: "0" }] },
  forbiddenTargets: [], forbiddenAssets: [],
});
const snapshot = {
  version: 1 as const, kind: "open-onchain" as const, requestId: policy.requestId,
  capturedAt: new Date((nowSec - 90) * 1_000).toISOString(),
  anchors: [{ chainId: 196 as const, blockNumber: "68461706",
    blockHash: `0x${"66".repeat(32)}` as `0x${string}` }],
};
const compositionPolicy = buildCapabilityCompositionPolicyV1({
  requestId: "550e8400-e29b-41d4-a716-446655440099",
  owner: account.address, inputToken: PROTOCOL_REGISTRY.aaveV3.assets.USDG.underlying.address,
  inputAtomic: "1000000", nonce: `0x${"77".repeat(32)}`, nowSec: nowSec - 100,
  displayGoal: "Best registered stablecoin yield", competitionDurationSec: 300,
  deadlineDurationSec: 600, maxConversionLossBps: 100,
  minimumReceiptValueBps: 9_900, horizonDays: 30, forbiddenTargets: [],
});
const generalAssetPolicy = GeneralAssetPolicyV1Schema.parse({
  version: 1, kind: "general-asset", requestId: "550e8400-e29b-41d4-a716-446655440088",
  displayGoal: "Swap an exact arbitrary token", owner: account.address.toLowerCase(),
  sourceChainId: 1, destinationChainId: 196, nonce: `0x${"88".repeat(32)}`,
  createdAt: nowSec - 100, deadline: nowSec + 1_800,
  competition: { closesAt: nowSec + 300, maxRevisionsPerSolver: 5 }, maxEvidenceAgeSec: 300,
  manifestHash: `0x${"91".repeat(32)}`, inputIdentityHash: `0x${"92".repeat(32)}`,
  inputValuationHash: `0x${"93".repeat(32)}`,
  input: { chainId: 1, token: "0x2222222222222222222222222222222222222222",
    maximumAtomic: "1000", maximumUsdE8: "100000000" },
  outputs: [{ chainId: 196, token: "0x3333333333333333333333333333333333333333",
    minimumAtomic: "1", identityHash: `0x${"94".repeat(32)}` }],
  allowedAdapters: [{ id: "lifi.route", version: 1 }],
  limits: { maxStages: 2, maxCallsPerStage: 2, maxApprovals: 4, maxCalldataBytes: 1024,
    maxGasPerStage: "1000000", maxNativeValueUsdE8: "1000000", maxBridgeFeeUsdE8: "1000000",
    maxSolverFeeUsdE8: "0", maxConversionLossBps: 200, maxSlippageBps: 100 },
  forbiddenTargets: [], forbiddenAssets: [],
});

async function signedRequest(signature?: `0x${string}`) {
  const ownerSignature = signature ?? await account.signMessage({ message: { raw: commitment(policy) } });
  return new Request("https://cobia.example/api/intents", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ policy, ownerSignature }),
  });
}

async function signedCompositionRequest() {
  const ownerSignature = await account.signMessage({ message: { raw: commitment(compositionPolicy) } });
  return new Request("https://cobia.example/api/intents", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ policy: compositionPolicy, ownerSignature }),
  });
}

const compilationLeaseId = "550e8400-e29b-41d4-a716-446655440077";

async function signedGeneralAssetRequest(value = generalAssetPolicy, includeLease = true) {
  const ownerSignature = await account.signMessage({ message: { raw: commitment(value) } });
  return new Request("https://cobia.example/api/intents", { method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ policy: value, ownerSignature,
      ...(includeLease ? { compilationLeaseId } : {}) }) });
}

describe("general intent competition API", () => {
  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(nowSec * 1_000);
    vi.clearAllMocks();
    mocks.listDiscoverWithSnapshots.mockResolvedValue([]);
    mocks.publish.mockResolvedValue(undefined);
    mocks.publishComposition.mockResolvedValue(undefined);
    mocks.publishGeneralAsset.mockResolvedValue(undefined);
  });

  it("lists fresh signed intents for independent solver harnesses", async () => {
    mocks.listDiscoverWithSnapshots.mockResolvedValueOnce([{
      intent: {
        id: policy.requestId,
        owner: policy.owner,
        chainId: 196,
        displayGoal: policy.displayGoal,
        policyHash: commitment(policy),
        policy,
        ownerSignature: await account.signMessage({ message: { raw: commitment(policy) } }),
        state: "collecting",
        competitionClosesAt: new Date(policy.competition.closesAt * 1_000),
        selectedSubmissionId: null,
        createdAt: new Date((nowSec - 100) * 1_000),
        updatedAt: new Date((nowSec - 100) * 1_000),
      },
      snapshot: {
        intentId: policy.requestId,
        snapshotHash: commitment(snapshot),
        snapshot,
        createdAt: new Date((nowSec - 90) * 1_000),
      },
    }]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control"))
      .toBe("public, max-age=0, s-maxage=10, stale-while-revalidate=30");
    await expect(response.json()).resolves.toEqual({
      observedAt: nowSec,
      intents: [{
        id: policy.requestId,
        policy,
        policyHash: commitment(policy),
        ownerSignature: expect.stringMatching(/^0x[0-9a-f]{130}$/),
        snapshot,
        snapshotHash: commitment(snapshot),
        competitionClosesAt: policy.competition.closesAt,
        links: { intent: `/api/intents/${policy.requestId}`,
          decisions: `/api/intents/${policy.requestId}/decisions` },
      }],
    });
    expect(mocks.listDiscoverWithSnapshots).toHaveBeenCalledWith(nowSec);
  });

  it("publishes the signed open intent for independent competing solvers", async () => {
    const response = await POST(await signedRequest());

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      intentId: policy.requestId, policyHash: commitment(policy), state: "collecting",
      competitionClosesAt: policy.competition.closesAt,
      links: { intent: `/intents/${policy.requestId}` },
    });
    expect(mocks.publish).toHaveBeenCalledWith(expect.objectContaining({ policy }));
  });

  it("publishes a signed registered composition through the same competition API", async () => {
    const response = await POST(await signedCompositionRequest());

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      intentId: compositionPolicy.requestId,
      policyHash: commitment(compositionPolicy),
      competitionClosesAt: compositionPolicy.competition.closesAt,
    });
    expect(mocks.publishComposition).toHaveBeenCalledWith(expect.objectContaining({
      policy: compositionPolicy,
    }));
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("publishes a signed exact-address general asset policy", async () => {
    const response = await POST(await signedGeneralAssetRequest());

    expect(response.status).toBe(202);
    expect(mocks.publishGeneralAsset).toHaveBeenCalledWith(expect.objectContaining({
      policy: generalAssetPolicy, compilationLeaseId,
    }));
  });

  it("rejects a general asset publication without its server compilation receipt", async () => {
    const response = await POST(await signedGeneralAssetRequest(generalAssetPolicy, false));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_INTENT" });
    expect(mocks.publishGeneralAsset).not.toHaveBeenCalled();
  });

  it("returns an explicit refresh request when the compilation receipt expired", async () => {
    const { GeneralAssetRefreshRequiredError } = await import("../../../lib/runtime/market");
    mocks.publishGeneralAsset.mockRejectedValueOnce(new GeneralAssetRefreshRequiredError(
      "General asset compilation evidence expired; refresh before signing",
    ));

    const response = await POST(await signedGeneralAssetRequest());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "GENERAL_ASSET_REFRESH_REQUIRED",
      refresh: { method: "POST", href: "/api/intents/compile" },
    });
  });

  it("rejects a general asset policy without output identity evidence", async () => {
    const output = generalAssetPolicy.outputs[0]!;
    const unbound = { chainId: output.chainId, token: output.token,
      minimumAtomic: output.minimumAtomic };
    const response = await POST(await signedGeneralAssetRequest({
      ...generalAssetPolicy, outputs: [unbound],
    } as typeof generalAssetPolicy));

    expect(response.status).toBe(400);
    expect(mocks.publishGeneralAsset).not.toHaveBeenCalled();
  });

  it("rejects the wrong owner signature before persistence or sandbox scheduling", async () => {
    const other = privateKeyToAccount(`0x${"55".repeat(32)}`);
    const signature = await other.signMessage({ message: { raw: commitment(policy) } });
    const response = await POST(await signedRequest(signature));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_SIGNATURE" });
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("rejects an unfunded owner without charging for intent submission", async () => {
    const { OwnerBalanceRequiredError } = await import("../../../lib/runtime/market");
    mocks.publish.mockRejectedValueOnce(new OwnerBalanceRequiredError());

    const response = await POST(await signedRequest());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "OWNER_BALANCE_REQUIRED",
      message: "The owner needs a positive native balance on every execution chain.",
    });
  });

  it("reports a failed market snapshot without implying that an intent was published", async () => {
    const { IntentSnapshotUnavailableError } = await import("../../../lib/runtime/market");
    mocks.publish.mockRejectedValueOnce(new IntentSnapshotUnavailableError());

    const response = await POST(await signedRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "INTENT_SNAPSHOT_UNAVAILABLE",
      message: "Cobia could not capture a fresh X Layer market snapshot. Nothing was published; try again shortly.",
    });
  });
});
