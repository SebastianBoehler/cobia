import { describe, expect, it } from "vitest";
import { nextStageStateV4, StageTransitionErrorV4 } from "./stage-machine";

describe("general asset V4 stage machine", () => {
  it("requires a delivered predecessor before preparing or arming the next chain", () => {
    expect(() => nextStageStateV4({
      state: "pending", event: "prepare", predecessorState: "finalized",
    })).toThrow(StageTransitionErrorV4);
    expect(nextStageStateV4({
      state: "pending", event: "prepare", predecessorState: "delivered",
    })).toBe("prepared");
    expect(() => nextStageStateV4({
      state: "prepared", event: "arm", predecessorState: "finalized",
    })).toThrow("predecessor");
  });

  it("serializes arm-before-submit and finality-before-delivery", () => {
    expect(() => nextStageStateV4({ state: "prepared", event: "submit" }))
      .toThrow("armed");
    expect(nextStageStateV4({ state: "prepared", event: "arm" }))
      .toBe("broadcasting");
    expect(nextStageStateV4({ state: "broadcasting", event: "submit" }))
      .toBe("submitted");
    expect(() => nextStageStateV4({
      state: "submitted", event: "record_delivery", deliveryKind: "bridge",
    })).toThrow("finalized");
    expect(nextStageStateV4({ state: "submitted", event: "finalize" }))
      .toBe("finalized");
    expect(nextStageStateV4({
      state: "finalized", event: "record_delivery", deliveryKind: "bridge",
    })).toBe("delivered");
  });

  it("confirms only a final non-bridge stage and freezes any ambiguity", () => {
    expect(nextStageStateV4({
      state: "finalized", event: "confirm", deliveryKind: "none",
    })).toBe("confirmed");
    expect(() => nextStageStateV4({
      state: "finalized", event: "confirm", deliveryKind: "bridge",
    })).toThrow("delivery");
    expect(nextStageStateV4({
      state: "delivered", event: "require_reconciliation", deliveryKind: "bridge",
    })).toBe("reconciliation_required");
    expect(() => nextStageStateV4({
      state: "reconciliation_required", event: "prepare",
    })).toThrow("manual reconciliation");
  });
});
