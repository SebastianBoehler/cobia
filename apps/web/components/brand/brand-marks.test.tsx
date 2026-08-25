// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AssetMark } from "./AssetMark";
import { ProtocolMark } from "./ProtocolMark";
import { TokenAssetMark } from "./TokenAssetMark";

describe("brand marks", () => {
  it.each(["OKB", "USDG", "USDt0"] as const)("renders the %s asset identity", (asset) => {
    render(<AssetMark asset={asset} />);
    expect(screen.getByRole("img", { name: `${asset} token` })).toBeInTheDocument();
  });

  it.each(["Aave V3", "Curve", "Uniswap V3", "Pendle", "OKX DEX"] as const)(
    "renders the %s protocol identity",
    (protocol) => {
      render(<ProtocolMark protocol={protocol} />);
      expect(screen.getByRole("img", { name: protocol })).toBeInTheDocument();
    },
  );

  it.each([
    ["1inch", "oneinch"],
    ["Balancer V3", "balancer"],
    ["Compound V3", "compound"],
    ["CowSwap", "cowswap"],
    ["Ethena", "ethena"],
    ["Hyperliquid", "hyperliquid"],
    ["Jupiter", "jupiter"],
    ["Lido", "lido"],
    ["MakerDAO", "maker"],
    ["PancakeSwap V3", "pancakeswap"],
    ["QuickSwap V3", "quickswap"],
    ["Raydium CLMM", "raydium"],
    ["SushiSwap", "sushiswap"],
    ["Trader Joe", "traderjoe"],
    ["Yearn Finance", "yearn"],
  ] as const)("uses the %s logo", (protocol, kind) => {
    render(<ProtocolMark protocol={protocol} />);
    expect(screen.getByRole("img", { name: protocol })).toHaveClass(`brand-mark--${kind}`);
  });

  it("uses an accessible neutral mark for a future registered protocol", () => {
    render(<ProtocolMark protocol="Future Protocol" />);
    expect(screen.getByRole("img", { name: "Future Protocol" })).toHaveTextContent("F");
  });

  it("hides a protocol mark when adjacent text already names it", () => {
    const { container } = render(<ProtocolMark decorative protocol="Curve" />);
    const mark = container.querySelector(".brand-mark");
    expect(mark).toHaveAttribute("aria-hidden", "true");
    expect(mark).not.toHaveAttribute("aria-label");
    expect(mark).not.toHaveAttribute("role");
  });

  it("renders the official xStocks token asset for a canonical xStock symbol", () => {
    render(<TokenAssetMark symbol="TSLAx" />);
    expect(screen.getByRole("img", { name: "TSLAx token" }).querySelector("img"))
      .toHaveAttribute("src", "https://xstocks-metadata.backed.fi/logos/tokens/TSLAx.png");
  });
});
