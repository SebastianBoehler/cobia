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
      ["OKB", "USDG", "USDt0", "TSLAx", "PAXG", "OUSG", "USDY"],
    )).toEqual({
      status: "request",
      input: { chainId: 196, address: usdg, maximumAtomic: "20000" },
      output: { chainId: 196, address: adbe, minimumAtomic: "100000000000000" },
    });
  });

  it("requires an explicit receipt floor for an unregistered asset", () => {
    expect(generalAssetRequestFromGoal(
      "Buy me 0.02 @USDG worth of @ADBEx",
      [
        { symbol: "USDG", chainId: 196, address: usdg, decimals: 6 },
        { symbol: "ADBEx", chainId: 196, address: adbe, decimals: 18 },
      ],
      ["OKB", "USDG", "USDt0", "TSLAx", "PAXG", "OUSG", "USDY"],
    )).toEqual({
      status: "clarification",
      question: "For an unregistered ERC-20 or xStock, state an exact input and an \"at least\" output amount.",
    });
  });

  it("does not route native OKB through the ERC-20 evidence gate", () => {
    expect(generalAssetRequestFromGoal(
      "Buy at least 0.0001 @ADBEx with 0.02 @OKB",
      [
        { symbol: "OKB", chainId: 196, address: NATIVE_ASSET_ADDRESS, decimals: 18 },
        { symbol: "ADBEx", chainId: 196, address: adbe, decimals: 18 },
      ],
      ["OKB", "USDG", "USDt0", "TSLAx", "PAXG", "OUSG", "USDY"],
    )).toEqual({
      status: "clarification",
      question: "Arbitrary xStocks currently require an ERC-20 input; native OKB is not yet verified for this route.",
    });
  });

  it("leaves registered asset routes on the existing compiler", () => {
    expect(generalAssetRequestFromGoal(
      "Buy at least 0.01 @TSLAx with 10 @USDG",
      [
        { symbol: "USDG", chainId: 196, address: "0x2222222222222222222222222222222222222222", decimals: 6 },
        { symbol: "TSLAx", chainId: 196, address: "0x3333333333333333333333333333333333333333", decimals: 18 },
      ],
      ["OKB", "USDG", "USDt0", "TSLAx", "PAXG", "OUSG", "USDY"],
    )).toEqual({ status: "not-applicable" });
  });
});
