import { describe, expect, it, vi } from "vitest";
import { createOpenAiIntentCompiler } from "./intent-compiler";

function response(text: string) {
  return Response.json({ status: "completed", output: [{ type: "message", status: "completed",
    content: [{ type: "output_text", text }] }] });
}

describe("intent compiler", () => {
  it("compiles prose to editable receipt values without creating wallet authority", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(JSON.stringify({
      status: "review", question: null, templateId: "exact-input-swap",
      inputSymbol: "USDG", outputSymbol: "USDt0", amount: "10", minimum: "9.95",
      jurisdiction: null,
    })));
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

  it("returns a clarification instead of inventing unsupported bounds", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(JSON.stringify({
      status: "clarification", question: "What is the maximum amount to spend?",
      templateId: "exact-input-swap", inputSymbol: "USDG", outputSymbol: "USDt0",
      amount: "", minimum: "", jurisdiction: "DE",
    })));
    const compiler = createOpenAiIntentCompiler({ apiKey: "test", model: "test-model", fetcher });

    await expect(compiler.compile("Get me some USDt0", "any")).resolves.toEqual({
      status: "clarification", question: "What is the maximum amount to spend?",
    });
  });

  it("normalizes UI mention markers before asking the model", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(JSON.stringify({
      status: "review", question: null, templateId: "exact-input-swap",
      inputSymbol: "USDG", outputSymbol: "USDt0", amount: "10", minimum: "9.95",
      jurisdiction: null,
    })));
    const compiler = createOpenAiIntentCompiler({ apiKey: "test", model: "test-model", fetcher });

    await compiler.compile("Swap 10 @USDG for at least 9.95 @USDt0 on @XLayer", "exact-input-swap");

    const request = JSON.parse(fetcher.mock.calls[0]![1]!.body as string);
    expect(request.input).toContain("Swap 10 USDG for at least 9.95 USDt0 on XLayer");
    expect(request.input).not.toContain("@");
  });

  it("resolves an xStock to its exact registered X Layer token", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(JSON.stringify({
      status: "review", question: null, templateId: "rwa-acquisition",
      inputSymbol: "USDG", outputSymbol: "TSLAx", amount: "10", minimum: "0.01",
      jurisdiction: "DE",
    })));
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
});
