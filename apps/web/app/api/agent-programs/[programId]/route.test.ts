import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  calls: 0,
  result: undefined as Record<string, unknown> | undefined,
  error: undefined as Error | undefined,
}));

vi.mock("@/lib/runtime/market", () => ({
  getAgentProgramRepository: () => ({
    getExecutionContext: async () => {
      state.calls += 1;
      if (state.error) throw state.error;
      return state.result;
    },
  }),
}));

import { GET } from "./route";

function context(programId: string) {
  return { params: Promise.resolve({ programId }) };
}

describe("agent program reads", () => {
  beforeEach(() => {
    state.calls = 0;
    state.result = undefined;
    state.error = undefined;
  });

  it("rejects malformed program ids before querying the repository", async () => {
    const response = await GET(
      new Request("https://cobia.example/api/agent-programs/not-a-uuid"),
      context("not-a-uuid"),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toStrictEqual({
      code: "INVALID_PROGRAM_ID",
      message: "Agent program id is invalid.",
    });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(state.calls).toBe(0);
  });

  it("does not expose database errors", async () => {
    state.error = new Error("select secret from internal_table");

    const response = await GET(
      new Request("https://cobia.example/api/agent-programs/00000000-0000-4000-8000-000000000000"),
      context("00000000-0000-4000-8000-000000000000"),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toStrictEqual({
      code: "READ_FAILED",
      message: "Could not read agent program.",
    });
    expect(JSON.stringify(body)).not.toContain("internal_table");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
