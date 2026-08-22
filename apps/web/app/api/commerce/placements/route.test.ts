import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ prepare: vi.fn(), read: vi.fn() }));
vi.mock("../../../../lib/runtime/commerce-placement", () => ({
  prepareProductionCommercePlacementV1: mocks.prepare,
  readProductionCommercePlacementStatusV1: mocks.read,
}));

import { CommercePlacementErrorV1 } from "../../../../lib/commerce/placement-service";
import { GET, POST } from "./route";

const signature = `0x${"11".repeat(65)}`;
function request(body: unknown) {
  return new Request("https://getcobia.com/api/commerce/placements", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}

describe("commerce placement API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns only the verified placement and exact authorization template", async () => {
    mocks.prepare.mockResolvedValue({
      placement: { id: "550e8400-e29b-41d4-a716-446655440077", state: "prepared" },
      authorization: { chainId: 196, typedData: { primaryType: "TransferWithAuthorization" } },
    });
    const body = { policy: {}, program: {}, evidence: {}, ownerSignature: signature };
    const response = await POST(request(body));
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      placement: { state: "prepared" }, authorization: { chainId: 196 },
    });
    expect(mocks.prepare).toHaveBeenCalledWith(body);
  });

  it("maps security rejections to stable non-success responses", async () => {
    const cases = [
      ["INVALID_SIGNATURE", 403], ["OFFER_NOT_FOUND", 404],
      ["VERIFICATION_REJECTED", 422], ["PLACEMENT_MODE_UNAVAILABLE", 409],
    ] as const;
    for (const [code, status] of cases) {
      mocks.prepare.mockRejectedValueOnce(new CommercePlacementErrorV1(code, "rejected", ["BOUND_CHANGED"]));
      const response = await POST(request({ policy: {}, program: {}, evidence: {}, ownerSignature: signature }));
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ code, message: "rejected", details: ["BOUND_CHANGED"] });
    }
  });

  it("rejects malformed bodies without invoking the runtime", async () => {
    const response = await POST(request({ policy: {}, ownerSignature: "0x12" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_REQUEST" });
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it("publishes a durable, non-sensitive pending status without claiming settlement", async () => {
    mocks.read.mockResolvedValue({
      id: "550e8400-e29b-41d4-a716-446655440077", state: "authorizing",
      updatedAt: new Date("2026-08-22T08:53:00.000Z"), owner: "0x1111111111111111111111111111111111111111",
      transactionHash: null, evidenceHash: null, rejectionCode: null,
    });

    const response = await GET(new Request("https://getcobia.com/api/commerce/placements?id=550e8400-e29b-41d4-a716-446655440077"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      placement: {
        id: "550e8400-e29b-41d4-a716-446655440077", state: "authorizing",
        updatedAt: "2026-08-22T08:53:00.000Z", transactionHash: null,
        evidenceHash: null, rejectionCode: null,
      },
      tracking: {
        status: "authorization-accepted", onchainTransaction: null,
        message: "Cobia accepted the signed authorization. Merchant acceptance and token transfer are not independently confirmed.",
      },
    });
    expect(mocks.read).toHaveBeenCalledWith("550e8400-e29b-41d4-a716-446655440077");
  });

  it("publishes an X Layer explorer link only after the merchant supplies a transaction", async () => {
    mocks.read.mockResolvedValue({
      id: "550e8400-e29b-41d4-a716-446655440077", state: "submitted",
      updatedAt: new Date("2026-08-22T08:54:00.000Z"), transactionHash: `0x${"22".repeat(32)}`,
      evidenceHash: null, rejectionCode: null,
    });

    const response = await GET(new Request("https://getcobia.com/api/commerce/placements?id=550e8400-e29b-41d4-a716-446655440077"));

    await expect(response.json()).resolves.toMatchObject({
      tracking: {
        status: "settlement-submitted",
        onchainTransaction: {
          hash: `0x${"22".repeat(32)}`,
          href: `https://web3.okx.com/explorer/xlayer/tx/0x${"22".repeat(32)}`,
        },
      },
    });
  });
});
