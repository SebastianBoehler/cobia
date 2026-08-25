import { describe, expect, it, vi } from "vitest";
import { createOpenAiIntentCompiler } from "./intent-compiler";

function response(value: unknown) {
  return Response.json({ status: "completed", output: [{ type: "message", status: "completed",
    content: [{ type: "output_text", text: JSON.stringify(value) }] }] });
}

describe("intent compiler token identity", () => {
  it("repairs a supported-token suffix substituted for an explicitly tagged wallet token", async () => {
    const compiler = createOpenAiIntentCompiler({
      apiKey: "test", model: "test-model",
      fetcher: vi.fn().mockResolvedValue(response({
        status: "review", question: null, kind: "conversion", templateId: "exact-input-swap",
        inputSymbol: "USDG", outputSymbol: "OKB", amount: "", walletShareBps: null,
        minimum: "", jurisdiction: null, composed: null,
        conversion: { inputs: [{ symbol: "USDG", amount: "", walletShareBps: 10_000 }],
          outputSymbol: "OKB", minimumOutput: "", minimumStages: 1 },
      })),
      walletBalances: { aXlrUSDG: "0.1", USDG: "1" },
      assetPricesUsd: { aXlrUSDG: "1", OKB: "110" },
      walletAssets: [
        { address: "0x1111111111111111111111111111111111111111", symbol: "aXlrUSDG", decimals: 18 },
        { address: "0x2222222222222222222222222222222222222222", symbol: "USDG", decimals: 6 },
      ],
    });

    await expect(compiler.compile("sell all @aXlrUSDG into @OKB", "any"))
      .resolves.toMatchObject({ status: "review", values: {
        kind: "staged-conversion",
        inputs: [{ symbol: "aXlrUSDG", token: "0x1111111111111111111111111111111111111111",
          amount: "0.1" }],
        outputSymbol: "OKB",
      } });
  });

  it("preserves exact inputs when one tagged wallet symbol ends with the other", async () => {
    const compiler = createOpenAiIntentCompiler({
      apiKey: "test", model: "test-model",
      fetcher: vi.fn().mockResolvedValue(response({
        status: "review", question: null, kind: "conversion", templateId: "exact-input-swap",
        inputSymbol: "USDt0", outputSymbol: "OKB", amount: "", walletShareBps: null,
        minimum: "", jurisdiction: null, composed: null,
        conversion: {
          inputs: [
            { symbol: "USDt0", amount: "", walletShareBps: 10_000 },
            { symbol: "aXlrUSDT0", amount: "", walletShareBps: 10_000 },
          ],
          outputSymbol: "OKB", minimumOutput: "", minimumStages: 1,
        },
      })),
      walletBalances: { USDt0: "0.009983", aXlrUSDT0: "0.2" },
      assetPricesUsd: { USDt0: "1", aXlrUSDT0: "1", OKB: "100" },
      walletAssets: [
        { address: "0x1111111111111111111111111111111111111111", symbol: "USDt0", decimals: 6 },
        { address: "0x2222222222222222222222222222222222222222", symbol: "aXlrUSDT0", decimals: 6 },
      ],
    });

    await expect(compiler.compile(
      "sell all @USDt0 and @aXlrUSDT0 into @OKB", "any",
    )).resolves.toMatchObject({ status: "review", values: {
      kind: "staged-conversion",
      inputs: [
        { symbol: "USDt0", token: "0x1111111111111111111111111111111111111111", amount: "0.009983" },
        { symbol: "aXlrUSDT0", token: "0x2222222222222222222222222222222222222222", amount: "0.2" },
      ],
      outputSymbol: "OKB",
    } });
  });
});
