import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authenticate: vi.fn() }));
vi.mock("../../../../lib/runtime/wallet-auth", () => ({
  getWalletAuthService: () => mocks,
}));

import { POST } from "./route";

function request(origin = "https://getcobia.com") {
  return new Request("https://getcobia.com/api/wallet-auth/session", {
    method: "POST", headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ owner: "0x1111111111111111111111111111111111111111",
      nonce: "aa".repeat(32), signature: `0x${"bb".repeat(65)}` }),
  });
}

describe("wallet authentication session API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticate.mockResolvedValue({ token: "cc".repeat(32),
      owner: "0x1111111111111111111111111111111111111111", expiresAt: 2_000_000_900 });
  });

  it("sets an opaque HttpOnly same-site session cookie", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("cobia_wallet_session=");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")?.toLowerCase()).toContain("samesite=strict");
    expect(response.headers.get("set-cookie")).not.toContain("Secure");
  });

  it("rejects cross-origin session creation", async () => {
    expect((await POST(request("https://attacker.example"))).status).toBe(403);
    expect(mocks.authenticate).not.toHaveBeenCalled();
  });

  it("reports session storage failures as unavailable instead of bad signatures", async () => {
    mocks.authenticate.mockRejectedValueOnce(new Error("database unavailable"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: "WALLET_AUTH_UNAVAILABLE" });
  });
});
