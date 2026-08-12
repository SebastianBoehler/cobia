// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShareProofActions } from "./ShareProofActions";

afterEach(cleanup);

describe("ShareProofActions", () => {
  it("shares the public intent proof without exposing the purchased route URL", () => {
    render(<ShareProofActions
      requestId="550e8400-e29b-41d4-a716-446655440000"
      publicOrigin="https://cobia.finance/"
      summary="0.41% estimated pre-gas APY · route authorized"
    />);

    const share = screen.getByRole("link", { name: "Share proof on X" });
    expect(share).toHaveAttribute("href", expect.stringContaining("https%3A%2F%2Fcobia.finance%2Frequests%2F550e8400"));
    expect(share).not.toHaveAttribute("href", expect.stringContaining("cobia.finance%2F%2Frequests"));
    expect(share).toHaveAttribute("href", expect.stringContaining("X+Layer+DeFi+proof"));
    expect(screen.getByRole("button", { name: "Copy public proof link" })).toBeVisible();
  });

  it("shows a copy error instead of leaving a rejected clipboard promise", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    render(<ShareProofActions requestId="550e8400-e29b-41d4-a716-446655440000"
      publicOrigin="https://cobia.finance" summary="route authorized" />);

    fireEvent.click(screen.getByRole("button", { name: "Copy public proof link" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Copy failed" })).toBeVisible());
  });
});
