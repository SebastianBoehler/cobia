import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  discover: vi.fn(),
  store: vi.fn(),
}));

vi.mock("../commerce/discovery-broker", () => ({
  discoverCommerceOffersV1: mocks.discover,
}));
vi.mock("../commerce/discovery-sources", () => ({ commerceDiscoverySourcesV1: [] }));
vi.mock("../commerce/node-commerce-fetch", () => ({
  nodeCommerceFetchV1: vi.fn(), nodeDnsResolverV1: vi.fn(),
}));
vi.mock("./market", () => ({
  getCommerceOfferRepository: () => ({ store: mocks.store }),
}));

import { refreshCommerceDiscoveryV1 } from "./commerce";

function offer(id: string, status: "executable" | "discovery-only") {
  return {
    offerId: id,
    eligibility: status === "executable"
      ? { status }
      : { status, blockedReason: "MERCHANT_UNREGISTERED" },
  };
}

describe("commerce discovery runtime", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the current scan supported-first instead of historical repository rows", async () => {
    const current = [offer("external-a", "discovery-only"),
      offer("supported", "executable"), offer("external-b", "discovery-only")];
    mocks.discover.mockResolvedValue({ offers: current, sourceErrors: [] });

    const result = await refreshCommerceDiscoveryV1({ nowSec: 2_000_000_000, limit: 2 });

    expect(mocks.store).toHaveBeenCalledTimes(3);
    expect(result.offers.map(({ offerId }) => offerId)).toEqual(["supported", "external-a"]);
  });
});
