import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("../../../lib/runtime/market", () => ({
  getNetworkOutcomeRepository: () => mocks,
}));

import { GET } from "./route";

const report = {
  version: 1,
  observedAt: 2_000_000_000,
  window: "30d",
  metrics: {
    version: 1,
    totals: { confirmedOutcomes: 1, valuedOutcomes: 1, unvaluedOutcomes: 0,
      verifiedVolumeUsdE8: "100000000" },
    solvers: [{ solverId: "alpha-solver", confirmedOutcomes: 1, valuedOutcomes: 1,
      verifiedVolumeUsdE8: "100000000" }],
  },
  outcomes: [],
  nextCursor: null,
  exclusions: {},
};

describe("network API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(2_000_000_000_000);
    mocks.read.mockResolvedValue(report);
  });

  it("returns briefly cached verifier-derived network evidence", async () => {
    const response = await GET(new Request("https://cobia.example/api/network?window=30d&limit=20"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control"))
      .toBe("public, max-age=0, s-maxage=30, stale-while-revalidate=60");
    await expect(response.json()).resolves.toEqual(report);
    expect(mocks.read).toHaveBeenCalledWith({
      window: "30d", limit: 20, cursor: null, observedAtSec: 2_000_000_000,
    });
  });

  it.each([
    "window=7d",
    "window=30d&limit=1000",
    "window=30d&cursor=not-a-uuid",
    "window=30d&unknown=value",
  ])("rejects invalid public aggregation input: %s", async (query) => {
    const response = await GET(new Request(`https://cobia.example/api/network?${query}`));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_NETWORK_QUERY" });
  });

  it("reports repository failure without fabricating zero totals", async () => {
    mocks.read.mockRejectedValue(new Error("database unavailable"));
    const response = await GET(new Request("https://cobia.example/api/network"));
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toEqual({
      code: "NETWORK_UNAVAILABLE",
      message: "Verified network evidence is temporarily unavailable.",
    });
    expect(body).not.toHaveProperty("metrics");
  });
});
