// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AppFooter } from "./AppFooter";

afterEach(cleanup);

describe("AppFooter", () => {
  it("exposes the product, solver, documentation, and legal entry points", () => {
    render(<AppFooter targetChainId={196} />);

    expect(screen.getByRole("contentinfo")).toBeVisible();
    expect(screen.getByRole("link", { name: "Create an intent" })).toHaveAttribute("href", "/intents/new");
    expect(screen.getByRole("link", { name: "Build a solver" })).toHaveAttribute("href", "/docs/quickstart");
    expect(screen.getByRole("link", { name: "Developer docs" })).toHaveAttribute("href", "/docs");
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
    expect(screen.getByText(/wallet keeps execution authority/i)).toBeVisible();
  });

  it("does not label the rehearsal site as mainnet", () => {
    render(<AppFooter targetChainId={1952} />);

    expect(screen.getByText("X Layer testnet · chain 1952")).toBeVisible();
  });
});
