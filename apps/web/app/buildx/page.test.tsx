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

    expect(text).toContain("AI finds the route. Cobia proves every step stays within your limits.");
    expect(productProofIndex).toBeGreaterThan(-1);
    expect(evidenceIndex).toBeGreaterThan(productProofIndex);
    expect(boundaryIndex).toBeGreaterThan(evidenceIndex);
    expect(html).not.toContain('id="roadmap"');
  });

  it("keeps incomplete canaries out of the primary proof list", () => {
    const html = renderToStaticMarkup(<BuildXEvidencePage />);

    expect(html).toContain("Deployed");
    expect(html).toContain("Live product");
    expect(html).toContain("Proven on mainnet");
    expect(html).toContain("First verified mainnet result");
    expect(html).toContain("1 USDt0 into 0.999471 USDG");
    expect(html).not.toContain("Canary attempted");
    expect(html).not.toContain("No settlement transaction or independently verifiable receipt has been observed");
    expect(html).not.toContain("Ethy settlement verified");
  });

  it("surfaces the existing product proof and quantified live evidence", () => {
    const html = renderToStaticMarkup(<BuildXEvidencePage />);

    expect(html).toContain("Build X · General Hackathon");
    expect(html).toContain("without handing it control of your wallet");
    expect(html).toContain("34+ confirmed outcomes");
    expect(html).toContain("4 winning solvers");
    expect(html).toContain("TSLAx mainnet proof");
    expect(html).toContain('/media/cobia-live-intent-flow-x-layer.mp4');
    expect(html).toContain("Why Cobia matters to X Layer.");
  });

  it("makes the open V4 result and bounded transaction breadth explicit", () => {
    const html = renderToStaticMarkup(<BuildXEvidencePage />);
    const text = html.replace(/<[^>]+>/g, "");

    expect(text).toContain("V4 and xStocks are live on X Layer mainnet.");
    expect(text).toContain("0.01 OKB into 1.169308 USDG");
    expect(text).toContain("Existing product-flow demo · Recorded before V4 and xStocks opened");
    expect(text).toContain("public programs and transactions are the current mainnet proof");
    expect(html).toContain('/programs/4d1ccd00-1b2d-485a-9f57-6e4416959126');
    expect(html).toContain('/programs/3ceb168b-3a54-4560-ad9a-c1614401d6db');
    expect(html).toContain("0x573cf9e9e0c21e4cf1585cc4a4ec36a56d4063c779bb3de4e8bf514c56e2543f");
    expect(html).toContain("0xd8381e286f7dadde6a5ab363223b264b51f5aac4cc04cc3a41bfa979f67fcc4f");
    expect(text).toContain("Standard-token exchange");
    expect(text).toContain("Registered xStocks acquisition");
    expect(text).toContain("Lending");
    expect(text).toContain("Liquidity provision");
    expect(text).toContain("x402 payments");
    expect(text).toContain("Multi-step portfolio goals");
    expect(text).toContain("unknown assets, calls, and unsupported combinations fail closed");
    expect(text).toContain("forecasts, not guaranteed PnL");
    expect(html).not.toContain("any onchain transaction");
  });

  it("connects Cobia to X Layer's every-asset endgame without implying unfinished deployment", () => {
    const html = renderToStaticMarkup(<BuildXEvidencePage />);

    expect(html).toContain("Every asset, everywhere—without giving AI the keys.");
    expect(html).toContain("Live today for X Layer swaps, Aave, and registered TSLAx acquisition");
    expect(html).toContain("broader asset support adopting the same owner-controlled model");
    expect(html).toContain('title="X Layer post: every asset, everywhere, accessible on X Layer"');
    expect(html).toContain("platform.twitter.com/embed/Tweet.html?id=2091166000142012900");
    expect(html).toContain('href="https://x.com/XLayerOfficial/status/2091166000142012900"');
    expect(html).not.toContain("almost fully deployed");
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

  it("presents the proven xStocks acquisition without broad unsupported claims", () => {
    const html = renderToStaticMarkup(<BuildXEvidencePage />);
    const text = html.replace(/<[^>]+>/g, "");

    expect(html).not.toContain("BuildX AI Season · Judge evidence");
    expect(html).not.toContain(">The boundary<");
    expect(html).not.toContain(">Public evidence<");
    expect(html).not.toContain(">Why Cobia<");
    expect(html).not.toContain(">Product surface<");
    expect(html).toContain('aria-label="Aave V3"');
    expect(html).toContain('aria-label="OKX DEX"');
    expect(html).toContain('aria-label="Curve StableSwap"');
    expect(html).toContain('aria-label="Uniswap V3"');
    expect(html).toContain('aria-label="xStocks"');
    expect(text).toContain("Move, earn, and diversify through plans Cobia can verify.");
    expect(text).toContain("xStocksTSLAx acquisition · Live");
    expect(text).toContain("registered TSLAx acquisition");
    expect(text).not.toContain("xStocks remains staged");
    expect(text).not.toContain("all xStocks");
  });

  it("keeps internal evaluation strategy out of the public experience", () => {
    const html = renderToStaticMarkup(<BuildXEvidencePage />);

    expect(html).not.toMatch(/judg(?:e|ing)/i);
    expect(html).not.toContain("sq6dlj2onr8ml5xa");
    expect(html).not.toContain(">AI application<");
    expect(html).not.toContain(">Product completeness<");
    expect(html).toContain("X Layer ecosystem attribution");
    expect(html).toContain("Useful AI, bounded risk");
    expect(metadata.title).toBe("Cobia for X Layer AI Season");
  });
});
