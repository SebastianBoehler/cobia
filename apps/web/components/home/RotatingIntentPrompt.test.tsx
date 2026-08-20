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
    expect(screen.getByText(/Move 10 USDG/)).toBeVisible();
    expect(screen.queryByText("Supported")).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(4_500));

    expect(screen.getByText(/Buy a listed resource/)).toBeVisible();
    expect(screen.queryByText("Supported when listed")).not.toBeInTheDocument();
  });

  it("stays on the first prompt when reduced motion is requested", () => {
    vi.mocked(window.matchMedia).mockReturnValue({
      matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    } as unknown as MediaQueryList);
    render(<RotatingIntentPrompt />);

    act(() => vi.advanceTimersByTime(9_000));

    expect(screen.getByText(/Move 10 USDG/)).toBeVisible();
  });

  it("lets the user stop and resume automatic changes", () => {
    render(<RotatingIntentPrompt />);
    act(() => screen.getByRole("button", { name: "Pause examples" }).click());

    act(() => vi.advanceTimersByTime(9_000));
    expect(screen.getByText(/Move 10 USDG/)).toBeVisible();

    act(() => screen.getByRole("button", { name: "Play examples" }).click());
    act(() => vi.advanceTimersByTime(4_500));
    expect(screen.getByText(/Buy a listed resource/)).toBeVisible();
  });
});
