import { describe, expect, it, vi } from "vitest";
import { POST, resolveAssetMentionRequest } from "./route";

const xstocks = {
  id: "rwa.instruments" as const,
  version: 1 as const,
  run: vi.fn().mockResolvedValue({ status: "abstained", code: "NOT_FOUND", message: "Not found" }),
};

describe("POST /api/assets/resolve", () => {
  it("returns exact known identities and explicit unresolved mentions", async () => {
    const response = await resolveAssetMentionRequest(new Request("https://getcobia.com/api/assets/resolve", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ symbols: ["USDG", "FAKE"] }),
    }), xstocks);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      assets: [{ symbol: "USDG", chainId: 196, status: "supported" }],
      unresolved: ["FAKE"],
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects oversized or malformed resolution requests", async () => {
    const response = await POST(new Request("https://getcobia.com/api/assets/resolve", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ symbols: Array.from({ length: 9 }, (_, index) => `T${index}`) }),
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "ASSET_RESOLUTION_INVALID" });
  });
});
