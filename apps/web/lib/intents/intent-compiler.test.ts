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
