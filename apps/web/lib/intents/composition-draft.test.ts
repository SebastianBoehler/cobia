import { describe, expect, it } from "vitest";
import { resolveCompositionDraft } from "./composition-draft";

describe("resolveCompositionDraft", () => {
  it("derives only disclosed deterministic values", () => {
    expect(resolveCompositionDraft({
      inputSymbol: "USDG", amount: "1",
      capabilityIds: ["uniswap-v3.exact-input", "aave-v3.supply",
        "curve-stableswap-ng.exact-input"],
      maxConversionLossBps: 100, deadlineMinutes: 10,
    })).toMatchObject({
      kind: "composed", minimumReceiptValueBps: 9_900,
      minimumReceiptSource: "conversion-loss", horizonDays: 30,
      horizonSource: "product-default", deadlineDurationSec: 600,
      capabilityIds: ["aave-v3.supply", "curve-stableswap-ng.exact-input",
        "uniswap-v3.exact-input"],
    });
  });

  it("rejects missing receipt authority and unsupported capability IDs", () => {
    expect(() => resolveCompositionDraft({
      inputSymbol: "USDG", amount: "1",
      capabilityIds: ["curve-stableswap-ng.exact-input"],
      maxConversionLossBps: 100, deadlineMinutes: 10,
    })).toThrow(/aave|receipt/i);
    expect(() => resolveCompositionDraft({
      inputSymbol: "USDG", amount: "1", capabilityIds: ["pendle.deposit"],
      maxConversionLossBps: 100, deadlineMinutes: 10,
    })).toThrow(/registered|capability/i);
  });
});
