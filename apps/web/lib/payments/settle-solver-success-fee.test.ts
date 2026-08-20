import { describe, expect, it, vi } from "vitest";
import { settleSolverSuccessFee } from "./settle-solver-success-fee";

const credential = { challenge: "signed" };

function repository(state: "settling" | "settled" | "expired" = "settling") {
  return {
    claimSettlement: vi.fn(async () => ({ state, credential,
      settlement: state === "settled" ? { txHash: "0xsettled" } : null })),
    settle: vi.fn(async () => ({})),
    markUncertain: vi.fn(async () => ({})),
  };
}

describe("deferred solver success fee settlement", () => {
  it("settles exactly once after the repository claims the authorization", async () => {
    const fees = repository();
    const settle = vi.fn(async () => ({ txHash: "0xconfirmed" }));

    await expect(settleSolverSuccessFee({
      submissionId: "550e8400-e29b-41d4-a716-446655440000",
      repository: fees as never,
      nowSec: 2_000_000_000,
      settle: settle as never,
    })).resolves.toEqual({ state: "settled", settlement: { txHash: "0xconfirmed" } });
    expect(settle).toHaveBeenCalledOnce();
    expect(settle).toHaveBeenCalledWith(credential);
    expect(fees.settle).toHaveBeenCalledOnce();
    expect(fees.markUncertain).not.toHaveBeenCalled();
  });

  it("never retries or reports success when facilitator outcome is uncertain", async () => {
    const fees = repository();
    const settle = vi.fn(async () => { throw new Error("timeout after submission"); });

    await expect(settleSolverSuccessFee({
      submissionId: "550e8400-e29b-41d4-a716-446655440000",
      repository: fees as never,
      nowSec: 2_000_000_000,
      settle: settle as never,
    })).resolves.toEqual({ state: "uncertain", settlement: null });
    expect(fees.markUncertain).toHaveBeenCalledWith(
      "550e8400-e29b-41d4-a716-446655440000", "SETTLEMENT_UNCERTAIN",
    );
    expect(fees.settle).not.toHaveBeenCalled();
  });

  it.each(["settled", "expired"] as const)("does not call the facilitator for %s fees", async (state) => {
    const fees = repository(state);
    const settle = vi.fn();

    await settleSolverSuccessFee({ submissionId: "550e8400-e29b-41d4-a716-446655440000",
      repository: fees as never, nowSec: 2_000_000_000, settle: settle as never });

    expect(settle).not.toHaveBeenCalled();
  });
});
