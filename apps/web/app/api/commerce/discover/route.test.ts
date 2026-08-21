import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ discover: vi.fn() }));
vi.mock("../../../../lib/runtime/commerce", () => ({
  refreshCommerceDiscoveryV1: mocks.discover,
}));

import { GET } from "./route";

describe("commerce discovery API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(2_000_000_000_000);
  });

  it("returns persisted snapshots plus source-specific errors", async () => {
    mocks.discover.mockResolvedValue({
      offers: [{ offerId: "x402:merchant:coffee", eligibility: { status: "discovery-only" } }],
      sourceErrors: [{ sourceId: "cdp", code: "DISCOVERY_SOURCE_INVALID", message: "bad row" }],
    });
    const response = await GET(new Request("https://cobia.example/api/commerce/discover?limit=20"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control"))
      .toBe("public, max-age=0, s-maxage=30, stale-while-revalidate=60");
    await expect(response.json()).resolves.toEqual({
      offers: [{ offerId: "x402:merchant:coffee", eligibility: { status: "discovery-only" } }],
      sourceErrors: [{ sourceId: "cdp", code: "DISCOVERY_SOURCE_INVALID", message: "bad row" }],
      generatedAt: 2_000_000_000,
    });
    expect(mocks.discover).toHaveBeenCalledWith({ nowSec: 2_000_000_000, limit: 20 });
  });

  it("rejects unbounded pagination", async () => {
    const response = await GET(new Request("https://cobia.example/api/commerce/discover?limit=1000"));
    expect(response.status).toBe(400);
    expect(mocks.discover).not.toHaveBeenCalled();
  });

  it("reports service failure without fabricating results", async () => {
    mocks.discover.mockRejectedValue(new Error("database unavailable"));
    const response = await GET(new Request("https://cobia.example/api/commerce/discover"));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: "COMMERCE_DISCOVERY_UNAVAILABLE" });
  });
});
