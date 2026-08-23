import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../components/layout/AppHeader", () => ({ AppHeader: () => null }));

import BuildXEvidencePage, { metadata } from "./page";

describe("Build X project page", () => {
  it("leads visitors from a real product recording to mainnet proof before architecture", () => {
    const html = renderToStaticMarkup(<BuildXEvidencePage />);
    const text = html.replace(/<[^>]+>/g, "");
    const productProofIndex = html.indexOf('id="product-proof"');
    const boundaryIndex = html.indexOf('id="boundary"');
    const evidenceIndex = html.indexOf('id="evidence"');

    expect(text).toContain("AI proposes. Cobia proves what may execute.");
    expect(productProofIndex).toBeGreaterThan(-1);
    expect(evidenceIndex).toBeGreaterThan(productProofIndex);
    expect(boundaryIndex).toBeGreaterThan(evidenceIndex);
    expect(html).not.toContain('id="roadmap"');
  });

  it("keeps incomplete canaries out of the primary proof list", () => {
    const html = renderToStaticMarkup(<BuildXEvidencePage />);

    expect(html).toContain("Deployed");
    expect(html).toContain("Live product");
    expect(html).toContain("Confirmed outcome");
    expect(html).toContain("First mainnet intent outcome");
    expect(html).toContain("1 USDt0 for 0.999471 USDG");
    expect(html).not.toContain("Canary attempted");
    expect(html).not.toContain("No settlement transaction or independently verifiable receipt has been observed");
    expect(html).not.toContain("Ethy settlement verified");
  });

  it("surfaces the existing product proof and quantified live evidence", () => {
    const html = renderToStaticMarkup(<BuildXEvidencePage />);

    expect(html).toContain("Build X · General Hackathon");
    expect(html).toContain("transaction firewall for AI agents on X Layer");
    expect(html).toContain("25+ confirmed outcomes");
    expect(html).toContain("3 signed solver profiles");
    expect(html).toContain('/media/cobia-live-intent-flow-x-layer.mp4');
    expect(html).toContain("Why Cobia matters to X Layer.");
  });

  it("links the live product, source, social post, and both X Layer deployments", () => {
    const html = renderToStaticMarkup(<BuildXEvidencePage />);

    expect(html).toContain('href="https://getcobia.com"');
    expect(html).toContain('href="https://github.com/SebastianBoehler/cobia"');
    expect(html).toContain('href="/network"');
    expect(html).toContain('href="https://x.com/Cobia_Web3/status/2090604315052302774"');
    expect(html).toContain("0x2278a9241529becaf1baac9a3de7777fd5ab6051e0e65b3b4fc45e1e3f3fc767");
    expect(html).toContain("0x83500273bbdaf6f2ad5e27f3d6807b7555383599ea537eca0206f9c18ab0d210");
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
