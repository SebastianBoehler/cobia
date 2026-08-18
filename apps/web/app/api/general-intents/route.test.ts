import { commitment, GeneralIntentPolicyV1Schema } from "@cobia/domain";
import { privateKeyToAccount } from "viem/accounts";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  open: vi.fn(async () => ({ jobId: "550e8400-e29b-41d4-a716-446655440099" })),
}));
vi.mock("../../../lib/runtime/market", () => ({
  openGeneralIntentMarket: mocks.open,
}));

import { POST } from "./route";

const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
const policy = GeneralIntentPolicyV1Schema.parse({
  version: 1, kind: "general-onchain", requestId: "550e8400-e29b-41d4-a716-446655440000",
  owner: account.address, executionChainId: 196, nonce: `0x${"22".repeat(32)}`,
  createdAt: 2_000_000_000, deadline: 2_000_001_800, maxEvidenceAgeSec: 300,
  manifestHash: `0x${"33".repeat(32)}`,
  input: { token: "0x2222222222222222222222222222222222222222", maxAtomic: "10000000" },
  allowedCapabilities: [{ id: "aave-v3.supply", version: 1 }],
  limits: { maxActions: 2, maxApprovals: 2, maxActionCalldataBytes: 1024, maxExpectedGas: 1_000_000 },
  forbiddenTargets: [], forbiddenAssets: [],
  balanceConstraints: [{ kind: "minimumIncrease", token: "0x4444444444444444444444444444444444444444", atomic: "9950000" }],
  predicates: [], objective: { kind: "satisfy" },
});

async function signedRequest(value: typeof policy, signature?: `0x${string}`) {
  const ownerSignature = signature ?? await account.signMessage({ message: { raw: commitment(value) } });
  return new Request("https://cobia.example/api/general-intents", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ policy: value, ownerSignature }),
  });
}

describe("general intent API", () => {
  beforeEach(() => mocks.open.mockClear());

  it("accepts only an exact owner-signed general policy", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000_100_000);
    const response = await POST(await signedRequest(policy));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      requestId: policy.requestId,
      policyHash: commitment(policy),
      agentProgramId: "550e8400-e29b-41d4-a716-446655440099",
    });
    expect(mocks.open).toHaveBeenCalledWith(policy);
  });

  it("rejects a signature from a different wallet before opening the sandbox", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000_100_000);
    const other = privateKeyToAccount(`0x${"55".repeat(32)}`);
    const signature = await other.signMessage({ message: { raw: commitment(policy) } });
    const response = await POST(await signedRequest(policy, signature));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_SIGNATURE" });
    expect(mocks.open).not.toHaveBeenCalled();
  });
});
