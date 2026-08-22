import { describe, expect, it } from "vitest";
import { exactTaggedWalletInputs, hasExactTaggedWalletInputs } from "./exact-wallet-inputs";

const walletAssets = [
  { address: "0x1111111111111111111111111111111111111111" as const, symbol: "aXlrUSDG", decimals: 18 },
  { address: "0x2222222222222222222222222222222222222222" as const, symbol: "USDG", decimals: 6 },
];

describe("exact tagged wallet inputs", () => {
  it("does not interpret a tagged wallet token as a supported-symbol suffix", () => {
    expect(exactTaggedWalletInputs("sell @aXlrUSDG into @OKB", "OKB", walletAssets))
      .toEqual(["aXlrUSDG"]);
    expect(hasExactTaggedWalletInputs(
      "sell @aXlrUSDG into @OKB", "OKB", ["USDG"], walletAssets,
    )).toBe(false);
  });

  it("allows an exact tagged wallet-token selection", () => {
    expect(hasExactTaggedWalletInputs(
      "sell @aXlrUSDG into @OKB", "OKB", ["aXlrUSDG"], walletAssets,
    )).toBe(true);
  });
});
