import { describe, expect, it } from "vitest";
import { projectCompetitionProgramPreview, projectProgramProtocols } from "./submission-preview";

describe("projectCompetitionProgramPreview", () => {
  it("projects a comparable replay outcome and possible wallet steps", () => {
    expect(projectCompetitionProgramPreview([
      { kind: "snapshot", payload: { tokenEvidence: [{
        token: "0x2222222222222222222222222222222222222222", symbol: "USDt0", decimals: 6,
      }] } },
      { kind: "program", payload: {
        actions: [{}],
        balanceConstraints: [{ token: "0x2222222222222222222222222222222222222222", atomic: "950000" }],
      } },
      { kind: "evidence", payload: { balanceDeltas: [{
        token: "0x2222222222222222222222222222222222222222", beforeAtomic: "525665", afterAtomic: "1526002",
      }] } },
      { kind: "execution", payload: { program: { actions: [{ approvals: [{}] }] } } },
    ])).toEqual({
      outcomes: [{ symbol: "USDt0", decimals: 6, beforeAtomic: "525665", afterAtomic: "1526002", minimumAtomic: "950000" }],
      stepCount: 2,
    });
  });

  it("projects recognized protocols in first-use route order", () => {
    expect(projectProgramProtocols({ actions: [
      { capabilityId: "curve-stableswap-ng.exact-input" },
      { capabilityId: "aave-v3.supply" },
      { capabilityId: "curve-stableswap-ng.exact-input" },
      { capabilityId: "uniswap-v3.exact-input" },
      { capabilityId: "unknown-protocol.call" },
    ] })).toEqual(["Curve", "Aave V3", "Uniswap V3"]);
    expect(projectProgramProtocols({ actions: "not-a-route" })).toEqual([]);
  });
});
