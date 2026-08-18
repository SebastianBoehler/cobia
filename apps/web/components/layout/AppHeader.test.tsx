// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppHeader } from "./AppHeader";
import { WalletProvider } from "../wallet/WalletProvider";

vi.mock("../wallet/WalletButton", () => ({ WalletButton: () => <button>Connect wallet</button> }));
vi.mock("next/navigation", () => ({ usePathname: () => "/intents/new" }));
afterEach(cleanup);

describe("AppHeader", () => {
  it("offers a keyboard shortcut past repeated navigation", () => {
    render(<AppHeader />);

    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute(
      "href",
      "#main-content",
    );
  });

  it("links to intent, portfolio, activity, and discovery", () => {
    render(<AppHeader />);
    expect(screen.getByRole("link", { name: "Intent" })).toHaveAttribute("href", "/intents/new");
    expect(screen.getByRole("link", { name: "Intent" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Portfolio" })).toHaveAttribute("href", "/portfolio");
    expect(screen.getByRole("link", { name: "Activity" })).toHaveAttribute("href", "/activity");
    expect(screen.getByRole("link", { name: "Discover" })).toHaveAttribute("href", "/discover");
    expect(screen.queryByRole("link", { name: "Solver market" })).not.toBeInTheDocument();
  });

  it("keeps the execution network with the brand instead of the navigation", () => {
    render(<AppHeader />);
    const navigation = screen.getByRole("navigation", { name: "Primary navigation" });
    const network = screen.getByTitle("X Layer Mainnet");
    expect(network).toHaveTextContent("X Layer");
    expect(within(navigation).queryByText(/X Layer/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cobia home" }).parentElement).toContainElement(network);
  });

  it("gives every primary destination a compact mobile tab icon", () => {
    render(<AppHeader />);
    const navigation = screen.getByRole("navigation", { name: "Primary navigation" });

    expect(navigation.querySelectorAll(".app-header__nav-icon")).toHaveLength(4);
  });

  it("labels testnet and removes mainnet-only product destinations", () => {
    render(<WalletProvider targetChainId={1952}><AppHeader /></WalletProvider>);

    expect(screen.getByTitle("X Layer Testnet")).toHaveTextContent("Testnet");
    expect(screen.getByRole("link", { name: "Portfolio" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Intent" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Activity" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Discover" })).not.toBeInTheDocument();
  });
});
