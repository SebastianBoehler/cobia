import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ confirm: vi.fn() }));
vi.mock("../../../../../../lib/runtime/commerce-placement", () => ({
  confirmProductionCommerceSettlementV1: mocks.confirm,
}));

import { CommerceSettlementErrorV1 } from "../../../../../../lib/commerce/settlement-service";
import { POST } from "./route";

const placementId = "550e8400-e29b-41d4-a716-446655440077";
const context = { params: Promise.resolve({ placementId }) };
const signature = `0x${"11".repeat(65)}`;
function request(body: unknown) {
  return new Request(`https://getcobia.com/api/commerce/placements/${placementId}/settlement`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}

describe("commerce settlement API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns payment-settled only after independent confirmation", async () => {
    mocks.confirm.mockResolvedValue({
      state: "confirmed", outcome: "payment-settled", transactionHash: `0x${"22".repeat(32)}`,
    });
    const body = { plan: {}, template: {}, settlement: {}, signature };
    const response = await POST(request(body), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ state: "confirmed", outcome: "payment-settled" });
    expect(mocks.confirm).toHaveBeenCalledWith({ placementId, ...body });
  });

  it("keeps insufficient confirmations pending", async () => {
    mocks.confirm.mockRejectedValue(new CommerceSettlementErrorV1(
      "SETTLEMENT_PENDING", "awaiting confirmations", ["PAYMENT_SETTLEMENT_UNCONFIRMED"],
    ));
    const response = await POST(request({ plan: {}, template: {}, settlement: {}, signature }), context);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "SETTLEMENT_PENDING", details: ["PAYMENT_SETTLEMENT_UNCONFIRMED"],
    });
  });

  it("rejects malformed evidence without querying X Layer", async () => {
    const response = await POST(request({ plan: {}, signature: "0x12" }), context);
    expect(response.status).toBe(400);
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
});
