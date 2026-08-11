import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  read: vi.fn(),
  advance: vi.fn(),
}));

vi.mock("../../../../../../lib/runtime/execution", () => ({
  getExecutionService: () => ({ read: state.read, advance: state.advance }),
}));

import { GET, POST } from "./route";

const routeId = `0x${"11".repeat(32)}`;
const attemptId = "e35833b3-076c-4879-bdb6-cd90c17bdf63";
const token = "header.payload";
const context = { params: Promise.resolve({ routeId, attemptId }) };

function bearer() {
  return { Authorization: `Bearer ${token}` };
}

describe("mainnet execution attempt endpoint", () => {
  beforeEach(() => {
    state.read.mockReset();
    state.advance.mockReset();
    state.read.mockResolvedValue({ attempt: { id: attemptId, state: "active" } });
    state.advance.mockResolvedValue({ attempt: { id: attemptId, state: "active" } });
  });

  it("requires the bearer attempt credential", async () => {
    const response = await GET(new Request("http://localhost"), context);
    expect(response.status).toBe(401);
    expect(state.read).not.toHaveBeenCalled();
  });

  it("reads and advances only strict actions", async () => {
    const read = await GET(new Request("http://localhost", { headers: bearer() }), context);
    expect(read.status).toBe(200);
    expect(state.read).toHaveBeenCalledWith(routeId, attemptId, token);

    const response = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { ...bearer(), "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "submitted", ordinal: 0, transactionHash: `0x${"55".repeat(32)}`,
      }),
    }), context);
    expect(response.status).toBe(200);
    expect(state.advance).toHaveBeenCalledWith(routeId, attemptId, token, {
      action: "submitted", ordinal: 0, transactionHash: `0x${"55".repeat(32)}`,
    });
  });

  it("rejects caller calldata and hides provider errors", async () => {
    const malformed = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { ...bearer(), "Content-Type": "application/json" },
      body: JSON.stringify({ action: "submitted", ordinal: 0, transactionHash: "0x12",
        data: "0xdead" }),
    }), context);
    expect(malformed.status).toBe(400);
    expect(state.advance).not.toHaveBeenCalled();

    state.read.mockRejectedValueOnce(new Error("postgresql://secret"));
    const response = await GET(new Request("http://localhost", { headers: bearer() }), context);
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("secret");
  });
});
