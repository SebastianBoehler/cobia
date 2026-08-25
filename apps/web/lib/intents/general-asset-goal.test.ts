import { describe, expect, it } from "vitest";
import { NATIVE_ASSET_ADDRESS } from "@cobia/domain";
import { generalAssetRequestFromGoal } from "./general-asset-goal";

const adbe = "0x1111111111111111111111111111111111111111" as const;
const usdg = "0x2222222222222222222222222222222222222222" as const;

describe("general asset goal request", () => {
  it("builds exact V4 bounds for any resolved ERC-20 and catalog xStock", () => {
    expect(generalAssetRequestFromGoal(
      "Buy at least 0.0001 @ADBEx with 0.02 @USDG",
      [
        { symbol: "USDG", chainId: 196, address: usdg, decimals: 6 },
        { symbol: "ADBEx", chainId: 196, address: adbe, decimals: 18 },
      ],
    )).toEqual({
      status: "request",
      input: { chainId: 196, address: usdg, maximumAtomic: "20000" },
      output: { chainId: 196, address: adbe, minimumAtomic: "100000000000000" },
    });
  });

  it.each([
    "with all @USDG buy me at least 0.01 @ADBEx",
    "with all my @USDG buy me at least 0.01 @ADBEx",
    "with @USDG buy me at least 0.01 @ADBEx",
  ])("uses the exact wallet balance when the input amount is not numeric: %s", (goal) => {
    expect(generalAssetRequestFromGoal(
      goal,
      [
        { symbol: "USDG", chainId: 196, address: usdg, decimals: 6 },
        { symbol: "ADBEx", chainId: 196, address: adbe, decimals: 18 },
      ],
      { [usdg]: "2289644" },
    )).toEqual({
      status: "request",
      input: { chainId: 196, address: usdg, maximumAtomic: "2289644" },
      output: { chainId: 196, address: adbe, minimumAtomic: "10000000000000000" },
    });
  });

  it("lets the verified compiler derive a reviewable output floor", () => {
    expect(generalAssetRequestFromGoal(
      "buy me @ADBEx with @USDG",
      [
        { symbol: "USDG", chainId: 196, address: usdg, decimals: 6 },
        { symbol: "ADBEx", chainId: 196, address: adbe, decimals: 18 },
      ],
      { [usdg]: "2289644" },
    )).toEqual({
      status: "request",
      input: { chainId: 196, address: usdg, maximumAtomic: "2289644" },
      output: { chainId: 196, address: adbe },
    });
  });

  it("lets the compiler derive a floor when the input is stated as worth", () => {
    expect(generalAssetRequestFromGoal(
      "Buy me 0.02 @USDG worth of @ADBEx",
      [
        { symbol: "USDG", chainId: 196, address: usdg, decimals: 6 },
        { symbol: "ADBEx", chainId: 196, address: adbe, decimals: 18 },
      ],
    )).toEqual({
      status: "request",
      input: { chainId: 196, address: usdg, maximumAtomic: "20000" },
      output: { chainId: 196, address: adbe },
    });
  });

  it("does not route native OKB through the ERC-20 evidence gate", () => {
    expect(generalAssetRequestFromGoal(
      "Buy at least 0.0001 @ADBEx with 0.02 @OKB",
      [
        { symbol: "OKB", chainId: 196, address: NATIVE_ASSET_ADDRESS, decimals: 18 },
        { symbol: "ADBEx", chainId: 196, address: adbe, decimals: 18 },
      ],
    )).toEqual({
      status: "clarification",
      question: "The active exact-asset verifier requires an ERC-20 input; native OKB is not yet verified for this route.",
    });
  });

  it("keeps an explicit input maximum authoritative over the wallet balance", () => {
    expect(generalAssetRequestFromGoal(
      "Buy at least 0.01 @ADBEx with at most 2 @USDG",
      [
        { symbol: "USDG", chainId: 196, address: usdg, decimals: 6 },
        { symbol: "ADBEx", chainId: 196, address: adbe, decimals: 18 },
      ],
      { [usdg]: "2289644" },
    )).toMatchObject({ status: "request", input: { maximumAtomic: "2000000" } });
  });

  it("fails early when neither an amount nor a positive exact-contract balance exists", () => {
    expect(generalAssetRequestFromGoal(
      "with @USDG buy me at least 0.01 @ADBEx",
      [
        { symbol: "USDG", chainId: 196, address: usdg, decimals: 6 },
        { symbol: "ADBEx", chainId: 196, address: adbe, decimals: 18 },
      ],
    )).toEqual({ status: "clarification",
      question: "No positive USDG wallet balance is available. Fund it or state a maximum amount." });
  });

  it("routes resolved assets without consulting a hard-coded symbol catalog", () => {
    expect(generalAssetRequestFromGoal(
      "Buy at least 0.01 @TSLAx with 10 @USDG",
      [
        { symbol: "USDG", chainId: 196, address: "0x2222222222222222222222222222222222222222", decimals: 6 },
        { symbol: "TSLAx", chainId: 196, address: "0x3333333333333333333333333333333333333333", decimals: 18 },
      ],
    )).toEqual({
      status: "request",
      input: { chainId: 196, address: usdg, maximumAtomic: "10000000" },
      output: { chainId: 196, address: "0x3333333333333333333333333333333333333333",
        minimumAtomic: "10000000000000000" },
    });
  });

  it.each([
    "Turn 0.1 @USDG into @ADBEx using at least 2 wallet steps",
    "Do a round trip from @USDG to @ADBEx and back",
  ])("leaves structured compositions to the typed semantic compiler: %s", (goal) => {
    expect(generalAssetRequestFromGoal(
      goal,
      [
        { symbol: "USDG", chainId: 196, address: usdg, decimals: 6 },
        { symbol: "ADBEx", chainId: 196, address: adbe, decimals: 18 },
      ],
      { [usdg]: "2289644" },
    )).toEqual({ status: "not-applicable" });
  });
});
