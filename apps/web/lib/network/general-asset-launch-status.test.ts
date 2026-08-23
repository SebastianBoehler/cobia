import { describe, expect, it } from "vitest";
import { classifyGeneralAssetLaunchStatus } from "./general-asset-launch-status";

describe("general asset launch status", () => {
  it("counts down to the canary gate while activation is pending", () => {
    expect(classifyGeneralAssetLaunchStatus({
      accessMode: 0, adapterActive: false, openAccessAfter: 0, paused: true,
      unpauseAfter: 2_000,
    })).toEqual({ state: "canary-scheduled", activationAt: 2_000 });
  });

  it("reports canary access without implying public access", () => {
    expect(classifyGeneralAssetLaunchStatus({
      accessMode: 0, adapterActive: true, openAccessAfter: 0, paused: false,
      unpauseAfter: 0,
    })).toEqual({ state: "canary-live", activationAt: 0 });
  });

  it("counts down to public access after its separate proposal", () => {
    expect(classifyGeneralAssetLaunchStatus({
      accessMode: 0, adapterActive: true, openAccessAfter: 4_000, paused: false,
      unpauseAfter: 0,
    })).toEqual({ state: "public-scheduled", activationAt: 4_000 });
  });

  it("claims public V4 only when access, pause, and adapter state agree", () => {
    expect(classifyGeneralAssetLaunchStatus({
      accessMode: 1, adapterActive: true, openAccessAfter: 0, paused: false,
      unpauseAfter: 0,
    })).toEqual({ state: "live", activationAt: 0 });
    expect(classifyGeneralAssetLaunchStatus({
      accessMode: 1, adapterActive: false, openAccessAfter: 0, paused: false,
      unpauseAfter: 0,
    })).toEqual({ state: "preparing", activationAt: 0 });
  });
});
