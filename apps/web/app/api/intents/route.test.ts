import { commitment, OpenIntentPolicyV3Schema } from "@cobia/domain";
import { privateKeyToAccount } from "viem/accounts";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listDiscoverWithSnapshots: vi.fn(),
  publish: vi.fn(async () => undefined),
}));
vi.mock("../../../lib/runtime/market", () => ({
  getIntentRepository: () => ({ listDiscoverWithSnapshots: mocks.listDiscoverWithSnapshots }),
  publishOpenIntent: mocks.publish,
  OwnerBalanceRequiredError: class OwnerBalanceRequiredError extends Error {},
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

async function signedRequest(signature?: `0x${string}`) {
  const ownerSignature = signature ?? await account.signMessage({ message: { raw: commitment(policy) } });
  return new Request("https://cobia.example/api/intents", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ policy, ownerSignature }),
  });
}

describe("general intent competition API", () => {
  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(nowSec * 1_000);
    vi.clearAllMocks();
    mocks.listDiscoverWithSnapshots.mockResolvedValue([]);
    mocks.publish.mockResolvedValue(undefined);
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
});
