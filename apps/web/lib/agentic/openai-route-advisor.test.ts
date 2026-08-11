import type { RouteCandidateSummaryV2 } from "@cobia/solvers";
import { describe, expect, it, vi } from "vitest";
import { createOpenAiRouteAdvisor } from "./openai-route-advisor";

const candidates: RouteCandidateSummaryV2[] = [{
  id: "direct:aave:usd",
  estimatedPreGasApyBps: 16,
  retainedAtomic: "6000000",
  deployedAtomic: "4000000",
  actions: ["aave-v3-supply"],
}, {
  id: "swap:usd0:usd1:aave",
  estimatedPreGasApyBps: 18,
  retainedAtomic: "6000000",
  deployedAtomic: "4000000",
  actions: ["uniswap-v3-exact-input", "aave-v3-supply"],
}];

const policy = {
  version: 2 as const,
  requestId: "550e8400-e29b-41d4-a716-446655440000",
  owner: "0x1111111111111111111111111111111111111111" as const,
  executionChainId: 196 as const,
  asset: "0x2222222222222222222222222222222222222222" as const,
  principalAtomic: "10000000",
  protocolExposureBps: 4_000,
  minTvlUsdE6: "1000000",
  minPreGasApyBps: 5,
  maxSnapshotAgeSec: 300,
  deadline: 2_000_000_000,
  noBridges: true as const,
  allowedOutputAssets: [
    "0x2222222222222222222222222222222222222222" as const,
  ],
  allowedAdapters: ["aave-v3@1" as const, "uniswap-v3@1" as const],
  maxSlippageBps: 50,
  horizonDays: 30,
};

function responseWith(output: unknown): Response {
  return new Response(JSON.stringify({
    status: "completed",
    output: [{
      type: "message",
      status: "completed",
      content: [{ type: "output_text", text: JSON.stringify(output) }],
    }],
  }), { status: 200, headers: { "content-type": "application/json" } });
}

describe("OpenAI route advisor", () => {
  it("uses a strict candidate-id schema and returns the validated choice", async () => {
    const fetcher = vi.fn(async (
      _input: RequestInfo | URL,
      _init?: RequestInit,
    ) => {
      void _input;
      void _init;
      return responseWith({
        candidateId: candidates[1]!.id,
        rationale: "Higher expected pre-gas return justifies the registered swap.",
      });
    });
    const advisor = createOpenAiRouteAdvisor({
      apiKey: "test-key",
      model: "gpt-test",
      fetcher,
    });

    await expect(advisor.choose({ policy, candidates })).resolves.toEqual({
      candidateId: candidates[1]!.id,
      rationale: "Higher expected pre-gas return justifies the registered swap.",
    });
    const [url, init] = fetcher.mock.calls[0]!;
    const body = JSON.parse(String(init?.body));
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer test-key" });
    expect(body).toMatchObject({
      model: "gpt-test",
      store: false,
      text: {
        format: {
          type: "json_schema",
          name: "cobia_route_choice",
          strict: true,
          schema: {
            additionalProperties: false,
            properties: {
              candidateId: { enum: candidates.map(({ id }) => id) },
            },
          },
        },
      },
    });
    expect(body).not.toHaveProperty("tools");
  });

  it("rejects a response that names a route outside the server candidates", async () => {
    const advisor = createOpenAiRouteAdvisor({
      apiKey: "test-key",
      model: "gpt-test",
      fetcher: vi.fn(async () => responseWith({
        candidateId: "invented:route",
        rationale: "Trust me.",
      })),
    });

    await expect(advisor.choose({ policy, candidates })).rejects.toThrow(
      "unknown route candidate",
    );
  });

  it("fails closed on refusals or incomplete model output", async () => {
    const advisor = createOpenAiRouteAdvisor({
      apiKey: "test-key",
      model: "gpt-test",
      fetcher: vi.fn(async () => new Response(JSON.stringify({
        status: "incomplete",
        output: [],
      }), { status: 200 })),
    });

    await expect(advisor.choose({ policy, candidates })).rejects.toThrow(
      "did not return a completed route choice",
    );
  });
});
