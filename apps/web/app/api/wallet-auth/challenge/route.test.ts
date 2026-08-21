import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ issueChallenge: vi.fn() }));
vi.mock("../../../../lib/runtime/wallet-auth", () => ({
  getWalletAuthService: () => mocks,
}));

import { POST } from "./route";

function request(origin = "https://getcobia.com") {
  return new Request("https://getcobia.com/api/wallet-auth/challenge", {
    method: "POST", headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ owner: "0x1111111111111111111111111111111111111111" }),
  });
}

describe("wallet authentication challenge API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.issueChallenge.mockResolvedValue({ nonce: "aa".repeat(32), message: "Sign in", expiresAt: 2_000_000_300 });
  });

  it("issues an origin-bound challenge without caching it", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.issueChallenge).toHaveBeenCalledWith({
      owner: "0x1111111111111111111111111111111111111111",
      origin: "https://getcobia.com", chainId: 196,
    });
  });

  it("rejects cross-origin challenge creation", async () => {
    expect((await POST(request("https://attacker.example"))).status).toBe(403);
    expect(mocks.issueChallenge).not.toHaveBeenCalled();
  });
});
