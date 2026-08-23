import { beforeEach, describe, expect, it, vi } from "vitest";

const { readMainnetStatus, readTestnetStatus, readV4Status } = vi.hoisted(() => ({
  readMainnetStatus: vi.fn(), readTestnetStatus: vi.fn(), readV4Status: vi.fn(),
}));
vi.mock("../../../../lib/network/read-testnet-status", () => ({
  readTestnetDeploymentStatus: readTestnetStatus,
}));
vi.mock("../../../../lib/network/read-mainnet-access-status", () => ({
  readMainnetAccessStatus: readMainnetStatus,
}));
vi.mock("../../../../lib/network/general-asset-launch-status", () => ({
  readGeneralAssetLaunchStatus: readV4Status,
}));

import { GET } from "./route";

beforeEach(() => vi.clearAllMocks());

describe("network status route", () => {
  it("reads the live deployment only for the exact testnet host", async () => {
    readTestnetStatus.mockResolvedValueOnce({ chainId: 1952, state: "paused" });
    const response = await GET(new Request("https://testnet.getcobia.com/api/network/status"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control"))
      .toBe("public, max-age=0, s-maxage=10, stale-while-revalidate=30");
    expect(await response.json()).toEqual({ chainId: 1952, state: "paused" });
    expect(readTestnetStatus).toHaveBeenCalledOnce();
    expect(readMainnetStatus).not.toHaveBeenCalled();
    expect(readV4Status).not.toHaveBeenCalled();
  });

  it("exposes current V3 access and the separate V4 launch gate", async () => {
    readMainnetStatus.mockResolvedValueOnce({
      chainId: 196, state: "scheduled", activationAt: 1_787_440_661,
    });
    readV4Status.mockResolvedValueOnce({ state: "canary-scheduled", activationAt: 1_787_678_169 });
    const response = await GET(new Request("https://getcobia.com/api/network/status"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ state: "scheduled", activationAt: 1_787_440_661,
      v4: { state: "canary-scheduled", activationAt: 1_787_678_169 } });
    expect(readMainnetStatus).toHaveBeenCalledOnce();
    expect(readV4Status).toHaveBeenCalledOnce();
    expect(readTestnetStatus).not.toHaveBeenCalled();
  });

  it("keeps live V3 status available if the V4 status read fails", async () => {
    readMainnetStatus.mockResolvedValueOnce({ chainId: 196, state: "live", activationAt: 0 });
    readV4Status.mockRejectedValueOnce(new Error("V4 RPC read failed"));

    const response = await GET(new Request("https://getcobia.com/api/network/status"));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ state: "live", v4: { state: "unavailable", activationAt: 0 } });
  });

  it("does not expose RPC implementation errors", async () => {
    readMainnetStatus.mockRejectedValueOnce(new Error("eth_call failed against secret upstream"));

    const response = await GET(new Request("https://getcobia.com/api/network/status"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      code: "NETWORK_RPC_UNAVAILABLE",
      message: "X Layer status is temporarily unavailable.",
    });
  });
});
