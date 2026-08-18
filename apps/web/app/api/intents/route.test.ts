import { commitment, GeneralIntentPolicyV2Schema } from "@cobia/domain";
import { privateKeyToAccount } from "viem/accounts";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  publish: vi.fn(async () => undefined),
  open: vi.fn(async () => ({ status: "abstained", runId: "run-v3" })),
  schedule: vi.fn((task: () => Promise<unknown>) => task()),
}));
vi.mock("../../../lib/runtime/market", () => ({
  publishGeneralIntent: mocks.publish,
  openGeneralIntentMarket: mocks.open,
  ActiveManifestMismatchError: class ActiveManifestMismatchError extends Error {},
}));
vi.mock("../../../lib/runtime/after-response", () => ({
  scheduleAfterResponse: mocks.schedule,
}));

import { POST } from "./route";

const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
const nowSec = 2_000_000_100;
const policy = GeneralIntentPolicyV2Schema.parse({
  version: 2, kind: "general-onchain", requestId: "550e8400-e29b-41d4-a716-446655440000",
  displayGoal: "Increase the verified Aave receipt balance",
  owner: account.address, executionChainId: 196, nonce: `0x${"22".repeat(32)}`,
  createdAt: nowSec - 100, deadline: nowSec + 1_800, maxEvidenceAgeSec: 300,
  competition: { closesAt: nowSec + 300, maxRevisionsPerSolver: 5 },
  manifestHash: `0x${"33".repeat(32)}`,
  input: { token: "0x2222222222222222222222222222222222222222", maxAtomic: "10000000" },
  allowedCapabilities: [{ id: "aave-v3.supply", version: 1 }],
  limits: { maxActions: 2, maxApprovals: 2, maxActionCalldataBytes: 1024, maxExpectedGas: 1_000_000 },
  forbiddenTargets: [], forbiddenAssets: [],
  balanceConstraints: [{ kind: "minimumIncrease", token: "0x4444444444444444444444444444444444444444", atomic: "9950000" }],
  predicates: [], objective: { kind: "satisfy" },
});

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
    mocks.publish.mockResolvedValue(undefined);
    mocks.open.mockResolvedValue({ status: "abstained", runId: "run-v3" });
    mocks.schedule.mockImplementation((task) => task());
  });

  it("publishes the signed intent and schedules a solver without waiting for a quote", async () => {
    const response = await POST(await signedRequest());

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      intentId: policy.requestId, policyHash: commitment(policy), state: "collecting",
      competitionClosesAt: policy.competition.closesAt,
      links: { intent: `/intents/${policy.requestId}` },
    });
    expect(mocks.publish).toHaveBeenCalledWith(expect.objectContaining({ policy }));
    expect(mocks.open).toHaveBeenCalledWith(expect.objectContaining({
      policy, revision: 1, observedAtSec: nowSec,
    }));
  });

  it("rejects the wrong owner signature before persistence or sandbox scheduling", async () => {
    const other = privateKeyToAccount(`0x${"55".repeat(32)}`);
    const signature = await other.signMessage({ message: { raw: commitment(policy) } });
    const response = await POST(await signedRequest(signature));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_SIGNATURE" });
    expect(mocks.publish).not.toHaveBeenCalled();
    expect(mocks.schedule).not.toHaveBeenCalled();
  });
});
