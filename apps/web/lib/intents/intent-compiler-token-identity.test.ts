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
});
