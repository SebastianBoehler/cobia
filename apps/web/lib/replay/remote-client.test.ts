import { afterEach, describe, expect, it, vi } from "vitest";
import { replayAssetEvidenceRemotely, replayCapabilityRemotely } from "./remote-client";

describe("remote replay client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("sends replay material only to the configured authenticated service", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ reproduced: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    vi.stubEnv("REPLAY_SERVICE_ORIGIN", "https://api.cobia.example");
    vi.stubEnv("REPLAY_SERVICE_SECRET", "s".repeat(32));

    await replayCapabilityRemotely({ blockNumber: "123", program: {}, compiled: [] });

    expect(fetch).toHaveBeenCalledWith(new URL("https://api.cobia.example/v1/replays/capability"),
      expect.objectContaining({ method: "POST", headers: expect.objectContaining({
        authorization: `Bearer ${"s".repeat(32)}`,
      }) }));
  });

  it("rejects plaintext non-loopback origins", async () => {
    vi.stubEnv("REPLAY_SERVICE_ORIGIN", "http://api.cobia.example");
    vi.stubEnv("REPLAY_SERVICE_SECRET", "s".repeat(32));
    await expect(replayCapabilityRemotely({ blockNumber: "123", program: {}, compiled: [] }))
      .rejects.toThrow(/HTTPS/);
  });

  it("sends bounded asset probes to the authenticated replay endpoint", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      transferReturn: "true", transferFromReturn: "true", approveReturn: "true",
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    vi.stubEnv("REPLAY_SERVICE_ORIGIN", "https://api.cobia.example");
    vi.stubEnv("REPLAY_SERVICE_SECRET", "s".repeat(32));
    const token = "0x1111111111111111111111111111111111111111" as const;

    await replayAssetEvidenceRemotely({ chainId: 196, blockNumber: "123", token,
      source: "0x2222222222222222222222222222222222222222", probeAtomic: "1000" });

    expect(fetch).toHaveBeenCalledWith(new URL("https://api.cobia.example/v1/replays/asset-evidence"),
      expect.objectContaining({ method: "POST", body: JSON.stringify({
        chainId: 196, blockNumber: "123", token,
        source: "0x2222222222222222222222222222222222222222", probeAtomic: "1000",
      }) }));
  });
});
