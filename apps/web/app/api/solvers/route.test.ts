import { solverProfileClaimCommitmentV1 } from "@cobia/domain";
import { privateKeyToAccount } from "viem/accounts";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ register: vi.fn(), list: vi.fn() }));
vi.mock("../../../lib/runtime/market", () => ({
  getSolverProfileRepository: () => mocks,
}));

import { GET, POST } from "./route";

const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
const nowSec = 2_000_000_100;
const claim = {
  version: 1 as const,
  solverId: "alpha-solver",
  displayName: "Alpha Solver",
  operator: account.address.toLowerCase() as `0x${string}`,
  declaredCapabilities: ["evm.raw@1", "okx.dex@1"],
  nonce: `0x${"22".repeat(32)}` as `0x${string}`,
  issuedAt: nowSec - 10,
  expiresAt: nowSec + 300,
};

async function request(signer = account) {
  const signature = await signer.signMessage({
    message: { raw: solverProfileClaimCommitmentV1(claim) },
  });
  return new Request("https://cobia.example/api/solvers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ claim, signature }),
  });
}

describe("solver profile API", () => {
  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(nowSec * 1_000);
    vi.clearAllMocks();
    mocks.register.mockResolvedValue({ id: claim.solverId });
    mocks.list.mockResolvedValue([]);
  });

  it("registers a community solver only for its recovered operator", async () => {
    const response = await POST(await request());

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      solverId: claim.solverId,
      operator: claim.operator,
      links: { profile: `/solvers/${claim.solverId}` },
    });
    expect(mocks.register).toHaveBeenCalledWith({
      id: claim.solverId,
      displayName: claim.displayName,
      operatorKind: "community",
      attestationAddress: claim.operator,
      declaredCapabilities: claim.declaredCapabilities,
    });
  });

  it("rejects identity squatting before persistence", async () => {
    const other = privateKeyToAccount(`0x${"33".repeat(32)}`);
    const response = await POST(await request(other));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_SOLVER_SIGNATURE" });
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it("rejects an expired profile claim as client input", async () => {
    vi.spyOn(Date, "now").mockReturnValue(claim.expiresAt * 1_000);
    const response = await POST(await request());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_SOLVER_PROFILE" });
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it("lists public solver evidence without caching it", async () => {
    mocks.list.mockResolvedValue([{ id: claim.solverId, displayName: claim.displayName,
      operatorKind: "community", declaredCapabilities: claim.declaredCapabilities,
      performance: [{ segment: { chainId: 196, intentClass: "general" } }] }]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ observedAt: nowSec, solvers: [{
      id: claim.solverId,
      displayName: claim.displayName,
      operatorKind: "community",
      declaredCapabilities: claim.declaredCapabilities,
      performance: [{ segment: { chainId: 196, intentClass: "general" } }],
      links: { profile: `/solvers/${claim.solverId}` },
    }] });
  });
});
