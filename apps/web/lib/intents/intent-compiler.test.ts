import { describe, expect, it, vi } from "vitest";
import { createOpenAiIntentCompiler } from "./intent-compiler";
import { INTENT_ASSETS } from "./capability-templates";

function response(text: string) {
  return Response.json({ status: "completed", output: [{ type: "message", status: "completed",
    content: [{ type: "output_text", text }] }] });
}

function simple(value: Record<string, unknown>) {
  return { ...value, kind: "simple", composed: null };
}

function conversion(
  inputs: Array<{ symbol: string; amount: string; walletShareBps: number | null }>,
  outputSymbol = "USDG",
  minimumOutput = "",
  minimumStages = 1,
) {
  return { status: "review", question: null, kind: "conversion",
    templateId: "exact-input-swap", inputSymbol: "USDG", outputSymbol,
    amount: "", minimum: "", jurisdiction: null, composed: null,
    conversion: { inputs, outputSymbol, minimumOutput, minimumStages } };
}

describe("intent compiler", () => {
  it("accepts a single JSON fence from an OpenRouter structured response", async () => {
    const payload = JSON.stringify(simple({
      status: "review", question: null, templateId: "exact-input-swap",
      inputSymbol: "USDG", outputSymbol: "USDt0", amount: "1", minimum: "0.99",
      jurisdiction: null,
    }));
    const compiler = createOpenAiIntentCompiler({ apiKey: "test", model: "test-model",
      fetcher: vi.fn().mockResolvedValue(response(`\`\`\`json\n${payload}\n\`\`\``)) });

    await expect(compiler.compile("Swap 1 USDG into USDt0", "any")).resolves.toMatchObject({
      status: "review", values: { amount: "1", minimum: "0.99" },
    });
  });

  it("keeps constrained extraction from spending its output budget on reasoning", async () => {
    const fetcher = vi.fn().mockImplementation((_url, init: RequestInit) => {
      const request = JSON.parse(init.body as string);
      return Promise.resolve(request.reasoning?.effort === "none"
        ? response(JSON.stringify(simple({
          status: "clarification", question: "Which xStock should be acquired?",
          templateId: "rwa-acquisition", inputSymbol: "USDG", outputSymbol: "TSLAx",
          amount: "1", minimum: "", jurisdiction: null,
        })))
        : Response.json({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output: [] }));
    });
    const compiler = createOpenAiIntentCompiler({ apiKey: "test", model: "gpt-5.6-luna", fetcher });

    await expect(compiler.compile("Swap 1 USDG into any xStock", "any")).resolves.toEqual({
      status: "clarification", question: "Which xStock should be acquired?",
    });
  });

  it("compiles prose to editable receipt values without creating wallet authority", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(JSON.stringify(simple({
      status: "review", question: null, templateId: "exact-input-swap",
      inputSymbol: "USDG", outputSymbol: "USDt0", amount: "10", minimum: "9.95",
      jurisdiction: null,
    }))));
    const compiler = createOpenAiIntentCompiler({ apiKey: "test", model: "test-model", fetcher });

    await expect(compiler.compile("Swap 10 USDG for at least 9.95 USDt0", "exact-input-swap")).resolves.toMatchObject({
      status: "review", values: { templateId: "exact-input-swap", amount: "10", minimum: "9.95" },
    });
    const request = JSON.parse(fetcher.mock.calls[0]![1]!.body as string);
    expect(fetcher.mock.calls[0]![0]).toBe("https://openrouter.ai/api/v1/responses");
    expect(request.model).toBe("test-model");
    expect(request.input).toContain("Swap 10 USDG");
    expect(JSON.parse(request.input).templates).toEqual(["exact-input-swap"]);
    expect(request.input).not.toContain("owner");
  });

  it("instructs the model to compile exact amounts as commands without conversational pushback", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(JSON.stringify(simple({
      status: "review", question: null, templateId: "aave-supply",
      inputSymbol: "USDG", outputSymbol: "USDG", amount: "1", minimum: "",
      jurisdiction: null,
    }))));
    const compiler = createOpenAiIntentCompiler({ apiKey: "test", model: "test-model", fetcher,
      walletBalances: { USDG: "1.205469" } });

    await expect(compiler.compile("Supply 1 @USDG to @Aave on @XLayer", "any"))
      .resolves.toMatchObject({ status: "review", values: { amount: "1" } });
    const request = JSON.parse(fetcher.mock.calls[0]![1]!.body as string);
    expect(request.instructions).toContain("not a conversation");
    expect(request.instructions).toContain("exactly 1 USDG");
    expect(request.instructions).toContain("Never ask whether to use a different amount");
  });

  it("adds a disclosed stablecoin floor when an exact input has no stated output minimum", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(JSON.stringify(simple({
      status: "review", question: null, templateId: "exact-input-swap",
      inputSymbol: "USDG", outputSymbol: "USDt0", amount: "0.02", minimum: "",
      jurisdiction: null,
    }))));
    const compiler = createOpenAiIntentCompiler({ apiKey: "test", model: "test-model", fetcher });

    await expect(compiler.compile("Swap 0.02 USDG into USDt0 on X Layer", "any")).resolves.toMatchObject({
      status: "review",
      values: {
        templateId: "exact-input-swap",
        amount: "0.02",
        minimum: "0.0198",
        minimumSource: "stablecoin-default",
        maxSolverFeeUsd: "0",
      },
    });
  });

  it("resolves an all-my-token swap to the exact observed wallet balance", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(JSON.stringify(conversion([
      { symbol: "USDt0", amount: "", walletShareBps: 10_000 },
    ]))));
    const compiler = createOpenAiIntentCompiler({
      apiKey: "test", model: "test-model", fetcher,
      walletBalances: { USDG: "1.5", USDt0: "4.25" },
    });

    await expect(compiler.compile("swap all my @USDt0 into @USDG", "any")).resolves.toMatchObject({
      status: "review",
      values: {
        templateId: "exact-input-swap",
        amount: "4.25",
        minimum: "4.2075",
        minimumSource: "stablecoin-default",
      },
    });
  });

  it("caps an enough-input conversion by the wallet balance and preserves the requested output", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(JSON.stringify(conversion([
      { symbol: "USDt0", amount: "", walletShareBps: 10_000 },
    ], "USDG", "1"))));
    const compiler = createOpenAiIntentCompiler({
      apiKey: "test", model: "test-model", fetcher,
      walletBalances: { USDt0: "1.206141" },
    });

    await expect(compiler.compile(
      "enough of @USDt0 so that I get 1 @USDG", "any",
    )).resolves.toMatchObject({
      status: "review",
      values: {
        templateId: "exact-input-swap",
        amount: "1.206141",
        minimum: "1",
      },
    });
  });

  it("restores an explicitly requested RWA output when the model substitutes a stablecoin", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(JSON.stringify(conversion([
      { symbol: "USDG", amount: "", walletShareBps: 10_000 },
    ], "USDt0"))));
    const compiler = createOpenAiIntentCompiler({
      apiKey: "test", model: "test-model", fetcher, walletBalances: { USDG: "1.205944" },
      assetPricesUsd: { USDG: "1", USDY: "1" },
    });

    await expect(compiler.compile("all my @USDG into @USDY", "any")).resolves.toMatchObject({
      status: "review",
      values: { templateId: "rwa-acquisition", amount: "1.205944",
        minimum: "1.19388456" },
    });
  });

  it("reports when an RWA market minimum cannot be derived", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(JSON.stringify(simple({
      status: "review", question: null, templateId: "rwa-acquisition",
      inputSymbol: "USDG", outputSymbol: "USDY", amount: "", minimum: "",
      jurisdiction: null,
    }))));
    const compiler = createOpenAiIntentCompiler({
      apiKey: "test", model: "test-model", fetcher, walletBalances: { USDG: "1.205944" },
    });

    await expect(compiler.compile("all my @USDG into @USDY", "any")).resolves.toEqual({
      status: "clarification",
      question: "A fresh price is unavailable for one of the requested assets.",
    });
  });

  it("derives an editable RWA minimum from an exact native input", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(JSON.stringify(simple({
      status: "review", question: null, templateId: "rwa-acquisition",
      inputSymbol: "OKB", outputSymbol: "USDY", amount: "0.005", minimum: "",
      walletShareBps: null, jurisdiction: null,
    }))));
    const compiler = createOpenAiIntentCompiler({
      apiKey: "test", model: "test-model", fetcher,
      assetPricesUsd: { OKB: "100", USDY: "1.25" },
    });

    await expect(compiler.compile("0.005 @OKB into any @USDY", "any")).resolves.toMatchObject({
      status: "review",
      values: {
        templateId: "rwa-acquisition",
        amount: "0.005",
        minimum: "0.396",
        minimumSource: "market-default",
      },
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("resolves an RWA wallet percentage before deriving its minimum", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(JSON.stringify(simple({
      status: "clarification", question: null, templateId: "rwa-acquisition",
      inputSymbol: "USDG", outputSymbol: "TSLAx", amount: "", minimum: "",
      walletShareBps: 10_000, jurisdiction: null,
    }))));
    const compiler = createOpenAiIntentCompiler({
      apiKey: "test", model: "test-model", fetcher,
      walletBalances: { USDG: "1.205704" },
      assetPricesUsd: { USDG: "1", TSLAx: "300" },
    });

    await expect(compiler.compile("10% of my @USDG into @TSLAx", "any")).resolves.toMatchObject({
      status: "review",
      values: {
        templateId: "rwa-acquisition",
        amount: "0.12057",
        minimum: "0.000397881",
        minimumSource: "market-default",
      },
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("resolves an all-balance RWA input once the minimum outcome is explicit", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(JSON.stringify(simple({
      status: "review", question: null, templateId: "rwa-acquisition",
      inputSymbol: "USDG", outputSymbol: "USDY", amount: "all", minimum: "0.8",
      jurisdiction: null,
    }))));
    const compiler = createOpenAiIntentCompiler({
      apiKey: "test", model: "test-model", fetcher, walletBalances: { USDG: "1.205944" },
    });

    await expect(compiler.compile("all my @USDG into at least 0.8 @USDY", "any"))
      .resolves.toMatchObject({
        status: "review",
        values: { templateId: "rwa-acquisition", amount: "1.205944", minimum: "0.8" },
      });
  });

  it("treats all token as the complete observed balance without asking again", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(JSON.stringify(conversion([
      { symbol: "USDt0", amount: "", walletShareBps: 10_000 },
    ]))));
    const compiler = createOpenAiIntentCompiler({
      apiKey: "test", model: "test-model", fetcher, walletBalances: { USDt0: "0.007632" },
    });

    await expect(compiler.compile("all @USDt0 to @USDG", "any")).resolves.toMatchObject({
      status: "review",
      values: { templateId: "exact-input-swap", amount: "0.007632", minimum: "0.007555" },
    });
  });

  it("resolves a precise share of a token balance", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(JSON.stringify(conversion([
      { symbol: "USDt0", amount: "", walletShareBps: 5_000 },
    ]))));
    const compiler = createOpenAiIntentCompiler({
      apiKey: "test", model: "test-model", fetcher, walletBalances: { USDt0: "4.25" },
    });

    await expect(compiler.compile("swap half of my USDt0 into USDG", "any")).resolves.toMatchObject({
      status: "review",
      values: { amount: "2.125", minimum: "2.10375", minimumSource: "stablecoin-default" },
    });
  });

  it("treats the middle asset in a round trip as a route, not another wallet input", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(JSON.stringify(conversion([
      { symbol: "USDG", amount: "", walletShareBps: 10_000 },
      { symbol: "USDt0", amount: "", walletShareBps: null },
    ], "USDG"))));
    const compiler = createOpenAiIntentCompiler({
      apiKey: "test", model: "test-model", fetcher,
      walletBalances: { USDG: "1.205704", USDt0: "0" },
    });

    await expect(compiler.compile(
      "pls roundtrip all my @USDG into @USDt0 and back into @USDG", "any",
    )).resolves.toMatchObject({
      status: "review",
      values: {
        templateId: "round-trip",
        inputToken: INTENT_ASSETS.find(({ symbol }) => symbol === "USDG")!.address,
        amount: "1.205704",
        minimum: "0.000001",
        minimumSource: "round-trip-default",
      },
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("asks for funding when an all-my-token input balance is zero", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(JSON.stringify(conversion([
      { symbol: "USDt0", amount: "", walletShareBps: 10_000 },
    ]))));
    const compiler = createOpenAiIntentCompiler({
      apiKey: "test", model: "test-model", fetcher, walletBalances: { USDt0: "0" },
    });

    await expect(compiler.compile("swap all my USDt0 into USDG", "any")).resolves.toEqual({
      status: "clarification",
      question: "Your USDt0 wallet balance is zero. Fund it or enter an exact amount.",
    });
  });

  it("preserves native OKB as the output of a multi-input conversion", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(JSON.stringify(conversion([
      { symbol: "USDG", amount: "", walletShareBps: 10_000 },
      { symbol: "USDt0", amount: "", walletShareBps: 10_000 },
    ], "OKB"))));
    const compiler = createOpenAiIntentCompiler({
      apiKey: "test", model: "test-model", fetcher,
      walletBalances: { USDG: "0.964564", USDt0: "0.241177" },
      assetPricesUsd: { OKB: "100", USDG: "1", USDt0: "1" },
    });

    await expect(compiler.compile("all @USDG and all @USDt0 into @OKB", "any")).resolves.toMatchObject({
      status: "review",
      values: {
        kind: "staged-conversion",
        inputs: [{ symbol: "USDG", amount: "0.964564" }, { symbol: "USDt0", amount: "0.241177" }],
        outputToken: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        outputSymbol: "OKB", outputDecimals: 18, minimum: "0.0119368359",
      },
    });
    expect(fetcher).toHaveBeenCalledOnce();
    const request = JSON.parse(fetcher.mock.calls[0]![1]!.body as string);
    expect(request.text.format.schema.properties.outputSymbol.enum).toContain("OKB");
    expect(request.text.format.schema.properties.conversion.anyOf[1]
      .properties.outputSymbol.enum).toContain("OKB");
    expect(JSON.parse(request.input).xLayerAssets).toContain("OKB");
  });

  it("compiles an exact native OKB conversion into one staged program draft", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(JSON.stringify(conversion([
      { symbol: "OKB", amount: "0.005", walletShareBps: null },
    ]))));
    const compiler = createOpenAiIntentCompiler({
      apiKey: "test", model: "test-model", fetcher,
      assetPricesUsd: { OKB: "107.41", USDG: "1" },
    });

    await expect(compiler.compile("turn 0.005 @OKB into @USDG", "any")).resolves.toEqual({
      status: "review",
      values: {
        kind: "staged-conversion",
        templateId: "staged-conversion",
        inputs: [{ kind: "native", chainId: 196,
          token: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
          symbol: "OKB", decimals: 18, amount: "0.005" }],
        outputToken: "0x4ae46a509F6b1D9056937BA4500cb143933D2dc8",
        outputSymbol: "USDG", outputDecimals: 6,
        minimum: "0.531679", minimumSource: "market-default",
        maxSolverFeeUsd: "0",
      },
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("compiles native OKB and USDt0 as two exact inputs to one staged program", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(JSON.stringify(conversion([
      { symbol: "OKB", amount: "0.005", walletShareBps: null },
      { symbol: "USDt0", amount: "1", walletShareBps: null },
    ]))));
    const compiler = createOpenAiIntentCompiler({
      apiKey: "test", model: "test-model", fetcher,
      assetPricesUsd: { OKB: "107.41", USDt0: "1", USDG: "1" },
    });

    await expect(compiler.compile(
      "turn 0.005 @OKB and 1 @USDt0 into @USDG", "any",
    )).resolves.toMatchObject({
      status: "review",
      values: {
        kind: "staged-conversion",
        inputs: [
          { kind: "native", symbol: "OKB", amount: "0.005" },
          { kind: "erc20", symbol: "USDt0", amount: "1" },
        ],
        outputSymbol: "USDG",
        minimum: "1.521679",
        minimumSource: "market-default",
      },
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("preserves an explicit minimum route length without asking whether to use it", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(JSON.stringify(conversion([
      { symbol: "USDG", amount: "", walletShareBps: 10_000 },
    ], "OKB", "", 2))));
    const compiler = createOpenAiIntentCompiler({
      apiKey: "test", model: "test-model", fetcher,
      walletBalances: { USDG: "1.205469" },
      assetPricesUsd: { USDG: "1", OKB: "107.41" },
    });

    await expect(compiler.compile(
      "turn all my @USDG into @OKB with a multi step route with at least 2 steps", "any",
    )).resolves.toMatchObject({
      status: "review",
      values: { kind: "staged-conversion", outputSymbol: "OKB", minimumStages: 2 },
    });
    const request = JSON.parse(fetcher.mock.calls[0]![1]!.body as string);
    expect(request.instructions).toContain("explicit minimum route length");
    expect(request.text.format.schema.properties.conversion.anyOf[1]
      .required).toContain("minimumStages");
  });

  it("drafts model-extracted verbless wallet conversion goals for review", async () => {
    const exact = conversion([{ symbol: "OKB", amount: "0.05", walletShareBps: null }]);
    const mixed = conversion([
      { symbol: "OKB", amount: "0.05", walletShareBps: null },
      { symbol: "USDt0", amount: "", walletShareBps: 10_000 },
    ]);
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response(JSON.stringify(exact)))
      .mockResolvedValueOnce(response(JSON.stringify(mixed)));
    const compiler = createOpenAiIntentCompiler({
      apiKey: "test", model: "test-model", fetcher,
      walletBalances: { OKB: "0.014858", USDt0: "0.007632" },
      assetPricesUsd: { OKB: "111.93", USDt0: "1", USDG: "1" },
    });

    await expect(compiler.compile("0.05 @OKB into @USDG", "any")).resolves.toMatchObject({
      status: "review",
      values: { kind: "staged-conversion", inputs: [{ symbol: "OKB", amount: "0.05" }],
        outputSymbol: "USDG", minimum: "5.540535" },
    });
    await expect(compiler.compile(
      "0.05 @OKB and all @USDt0 both into @USDG", "any",
    )).resolves.toMatchObject({
      status: "review",
      values: { kind: "staged-conversion", inputs: [
        { symbol: "OKB", amount: "0.05" },
        { symbol: "USDt0", amount: "0.007632" },
      ], outputSymbol: "USDG", minimum: "5.54809" },
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("compiles a verified wallet ERC-20 input without the stablecoin input whitelist", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response(JSON.stringify(conversion([
        { symbol: "EXAMPLE", amount: "0.4", walletShareBps: null },
      ], "USDt0"))))
      .mockResolvedValueOnce(response(JSON.stringify(conversion([
        { symbol: "EXAMPLE", amount: "", walletShareBps: 10_000 },
      ], "USDt0"))));
    const compiler = createOpenAiIntentCompiler({
      apiKey: "test", model: "test-model", fetcher,
      assetPricesUsd: { EXAMPLE: "2.5", USDt0: "1" },
      walletBalances: { EXAMPLE: "0.4" },
      walletAssets: [{ address: "0x1111111111111111111111111111111111111111",
        symbol: "EXAMPLE", decimals: 18 }],
    });

    await expect(compiler.compile("turn 0.4 of @EXAMPLE into @USDt0", "any")).resolves.toMatchObject({
      status: "review", values: { kind: "staged-conversion", inputs: [{ symbol: "EXAMPLE", amount: "0.4",
        token: "0x1111111111111111111111111111111111111111" }], outputSymbol: "USDt0", minimum: "0.99" },
    });
    await expect(compiler.compile("all @EXAMPLE into @USDt0", "any")).resolves.toMatchObject({
      status: "review", values: { kind: "staged-conversion", inputs: [{ symbol: "EXAMPLE", amount: "0.4" }],
        outputSymbol: "USDt0", minimum: "0.99" },
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    const request = JSON.parse(fetcher.mock.calls[0]![1]!.body as string);
    expect(request.text.format.schema.properties.conversion.anyOf[1]
      .properties.inputs.items.anyOf[0].properties.symbol).toEqual({ type: "string" });
    expect(JSON.parse(request.input).walletAssets).toEqual(expect.arrayContaining([
      expect.objectContaining({ symbol: "EXAMPLE", balance: "0.4", priceUsd: "2.5" }),
    ]));
  });

  it("resolves independent wallet shares for staged native and token inputs", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(JSON.stringify(conversion([
      { symbol: "OKB", amount: "", walletShareBps: 5_000 },
      { symbol: "USDt0", amount: "", walletShareBps: 2_500 },
    ]))));
    const compiler = createOpenAiIntentCompiler({
      apiKey: "test", model: "test-model", fetcher,
      walletBalances: { OKB: "0.01", USDt0: "4" },
      assetPricesUsd: { OKB: "107.41", USDt0: "1", USDG: "1" },
    });

    await expect(compiler.compile(
      "turn half of my @OKB and 25% of my @USDt0 into @USDG", "any",
    )).resolves.toMatchObject({
      status: "review",
      values: { inputs: [
        { symbol: "OKB", amount: "0.005" },
        { symbol: "USDt0", amount: "1" },
      ], minimum: "1.521679" },
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("asks for an exact share instead of guessing what most means", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(JSON.stringify(simple({
      status: "clarification", question: "What percentage of your OKB balance should be used?",
      templateId: "exact-input-swap", inputSymbol: "USDG", outputSymbol: "USDt0",
      amount: "", minimum: "", jurisdiction: null,
    }))));
    const compiler = createOpenAiIntentCompiler({
      apiKey: "test", model: "test-model", fetcher,
      walletBalances: { OKB: "0.01" }, assetPricesUsd: { OKB: "107.41", USDG: "1" },
    });

    await expect(compiler.compile("turn most of my OKB into USDG", "any")).resolves.toEqual({
      status: "clarification",
      question: "What percentage of your OKB balance should be used?",
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("returns a clarification instead of inventing unsupported bounds", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(JSON.stringify(simple({
      status: "clarification", question: "What is the maximum amount to spend?",
      templateId: "exact-input-swap", inputSymbol: "USDG", outputSymbol: "USDt0",
      amount: "", minimum: "", jurisdiction: "DE",
    }))));
    const compiler = createOpenAiIntentCompiler({ apiKey: "test", model: "test-model", fetcher });

    await expect(compiler.compile("Get me some USDt0", "any")).resolves.toEqual({
      status: "clarification", question: "What is the maximum amount to spend?",
    });
  });

  it("normalizes UI mention markers before asking the model", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(JSON.stringify(simple({
      status: "review", question: null, templateId: "exact-input-swap",
      inputSymbol: "USDG", outputSymbol: "USDt0", amount: "10", minimum: "9.95",
      jurisdiction: null,
    }))));
    const compiler = createOpenAiIntentCompiler({ apiKey: "test", model: "test-model", fetcher });

    await compiler.compile("Swap 10 @USDG for at least 9.95 @USDt0 on @XLayer", "exact-input-swap");

    const request = JSON.parse(fetcher.mock.calls[0]![1]!.body as string);
    expect(request.input).toContain("Swap 10 USDG for at least 9.95 USDt0 on XLayer");
    expect(request.input).not.toContain("@");
  });

  it("resolves an xStock to its exact registered X Layer token", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(JSON.stringify(simple({
      status: "review", question: null, templateId: "rwa-acquisition",
      inputSymbol: "USDG", outputSymbol: "TSLAx", amount: "10", minimum: "0.01",
      jurisdiction: "DE",
    }))));
    const compiler = createOpenAiIntentCompiler({ apiKey: "test", model: "test-model", fetcher });

    await expect(compiler.compile(
      "Acquire at least 0.01 TSLAx with at most 10 USDG on X Layer for an eligible DE holder",
      "any",
    )).resolves.toMatchObject({
      status: "review",
      values: {
        templateId: "rwa-acquisition",
        inputToken: "0x4ae46a509F6b1D9056937BA4500cb143933D2dc8",
        outputToken: "0x8ad3c73f833d3f9a523ab01476625f269aeb7cf0",
        minimum: "0.01",
        jurisdiction: "DE",
      },
    });
  });

  it("keeps the requested X Layer input when targeting USDY on Ethereum", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(JSON.stringify(simple({
      status: "review", question: null, templateId: "rwa-acquisition",
      inputSymbol: "USDt0", outputSymbol: "USDY", amount: "1", minimum: "0.8",
      jurisdiction: "DE",
    }))));
    const compiler = createOpenAiIntentCompiler({ apiKey: "test", model: "test-model", fetcher,
      assetPricesUsd: { USDt0: "1", USDY: "1.25" } });

    await expect(compiler.compile("turn 1 USDt0 into USDY", "any")).resolves.toMatchObject({
      status: "review",
      values: {
        templateId: "rwa-acquisition",
        inputToken: "0x779ded0c9e1022225f8e0630b35a9b54be713736",
        outputToken: "0x96f6ef951840721adbf46ac996b59e0235cb985c",
        minimum: "0.792",
        jurisdiction: "",
      },
    });
  });

  it("compiles the complete registered multi-step yield goal without model clarification", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(JSON.stringify({
      status: "clarification",
      question: "What minimum receipt-token balance should be required, and which output asset should the route target?",
      kind: "simple",
      templateId: "aave-supply", inputSymbol: "USDG", outputSymbol: "USDt0",
      amount: "1", minimum: "", jurisdiction: null, composed: null,
    })));
    const compiler = createOpenAiIntentCompiler({ apiKey: "test", model: "test-model",
      fetcher, compositionAvailable: true });

    await expect(compiler.compile(
      "Use 1 USDG to enter the best verified stablecoin-yield route ending in USDt0 on X Layer. " +
      "Only use Aave V3, Curve or Uniswap. Allow no more than 1% conversion loss, " +
      "require a minimum receipt-token balance, and expire in ten minutes.",
      "any",
    )).resolves.toEqual({
      status: "review",
      values: {
        kind: "composed",
        inputToken: "0x4ae46a509F6b1D9056937BA4500cb143933D2dc8",
        terminalAsset: "0x779Ded0c9e1022225f8E0630b35a9b54bE713736",
        amount: "1",
        capabilityIds: ["aave-v3.supply", "curve-stableswap-ng.exact-input",
          "uniswap-v3.exact-input"],
        maxConversionLossBps: 100,
        minimumReceiptValueBps: 9_900,
        minimumReceiptSource: "conversion-loss",
        horizonDays: 30,
        horizonSource: "product-default",
        competitionDurationSec: 300,
        deadlineDurationSec: 600,
      },
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
