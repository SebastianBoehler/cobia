import { describe, expect, it } from "vitest";
import { classifyGeneralAssetLaunchStatus } from "./general-asset-launch-status";

describe("general asset launch status", () => {
  it("counts down to the canary gate while activation is pending", () => {
    expect(classifyGeneralAssetLaunchStatus({
      accessMode: 0, openAccessAfter: 0, paused: true,
      unpauseAfter: 2_000,
    })).toEqual({ state: "canary-scheduled", activationAt: 2_000 });
  });

  it("reports canary access without implying public access", () => {
    expect(classifyGeneralAssetLaunchStatus({
      accessMode: 0, openAccessAfter: 0, paused: false,
      unpauseAfter: 0,
    })).toEqual({ state: "canary-live", activationAt: 0 });
  });

  it("counts down to public access after its separate proposal", () => {
    expect(classifyGeneralAssetLaunchStatus({
      accessMode: 0, openAccessAfter: 4_000, paused: false,
      unpauseAfter: 0,
    })).toEqual({ state: "public-scheduled", activationAt: 4_000 });
  });

  it("claims public V4 from contract access without a plugin admission gate", () => {
    expect(classifyGeneralAssetLaunchStatus({
      accessMode: 1, openAccessAfter: 0, paused: false,
      unpauseAfter: 0,
    })).toEqual({ state: "live", activationAt: 0 });
    expect(classifyGeneralAssetLaunchStatus({
      accessMode: 1, openAccessAfter: 0, paused: false,
      unpauseAfter: 0,
    })).toEqual({ state: "live", activationAt: 0 });
  });

  it("shows the canary gate first when public and canary timers overlap", () => {
    expect(classifyGeneralAssetLaunchStatus({
      accessMode: 0, openAccessAfter: 4_000, paused: true,
      unpauseAfter: 2_000,
    })).toEqual({ state: "canary-scheduled", activationAt: 2_000 });
  });
});
