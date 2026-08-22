// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppHeader } from "./AppHeader";
import { WalletProvider } from "../wallet/WalletProvider";

vi.mock("../wallet/WalletButton", () => ({ WalletButton: () => <button>Connect wallet</button> }));
vi.mock("next/link", () => ({
  default: ({ children, onNavigate, ...props }: React.ComponentProps<"a"> & { onNavigate?: () => void }) => (
    <a {...props} onClick={() => onNavigate?.()}>{children}</a>
  ),
}));
const mocks = vi.hoisted(() => ({ pathname: "/intents/new" }));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
afterEach(() => {
  cleanup();
  mocks.pathname = "/intents/new";
});

describe("AppHeader", () => {
  it("offers a keyboard shortcut past repeated navigation", () => {
    render(<AppHeader />);

    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute(
      "href",
      "#main-content",
    );
  });

  it("links to the primary product destinations", () => {
    render(<AppHeader />);
    expect(screen.getByRole("link", { name: "Intent" })).toHaveAttribute("href", "/intents/new");
    expect(screen.getByRole("link", { name: "Intent" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Portfolio" })).toHaveAttribute("href", "/portfolio");
    expect(screen.getByRole("link", { name: "Activity" })).toHaveAttribute("href", "/activity");
    expect(screen.getByRole("link", { name: "Discover" })).toHaveAttribute("href", "/discover");
    expect(screen.getByRole("link", { name: "Solvers" })).toHaveAttribute("href", "/solvers");
    expect(screen.getByRole("link", { name: "Docs" })).toHaveAttribute("href", "/docs");
    expect(screen.getByRole("link", { name: "Build a solver" })).toHaveAttribute("href", "/docs/quickstart");
  });

  it("starts primary navigation at the document top", () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    render(<AppHeader />);

    fireEvent.click(screen.getByRole("link", { name: "Portfolio" }));

    expect(scrollTo).toHaveBeenCalledWith({ behavior: "instant", left: 0, top: 0 });
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

    expect(navigation.querySelectorAll(".app-header__nav-icon")).toHaveLength(5);
  });

  it("marks solver profiles as part of the solver directory", () => {
    mocks.pathname = "/solvers/cobia-reference";
    render(<AppHeader />);

    expect(screen.getByRole("link", { name: "Solvers" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Discover" })).not.toHaveAttribute("aria-current");
  });

  it("labels testnet and removes mainnet-only product destinations", () => {
    render(<WalletProvider targetChainId={1952}><AppHeader /></WalletProvider>);

    expect(screen.getByTitle("X Layer Testnet")).toHaveTextContent("Testnet");
    expect(screen.getByRole("link", { name: "Portfolio" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Intent" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Activity" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Discover" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Solvers" })).not.toBeInTheDocument();
  });
});
