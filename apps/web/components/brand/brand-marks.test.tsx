// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AssetMark } from "./AssetMark";
import { ProtocolMark } from "./ProtocolMark";

describe("brand marks", () => {
  it.each(["USDG", "USDt0"] as const)("renders the %s asset identity", (asset) => {
    render(<AssetMark asset={asset} />);
    expect(screen.getByRole("img", { name: `${asset} token` })).toBeInTheDocument();
  });

  it.each(["Aave V3", "Curve", "Uniswap V3"] as const)(
    "renders the %s protocol identity",
    (protocol) => {
      render(<ProtocolMark protocol={protocol} />);
      expect(screen.getByRole("img", { name: protocol })).toBeInTheDocument();
    },
  );

  it("uses an accessible neutral mark for a future registered protocol", () => {
    render(<ProtocolMark protocol="Stargate" />);
    expect(screen.getByRole("img", { name: "Stargate" })).toHaveTextContent("S");
  });
});
