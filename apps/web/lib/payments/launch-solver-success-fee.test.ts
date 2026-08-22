import { describe, expect, it, vi } from "vitest";
import { finalizeSolverSuccessFee } from "./launch-solver-success-fee";

describe("launch solver success fee", () => {
  it("waives the fee without claiming or settling an authorization", async () => {
    const repository = {
      claimSettlement: vi.fn(), settle: vi.fn(), markUncertain: vi.fn(),
    };
    const settle = vi.fn();

    await expect(finalizeSolverSuccessFee({
      submissionId: "550e8400-e29b-41d4-a716-446655440000",
      repository: repository as never,
      nowSec: 2_000_000_000,
      settle: settle as never,
    })).resolves.toEqual({ state: "waived" });
    expect(repository.claimSettlement).not.toHaveBeenCalled();
    expect(settle).not.toHaveBeenCalled();
  });
});
