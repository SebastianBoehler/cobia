// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IntentCompetitionRefresh } from "./IntentCompetitionRefresh";

const navigation = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: navigation.refresh }),
}));

afterEach(() => {
  cleanup();
  navigation.refresh.mockReset();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("IntentCompetitionRefresh", () => {
  it("refreshes a visible live competition every ten seconds and stops at close", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-21T15:00:00.000Z"));
    render(<IntentCompetitionRefresh closesAt="2026-08-21T15:00:15.000Z" />);

    act(() => { vi.advanceTimersByTime(10_000); });
    expect(navigation.refresh).toHaveBeenCalledOnce();

    act(() => { vi.advanceTimersByTime(10_000); });
    expect(navigation.refresh).toHaveBeenCalledOnce();
  });

  it("does not poll a hidden tab and refreshes once when it becomes visible", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-21T15:00:00.000Z"));
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    render(<IntentCompetitionRefresh closesAt="2026-08-21T15:05:00.000Z" />);

    act(() => { vi.advanceTimersByTime(30_000); });
    expect(navigation.refresh).not.toHaveBeenCalled();

    visibility.mockReturnValue("visible");
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(navigation.refresh).toHaveBeenCalledOnce();
  });
});
