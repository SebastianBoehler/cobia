import { describe, expect, it, vi } from "vitest";
import { createLifiRoutesToolV1 } from "./lifi";

describe("LI.FI solver tool", () => {
  it("returns immutable evidence without a wallet or send capability", async () => {
    const request = vi.fn().mockResolvedValue({
      value: { id: "quote:0" },
      responseHash: `0x${"11".repeat(32)}`,
      fetchedAt: 2_000_000_000,
    });
    const tool = createLifiRoutesToolV1({ request });
    const result = await tool.run({ operation: "chains", query: {} });

    expect(result.status).toBe("ok");
    expect(result).toMatchObject({ sourceHash: `0x${"11".repeat(32)}` });
    expect(JSON.stringify(result)).not.toMatch(/wallet|sign|sendTransaction|rpcUrl/i);
  });

  it("returns typed abstention instead of fabricated data", async () => {
    const tool = createLifiRoutesToolV1({ request: vi.fn().mockRejectedValue(new Error("No route")) });
    await expect(tool.run({ operation: "quote", query: {} })).resolves.toEqual({
      status: "abstained", code: "LIFI_UNAVAILABLE", message: "No route",
    });
  });
});
