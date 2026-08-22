import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ read: vi.fn(), list: vi.fn() }));
vi.mock("../../components/layout/AppHeader", () => ({ AppHeader: () => null }));
vi.mock("../../lib/runtime/market", () => ({
  getNetworkOutcomeRepository: () => ({ read: mocks.read }),
  getSolverProfileRepository: () => ({ list: mocks.list }),
}));

import NetworkPage, { metadata } from "./page";

describe("network page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(2_000_000_000_000);
    mocks.read.mockResolvedValue({
      version: 1, observedAt: 2_000_000_000, window: "30d",
      metrics: { version: 1, totals: { confirmedOutcomes: 0, valuedOutcomes: 0,
        unvaluedOutcomes: 0, verifiedVolumeUsdE8: "0" }, solvers: [] },
      outcomes: [], nextCursor: null, exclusions: {},
    });
    mocks.list.mockResolvedValue([]);
  });

  it("loads one consistent observation window for network and solver evidence", async () => {
    const html = renderToStaticMarkup(await NetworkPage());
    expect(html).toContain("Cobia Network");
    expect(mocks.read).toHaveBeenCalledWith({
      window: "30d", limit: 20, cursor: null, observedAtSec: 2_000_000_000,
    });
    expect(mocks.list).toHaveBeenCalledWith(2_000_000_000);
    expect(metadata.alternates).toEqual({ canonical: "/network" });
  });

  it("keeps the public shell available when evidence storage fails", async () => {
    mocks.read.mockRejectedValue(new Error("database unavailable"));
    expect(renderToStaticMarkup(await NetworkPage())).toContain("Network evidence unavailable");
  });
});
