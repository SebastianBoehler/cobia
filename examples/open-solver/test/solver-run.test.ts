import { solverRunClaimCommitmentV1, type SolverRunClaimV1 } from "@cobia/domain";
import { recoverMessageAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it, vi } from "vitest";
import { announceSolverRun } from "../src/solver-run";

describe("solver run lifecycle", () => {
  it("announces the signed snapshot revision before generation", async () => {
    const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
    const startRun = vi.fn(async (_input: { claim: SolverRunClaimV1; signature: Hex }) =>
      ({ state: "running" as const }));
    const intentId = "550e8400-e29b-41d4-a716-446655440000";
    const snapshotHash = `0x${"22".repeat(32)}` as const;

    await announceSolverRun({ client: { startRun }, account, solverId: "alpha-solver",
      intent: { id: intentId, snapshotHash, competitionClosesAt: 2_000_000_300 },
      revision: 1, nowSec: 2_000_000_100 });

    const value = startRun.mock.calls[0]![0];
    expect(value.claim).toMatchObject({ version: 1, solverId: "alpha-solver", intentId,
      revision: 1, snapshotHash, issuedAt: 2_000_000_100, expiresAt: 2_000_000_300 });
    await expect(recoverMessageAddress({
      message: { raw: solverRunClaimCommitmentV1(value.claim) }, signature: value.signature,
    })).resolves.toBe(account.address);
  });
});
