import { describe, expect, it, vi } from "vitest";
import { createOpenAiIntentCompiler } from "./intent-compiler";
import { ConversionModelDraftSchema } from "./staged-conversion-draft";

function response(value: unknown) {
  return Response.json({ status: "completed", output: [{ type: "message", status: "completed",
    content: [{ type: "output_text", text: JSON.stringify(value) }] }] });
}

function conversion(amount: string, walletShareBps: number | null) {
  return { status: "review", question: null, kind: "conversion",
    templateId: "exact-input-swap", inputSymbol: "USDG", outputSymbol: "OKB",
    amount: "", walletShareBps: null, minimum: "", jurisdiction: null, composed: null,
    conversion: { inputs: [{ symbol: "USDG", amount, walletShareBps }],
      outputSymbol: "OKB", minimumOutput: "", minimumStages: 2 } };
}

describe("intent compiler model contract", () => {
  it("defines Aave supply as a simple same-asset protocol action", async () => {
    const fetcher = vi.fn().mockImplementation((_url, init: RequestInit) => {
      const contract = JSON.parse(JSON.parse(init.body as string).input)
        .templateContracts?.["aave-supply"];
      const correctlyDefined = contract?.kind === "simple" &&
        contract?.outputSymbol === "same-as-input" && contract?.conversion === null;
      return Promise.resolve(response(correctlyDefined
        ? { status: "review", question: null, kind: "simple", templateId: "aave-supply",
          inputSymbol: "USDG", outputSymbol: "USDG", amount: "1",
          walletShareBps: null, minimum: "", jurisdiction: null, composed: null, conversion: null }
        : conversion("", 10_000)));
    });
    const compiler = createOpenAiIntentCompiler({ apiKey: "test", model: "test-model", fetcher,
      walletBalances: { USDG: "1.205469" } });

    await expect(compiler.compile("Supply 1 @USDG to @Aave on @XLayer", "any"))
      .resolves.toMatchObject({ status: "review",
        values: { templateId: "aave-supply", amount: "1" } });
  });

  it("makes exact amounts and wallet shares mutually exclusive model outputs", async () => {
    const fetcher = vi.fn().mockImplementation((_url, init: RequestInit) => {
      const request = JSON.parse(init.body as string);
      const itemSchema = request.text.format.schema.properties.conversion.anyOf[1]
        .properties.inputs.items;
      return Promise.resolve(response(Array.isArray(itemSchema.anyOf) && itemSchema.anyOf.length === 2
        ? conversion("", 10_000) : conversion("1.205469", 10_000)));
    });
    const compiler = createOpenAiIntentCompiler({ apiKey: "test", model: "test-model", fetcher,
      walletBalances: { USDG: "1.205469" }, assetPricesUsd: { USDG: "1", OKB: "111.4" } });

    await expect(compiler.compile(
      "Turn all my @USDG into @OKB using at least 2 wallet steps", "any",
    )).resolves.toMatchObject({ status: "review",
      values: { kind: "staged-conversion", outputSymbol: "OKB", minimumStages: 2 } });
  });

  it("rejects contradictory exact and wallet-share conversion inputs", () => {
    expect(ConversionModelDraftSchema.safeParse({
      inputs: [{ symbol: "USDG", amount: "1.205469", walletShareBps: 10_000 }],
      outputSymbol: "OKB", minimumOutput: "", minimumStages: 2,
    }).success).toBe(false);
  });

  it("ignores malformed inactive branches when the selected conversion is valid", async () => {
    const draft = { ...conversion("", 10_000), composed: {
      inputSymbol: "USDG", amount: "", capabilityIds: [],
      maxConversionLossBps: 0, deadlineMinutes: 1,
    } };
    const compiler = createOpenAiIntentCompiler({ apiKey: "test", model: "test-model",
      fetcher: vi.fn().mockResolvedValue(response(draft)),
      walletBalances: { USDG: "1.205469" }, assetPricesUsd: { USDG: "1", OKB: "111.4" } });

    await expect(compiler.compile(
      "Turn all my @USDG into @OKB using at least 2 wallet steps", "any",
    )).resolves.toMatchObject({ status: "review",
      values: { kind: "staged-conversion", outputSymbol: "OKB", minimumStages: 2 } });
  });
});
