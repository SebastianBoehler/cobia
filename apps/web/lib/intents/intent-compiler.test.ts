import { describe, expect, it, vi } from "vitest";
import { createOpenAiIntentCompiler } from "./intent-compiler";

function response(text: string) {
  return Response.json({ status: "completed", output: [{ type: "message", status: "completed",
    content: [{ type: "output_text", text }] }] });
}

function simple(value: Record<string, unknown>) {
  return { ...value, kind: "simple", composed: null };
}

describe("intent compiler", () => {
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
    expect(request.model).toBe("test-model");
    expect(request.input).toContain("Swap 10 USDG");
    expect(JSON.parse(request.input).templates).toEqual(["exact-input-swap"]);
    expect(request.input).not.toContain("owner");
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
    const fetcher = vi.fn().mockResolvedValue(response(JSON.stringify(simple({
      status: "clarification", question: "What exact USDt0 amount should be swapped into USDG?",
      templateId: "exact-input-swap",
      inputSymbol: "USDt0", outputSymbol: "USDG", amount: "", minimum: "",
      jurisdiction: null,
    }))));
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

  it("resolves a precise share of a token balance", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(JSON.stringify(simple({
      status: "clarification", question: "What exact USDt0 amount should be swapped into USDG?",
      templateId: "exact-input-swap",
      inputSymbol: "USDt0", outputSymbol: "USDG", amount: "", minimum: "",
      jurisdiction: null,
    }))));
    const compiler = createOpenAiIntentCompiler({
      apiKey: "test", model: "test-model", fetcher, walletBalances: { USDt0: "4.25" },
    });

    await expect(compiler.compile("swap half of my USDt0 into USDG", "any")).resolves.toMatchObject({
      status: "review",
      values: { amount: "2.125", minimum: "2.10375", minimumSource: "stablecoin-default" },
    });
  });

  it("asks for funding when an all-my-token input balance is zero", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(JSON.stringify(simple({
      status: "review", question: null, templateId: "exact-input-swap",
      inputSymbol: "USDt0", outputSymbol: "USDG", amount: "", minimum: "",
      jurisdiction: null,
    }))));
    const compiler = createOpenAiIntentCompiler({
      apiKey: "test", model: "test-model", fetcher, walletBalances: { USDt0: "0" },
    });

    await expect(compiler.compile("swap all my USDt0 into USDG", "any")).resolves.toEqual({
      status: "clarification",
      question: "Your USDt0 wallet balance is zero. Fund it or enter an exact amount.",
    });
  });

  it("explains when native OKB is not a registered terminal asset", async () => {
    const fetcher = vi.fn();
    const compiler = createOpenAiIntentCompiler({
      apiKey: "test", model: "test-model", fetcher,
      walletBalances: { USDt0: "1" },
      assetPricesUsd: { OKB: "111.93", USDt0: "0.9999", USDG: "1.0001" },
    });

    await expect(compiler.compile("all my @USDt0 into @OKB", "any")).resolves.toEqual({
      status: "clarification",
      question: "Native OKB is not a registered route output yet. Choose USDG or USDt0.",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("compiles an exact native OKB conversion into one staged program draft", async () => {
    const fetcher = vi.fn();
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
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("compiles native OKB and USDt0 as two exact inputs to one staged program", async () => {
    const fetcher = vi.fn();
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
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("resolves independent wallet shares for staged native and token inputs", async () => {
    const fetcher = vi.fn();
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
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("asks for an exact share instead of guessing what most means", async () => {
    const fetcher = vi.fn();
    const compiler = createOpenAiIntentCompiler({
      apiKey: "test", model: "test-model", fetcher,
      walletBalances: { OKB: "0.01" }, assetPricesUsd: { OKB: "107.41", USDG: "1" },
    });

    await expect(compiler.compile("turn most of my OKB into USDG", "any")).resolves.toEqual({
      status: "clarification",
      question: "What percentage of your OKB balance should be used?",
    });
    expect(fetcher).not.toHaveBeenCalled();
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
    const compiler = createOpenAiIntentCompiler({ apiKey: "test", model: "test-model", fetcher });

    await expect(compiler.compile("turn 1 USDt0 into USDY", "any")).resolves.toMatchObject({
      status: "review",
      values: {
        templateId: "rwa-acquisition",
        inputToken: "0x779ded0c9e1022225f8e0630b35a9b54be713736",
        outputToken: "0x96f6ef951840721adbf46ac996b59e0235cb985c",
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
