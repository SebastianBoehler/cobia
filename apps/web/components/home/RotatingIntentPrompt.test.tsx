// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RotatingIntentPrompt } from "./RotatingIntentPrompt";

afterEach(() => { cleanup(); vi.useRealTimers(); });
beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  });
});

describe("RotatingIntentPrompt", () => {
  it("rotates complete labelled prompts instead of changing isolated words", () => {
    render(<RotatingIntentPrompt />);
    expect(screen.getByText(/Swap 10/)).toBeVisible();
    expect(screen.getByText("@USDG")).toBeVisible();
    expect(screen.queryByText(/subscription/)).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(4_500));

    expect(screen.getByText(/Supply 10/)).toBeVisible();
  });

  it("stays on the first prompt when reduced motion is requested", () => {
    vi.mocked(window.matchMedia).mockReturnValue({
      matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    } as unknown as MediaQueryList);
    render(<RotatingIntentPrompt />);

    act(() => vi.advanceTimersByTime(9_000));

    expect(screen.getByText(/Swap 10/)).toBeVisible();
  });

  it("lets the user stop and resume automatic changes", () => {
    render(<RotatingIntentPrompt />);
    act(() => screen.getByRole("button", { name: "Pause examples" }).click());

    act(() => vi.advanceTimersByTime(9_000));
    expect(screen.getByText(/Swap 10/)).toBeVisible();

    act(() => screen.getByRole("button", { name: "Play examples" }).click());
    act(() => vi.advanceTimersByTime(4_500));
    expect(screen.getByText(/Supply 10/)).toBeVisible();
  });

  it("adds the xStocks showcase only for public V4", () => {
    render(<RotatingIntentPrompt launchState="live" />);

    expect(screen.getByText(/Swap 10/)).toBeVisible();
    act(() => vi.advanceTimersByTime(4_500));
    expect(screen.getByText(/Acquire at least 0.01/)).toBeVisible();
    expect(screen.getByText("@TSLAx")).toBeVisible();
  });
});
