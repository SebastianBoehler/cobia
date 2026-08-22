import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("../../../../lib/runtime/okx-agent-payments", () => ({
  readProductionOkxAgentPaymentV1: mocks.read,
}));

import { POST } from "./route";

function request(reference: string) {
  return new Request("https://getcobia.com/api/commerce/okx-agent-payments", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://getcobia.com" },
    body: JSON.stringify({ reference }),
  });
}

describe("OKX Agent Payment API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a bounded read-only payment snapshot without caching", async () => {
    const snapshot = { provider: { id: "okx-agent-payments" }, paymentId: "a2a_example", status: "pending" };
    mocks.read.mockResolvedValue(snapshot);

    const response = await POST(request("a2a_01HZX8Q9RK3JWYV7M2N5T8P4AB"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ payment: snapshot });
    expect(mocks.read).toHaveBeenCalledWith("a2a_01HZX8Q9RK3JWYV7M2N5T8P4AB");
  });

  it("does not expose the lookup as a cross-site proxy", async () => {
    const crossSite = new Request("https://getcobia.com/api/commerce/okx-agent-payments", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://attacker.example" },
      body: JSON.stringify({ reference: "a2a_01HZX8Q9RK3JWYV7M2N5T8P4AB" }),
    });

    const response = await POST(crossSite);

    expect(response.status).toBe(403);
    expect(mocks.read).not.toHaveBeenCalled();
  });
});
