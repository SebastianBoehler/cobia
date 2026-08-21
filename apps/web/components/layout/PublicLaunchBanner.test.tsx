// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicLaunchBanner } from "./PublicLaunchBanner";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function renderStatus(status: object) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(status)));
  await act(async () => { render(<PublicLaunchBanner />); });
  await act(async () => { await Promise.resolve(); });
}

describe("PublicLaunchBanner", () => {
  it("counts down to public access without a noisy seconds live region", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-21T00:00:00Z"));
    await renderStatus({ state: "scheduled", activationAt: 1_787_360_461 });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Mainnet launch ready · Public access opens in 1d 1h 1m",
    );
    expect(screen.getByRole("status")).not.toHaveTextContent("1s");
  });

  it("does not claim the launch is live until governance activates it", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-23T02:00:00Z"));
    await renderStatus({ state: "scheduled", activationAt: 1_787_440_661 });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Mainnet launch ready · Governance activation pending",
    );
  });

  it("shows the authoritative live state", async () => {
    await renderStatus({ state: "live", activationAt: 0 });
    expect(screen.getByRole("status")).toHaveTextContent("Mainnet execution live on X Layer");
  });
});
