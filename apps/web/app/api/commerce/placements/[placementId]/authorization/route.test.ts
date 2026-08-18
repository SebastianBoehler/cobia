import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authorize: vi.fn() }));
vi.mock("../../../../../../lib/runtime/commerce-placement", () => ({
  authorizeProductionCommercePlacementV1: mocks.authorize,
}));

import { CommerceAuthorizationErrorV1 } from "../../../../../../lib/commerce/authorization-service";
import { POST } from "./route";

const placementId = "550e8400-e29b-41d4-a716-446655440077";
const context = { params: Promise.resolve({ placementId }) };
const signature = `0x${"11".repeat(65)}`;
function request(body: unknown) {
  return new Request(`https://getcobia.com/api/commerce/placements/${placementId}/authorization`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}

describe("commerce authorization API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("submits one exact owner authorization without caching the paid result", async () => {
    mocks.authorize.mockResolvedValue({
      state: "submitted", transactionHash: `0x${"22".repeat(32)}`,
      resourceHash: `0x${"33".repeat(32)}`, resourceBodyBase64: "e30=",
    });
    const response = await POST(request({ template: {}, signature }), context);
    expect(response.status).toBe(202);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ state: "submitted", resourceBodyBase64: "e30=" });
    expect(mocks.authorize).toHaveBeenCalledWith({ placementId, template: {}, signature });
  });

  it("reports uncertain settlement without retrying it", async () => {
    mocks.authorize.mockRejectedValue(new CommerceAuthorizationErrorV1(
      "SETTLEMENT_UNCERTAIN", "Inspect the authorization nonce",
    ));
    const response = await POST(request({ template: {}, signature }), context);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      code: "SETTLEMENT_UNCERTAIN", message: "Inspect the authorization nonce",
    });
    expect(mocks.authorize).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed signatures before runtime execution", async () => {
    const response = await POST(request({ template: {}, signature: "0x12" }), context);
    expect(response.status).toBe(400);
    expect(mocks.authorize).not.toHaveBeenCalled();
  });
});
