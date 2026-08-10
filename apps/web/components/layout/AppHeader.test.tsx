// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppHeader } from "./AppHeader";

vi.mock("../wallet/WalletButton", () => ({ WalletButton: () => <button>Connect wallet</button> }));

describe("AppHeader", () => {
  it("links to every primary product surface", () => {
    render(<AppHeader />);
    expect(screen.getByRole("link", { name: "Explore" })).toHaveAttribute("href", "/markets");
    expect(screen.getByRole("link", { name: "Portfolio" })).toHaveAttribute("href", "/portfolio");
    expect(screen.getByRole("link", { name: "Activity" })).toHaveAttribute("href", "/activity");
    expect(screen.getByRole("link", { name: "Custom" })).toHaveAttribute("href", "/requests/new");
  });
});
