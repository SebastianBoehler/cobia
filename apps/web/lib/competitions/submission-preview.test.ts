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

  it("projects canonical transaction replay evidence and its detected DEX route", () => {
    const owner = "0x1111111111111111111111111111111111111111";
    const output = "0x2222222222222222222222222222222222222222";
    const intermediate = "0x3333333333333333333333333333333333333333";
    expect(projectCompetitionProgramPreview([
      { kind: "snapshot", payload: { tokenEvidence: [{
        token: output, symbol: "USDG", decimals: 6,
      }] } },
      { kind: "program", payload: { owner, stages: [{
        kind: "wallet-transaction", provider: "okx.dex@1",
        output: { token: output, minimumAtomic: "1166845" },
      }] } },
      { kind: "provider", payload: { artifacts: [{ payload: { response: { data: [{
        routerResult: { dexRouterList: [
          { dexProtocol: { dexName: "PotatoSwap" } },
          { dexProtocol: { dexName: "OkieStableSwap" } },
          { dexProtocol: { dexName: "CurveNG" } },
          { dexProtocol: { dexName: "Uniswap V4" } },
        ] },
      }] } } }] } },
      { kind: "evidence", payload: { simulations: [{ assetDeltas: [{
        token: intermediate, account: owner, beforeAtomic: "0",
        afterAtomic: "100", deltaAtomic: "100",
      }] }, { assetDeltas: [{
        token: intermediate, account: owner, beforeAtomic: "100",
        afterAtomic: "0", deltaAtomic: "-100",
      }, {
        token: output, account: owner, beforeAtomic: "1171680",
        afterAtomic: "2349210", deltaAtomic: "1177530",
      }, {
        token: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", account: owner,
        beforeAtomic: "100000000000000000000", afterAtomic: "99990000000000000000",
        deltaAtomic: "-10000000000000000",
      }] }] } },
      { kind: "execution", payload: { kind: "wallet-call-batch", stages: [{ calls: [{}] }] } },
    ])).toEqual({
      outcomes: [{ symbol: "USDG", decimals: 6, beforeAtomic: "1171680",
        afterAtomic: "2349210", minimumAtomic: "1166845" }],
      stepCount: 1,
      actions: ["PotatoSwap", "OkieStableSwap", "CurveNG", "Uniswap V4"],
    });
  });
});
