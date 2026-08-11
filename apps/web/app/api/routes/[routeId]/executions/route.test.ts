import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  start: vi.fn(),
}));

vi.mock("../../../../../lib/runtime/execution", () => ({
  getExecutionService: () => ({ start: state.start }),
}));

import { POST } from "./route";

const routeId = `0x${"11".repeat(32)}`;
const proof = {
  version: 1,
  domain: "cobia.execution.mainnet.v1",
  realm: "localhost:3000",
  routeId,
  bundleHash: routeId,
  buyer: "0x1111111111111111111111111111111111111111",
  executionChainId: 196,
  rehearsalTraceHash: `0x${"22".repeat(32)}`,
  nonce: `0x${"33".repeat(32)}`,
  expiresAt: 2_000_000_240,
};

function request(body: unknown) {
  return POST(new Request(`http://localhost/api/routes/${routeId}/executions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }), { params: Promise.resolve({ routeId }) });
}

describe("mainnet execution start endpoint", () => {
  beforeEach(() => {
    state.start.mockReset();
    state.start.mockResolvedValue({ attempt: { id: crypto.randomUUID(), state: "active" } });
  });

  it("returns a no-store allowlisted service result", async () => {
    const response = await request({ proof, signature: `0x${"44".repeat(65)}` });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ attempt: { state: "active" } });
    expect(state.start).toHaveBeenCalledWith(routeId, proof, `0x${"44".repeat(65)}`);
  });

  it("rejects malformed bodies before service work", async () => {
    const response = await request({ proof: { ...proof, executionChainId: 1952 } });
    expect(response.status).toBe(400);
    expect(state.start).not.toHaveBeenCalled();
  });

  it("maps stale and provider errors without reflecting internals", async () => {
    state.start.mockRejectedValueOnce(new Error("Purchased route is no longer executable"));
    expect((await request({ proof, signature: `0x${"44".repeat(65)}` })).status).toBe(409);

    state.start.mockRejectedValueOnce(new Error("rpc https://user:secret@example.invalid"));
    const response = await request({ proof, signature: `0x${"44".repeat(65)}` });
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(JSON.stringify(body)).not.toContain("user:secret");
  });
});
