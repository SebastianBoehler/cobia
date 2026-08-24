import { describe, expect, it } from "vitest";
import { preservesRequestedAssetFlow, tagKnownAssetSymbols } from "./intent-asset-references";

describe("tagKnownAssetSymbols", () => {
  it("tags exact known symbols in pasted intent text", () => {
    expect(tagKnownAssetSymbols("0.01 OKB into USDG", ["OKB", "USDG", "USDt0"]))
      .toBe("0.01 @OKB into @USDG");
  });

  it("preserves existing tags and does not match symbols inside other words", () => {
    expect(tagKnownAssetSymbols("Keep @OKB, not BOOKB or USDGrowth", ["OKB", "USDG"]))
      .toBe("Keep @OKB, not BOOKB or USDGrowth");
  });

  it("does not guess when the same symbol identifies multiple assets", () => {
    expect(tagKnownAssetSymbols("Swap USDC", ["USDC", "usdc"]))
      .toBe("Swap USDC");
  });
});

describe("preservesRequestedAssetFlow", () => {
  const assets = ["OKB", "USDG", "USDt0"];

  it("accepts the exact requested input and output direction", () => {
    expect(preservesRequestedAssetFlow("0.01 @OKB into @USDG", {
      inputs: ["OKB"], output: "USDG",
    }, assets)).toBe(true);
  });

  it("rejects substitutions, missing inputs, and reversed routes", () => {
    const goal = "0.01 @OKB and 1 @USDt0 into @USDG";
    expect(preservesRequestedAssetFlow(goal, {
      inputs: ["USDt0"], output: "USDG",
    }, assets)).toBe(false);
    expect(preservesRequestedAssetFlow(goal, {
      inputs: ["USDG", "USDt0"], output: "OKB",
    }, assets)).toBe(false);
  });

  it("checks tagged assets without treating a protocol as an output asset", () => {
    expect(preservesRequestedAssetFlow("Supply 1 @USDG to @Aave", {
      inputs: ["USDG"], output: "USDG",
    }, assets)).toBe(true);
  });

  it("preserves direction when a goal uses to between two assets", () => {
    expect(preservesRequestedAssetFlow("Swap @USDG to @USDt0", {
      inputs: ["USDt0"], output: "USDG",
    }, assets)).toBe(false);
  });
});
