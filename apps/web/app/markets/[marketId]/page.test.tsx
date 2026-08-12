import { afterEach, describe, expect, it, vi } from "vitest";

const resolveMarket = vi.fn();

vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NOT_FOUND"); },
  redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); },
}));
vi.mock("@/components/layout/AppHeader", () => ({ AppHeader: () => null }));
vi.mock("@/components/markets/MarketDetailView", () => ({ MarketDetailView: () => null }));
vi.mock("@/components/product/ProductShell.module.css", () => ({
  default: { page: "page", heading: "heading" },
}));
vi.mock("@/lib/runtime/market", () => ({
  getMarketRepository: () => ({ resolveMarket }),
}));
vi.mock("@/lib/time", () => ({ currentUnixSeconds: () => 1_800_000_000 }));

import MarketPage, { generateMetadata } from "./page";

afterEach(() => resolveMarket.mockReset());

describe("MarketPage", () => {
  it("publishes a canonical social card for a solver market", async () => {
    const marketId = "196:0x4ae46a509f6b1d9056937ba4500cb143933d2dc8";
    const metadata = await generateMetadata({
      params: Promise.resolve({ marketId }),
    } as PageProps<"/markets/[marketId]">);
    expect(metadata.alternates).toEqual({ canonical: `/markets/${marketId}` });
    expect(metadata.openGraph).toMatchObject({
      url: `/markets/${marketId}`,
      images: [{ url: "/opengraph-image", width: 1200, height: 630 }],
    });
  });

  it("redirects a legacy attempt URL to the canonical market URL", async () => {
    const legacyAttemptId = "a10fe67a-f63f-4c82-8d63-145b08956839";
    const canonicalId = "196:0x4ae46a509f6b1d9056937ba4500cb143933d2dc8";
    resolveMarket.mockResolvedValue({
      canonicalId,
      resolvedFrom: "attempt",
      market: { id: canonicalId },
    });

    await expect(MarketPage({
      params: Promise.resolve({ marketId: legacyAttemptId }),
    } as never)).rejects.toThrow(`REDIRECT:/markets/${canonicalId}`);
  });
});
