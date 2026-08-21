import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../components/layout/AppHeader", () => ({ AppHeader: () => null }));

import BuildXEvidencePage, { metadata } from "./page";

describe("Build X project page", () => {
  it("leads visitors from the trust boundary to public proof and the roadmap", () => {
    const html = renderToStaticMarkup(<BuildXEvidencePage />);
    const text = html.replace(/<[^>]+>/g, "");
    const boundaryIndex = html.indexOf('id="boundary"');
    const evidenceIndex = html.indexOf('id="evidence"');
    const roadmapIndex = html.indexOf('id="roadmap"');

    expect(text).toContain("AI proposes. Cobia proves what may execute.");
    expect(boundaryIndex).toBeGreaterThan(-1);
    expect(evidenceIndex).toBeGreaterThan(boundaryIndex);
    expect(roadmapIndex).toBeGreaterThan(evidenceIndex);
  });

  it("separates shipped evidence from the pending paid canary", () => {
    const html = renderToStaticMarkup(<BuildXEvidencePage />);

    expect(html).toContain("Deployed");
    expect(html).toContain("Live product");
    expect(html).toContain("Pending canary");
    expect(html).toContain("Awaiting the final production release");
    expect(html).not.toContain("Ethy settlement verified");
  });

  it("links the live product, source, social post, and both X Layer deployments", () => {
    const html = renderToStaticMarkup(<BuildXEvidencePage />);

    expect(html).toContain('href="https://getcobia.com"');
    expect(html).toContain('href="https://github.com/SebastianBoehler/cobia"');
    expect(html).toContain('href="https://x.com/Cobia_Web3/status/2090604315052302774"');
    expect(html).toContain("0x2278a9241529becaf1baac9a3de7777fd5ab6051e0e65b3b4fc45e1e3f3fc767");
    expect(html).toContain("https://www.oklink.com/x-layer-testnet/tx/");
    expect(html).toContain("0x68cff1d6bbba6b436d0be39cd91e772a811027519487a7fefe91d5bef81521a6");
  });

  it("uses protocol marks instead of decorative micro-labels", () => {
    const html = renderToStaticMarkup(<BuildXEvidencePage />);

    expect(html).not.toContain("BuildX AI Season · Judge evidence");
    expect(html).not.toContain(">The boundary<");
    expect(html).not.toContain(">Public evidence<");
    expect(html).not.toContain(">Why Cobia<");
    expect(html).not.toContain(">Product surface<");
    expect(html).toContain('aria-label="Aave V3"');
    expect(html).toContain('aria-label="Curve StableSwap"');
    expect(html).toContain('aria-label="Uniswap V3"');
  });

  it("keeps internal evaluation strategy out of the public experience", () => {
    const html = renderToStaticMarkup(<BuildXEvidencePage />);

    expect(html).not.toMatch(/judg(?:e|ing)/i);
    expect(metadata.title).toBe("Cobia for X Layer AI Season");
  });
});
