import { beforeEach, describe, expect, it, vi } from "vitest";

const { readStatus } = vi.hoisted(() => ({ readStatus: vi.fn() }));
vi.mock("../../../../lib/network/read-testnet-status", () => ({
  readTestnetDeploymentStatus: readStatus,
}));

import { GET } from "./route";

beforeEach(() => vi.clearAllMocks());

describe("network status route", () => {
  it("reads the live deployment only for the exact testnet host", async () => {
    readStatus.mockResolvedValueOnce({ chainId: 1952, state: "paused" });
    const response = await GET(new Request("https://testnet.getcobia.com/api/network/status"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ chainId: 1952, state: "paused" });
    expect(readStatus).toHaveBeenCalledOnce();
  });

  it("does not expose the rehearsal status through the mainnet host", async () => {
    const response = await GET(new Request("https://getcobia.com/api/network/status"));
    expect(response.status).toBe(404);
    expect(readStatus).not.toHaveBeenCalled();
  });
});
