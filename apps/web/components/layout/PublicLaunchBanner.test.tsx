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
  it("names live V3 capabilities and counts down to the V4 canary gate", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-21T00:00:00Z"));
    await renderStatus({ state: "live", activationAt: 0,
      v4: { state: "canary-scheduled", activationAt: 1_787_360_461 } });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Live now · USDG/USDt0 swaps and Aave on X Layer V4 canary in 1d 1h 1m · verified ERC-20 swaps next",
    );
    expect(screen.getByRole("status")).not.toHaveTextContent("1s");
  });

  it("does not claim public V4 when only canary activation is ready", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-23T02:00:00Z"));
    await renderStatus({ state: "live", activationAt: 0,
      v4: { state: "canary-scheduled", activationAt: 1_787_440_661 } });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Live now · USDG/USDt0 swaps and Aave on X Layer V4 canary activation ready",
    );
  });

  it("counts down only after the separate V4 public proposal", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T18:00:00Z"));
    await renderStatus({ state: "live", activationAt: 0,
      v4: { state: "public-scheduled", activationAt: 1_787_770_860 } });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Live now · USDG/USDt0 swaps and Aave on X Layer V4 public access in 1d 1h 1m",
    );
  });

  it("shows the authoritative V4 live state", async () => {
    await renderStatus({ state: "live", activationAt: 0,
      v4: { state: "live", activationAt: 0 } });
    expect(screen.getByRole("status")).toHaveTextContent(
      "V4 + xStocks live · Verified TSLAx acquisition and standard ERC-20 swaps on X Layer",
    );
  });
});
