// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppHeader } from "./AppHeader";

vi.mock("../wallet/WalletButton", () => ({ WalletButton: () => <button>Connect wallet</button> }));
vi.mock("next/navigation", () => ({ usePathname: () => "/requests/new" }));
afterEach(cleanup);

describe("AppHeader", () => {
  it("links to intent, portfolio, activity, and the solver marketplace", () => {
    render(<AppHeader />);
    expect(screen.getByRole("link", { name: "New intent" })).toHaveAttribute("href", "/requests/new");
    expect(screen.getByRole("link", { name: "New intent" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Positions" })).toHaveAttribute("href", "/portfolio");
    expect(screen.getByRole("link", { name: "Activity" })).toHaveAttribute("href", "/activity");
    expect(screen.getByRole("link", { name: "Solver market" })).toHaveAttribute("href", "/markets");
    expect(screen.queryByRole("link", { name: "Explore" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Portfolio" })).not.toBeInTheDocument();
  });

  it("keeps the execution network with the brand instead of the navigation", () => {
    render(<AppHeader />);
    const navigation = screen.getByRole("navigation", { name: "Primary navigation" });
    const network = screen.getByTitle("X Layer Mainnet");
    expect(network).toHaveTextContent("X Layer");
    expect(within(navigation).queryByText(/X Layer/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cobia home" }).parentElement).toContainElement(network);
  });
});
