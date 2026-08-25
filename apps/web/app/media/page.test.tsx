import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../components/layout/AppHeader", () => ({ AppHeader: () => null }));

import MediaKitPage, { metadata } from "./page";

describe("Media kit page", () => {
  it("publishes only the approved Cobia assets and proof media", () => {
    const html = renderToStaticMarkup(<MediaKitPage />);

    expect(html).toContain("Cobia media kit");
    expect(html).toContain("Brand assets");
    expect(html).toContain("Product proof");
    expect(html).toContain("Company boilerplate");
    expect(html).toContain('href="/media/cobia-mark-cobalt.svg"');
    expect(html).toContain('href="/media/cobia-wordmark-dark.svg"');
    expect(html).toContain('src="/media/cobia-live-intent-flow-x-layer.mp4"');
    expect(html).toContain('src="/media/cobia-intent-proof-x-layer.mp4"');
    expect(html).toContain('alt="Cobia mainnet outcome"');
    expect(html).toContain('alt="Cobia portfolio showing indexed TSLAx buy and sell activity"');
    expect(html).toContain('href="/media/cobia-xstocks-portfolio-activity-2026-08-25.png"');
    expect(html).toContain("Live demo");
    expect(html).toContain("Motion cut");
    expect(html).toContain("Outcome image");
    expect(html).toContain("xStocks portfolio activity");
    expect(html).toContain('href="/media/cobia-intent-proof-x-layer.mp4"');
    expect(html).toContain("download");
    expect(html).not.toContain("marketing/remotion/output");
  });

  it("provides the canonical product and company links", () => {
    const html = renderToStaticMarkup(<MediaKitPage />);

    expect(html).toContain('href="https://getcobia.com"');
    expect(html).toContain('href="https://github.com/SebastianBoehler/cobia"');
    expect(html).toContain('href="https://x.com/Cobia_Web3"');
    expect(metadata.title).toBe("Media kit");
  });
});
