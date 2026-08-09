import { commitment, verifyBundle } from "@cobia/domain";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it, vi } from "vitest";
import { createResearchSolver } from "../src/research";
import { nowSec, policy, snapshot } from "./fixtures";

const account = privateKeyToAccount(
  "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
);

function response(body: object): Response {
  return Response.json({
    status: "completed",
    output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(body) }] }],
  });
}

describe("research solver", () => {
  it("turns researched evidence into a signed constrained bundle", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      response({
        candidateId: "aave-v3:usdc",
        allocationBps: 4_000,
        evidence: [{
          url: "https://governance.aave.com/t/example/1",
          title: "Aave X Layer risk review",
          claim: "The market was reviewed before activation.",
        }],
        riskFlags: [{
          candidateId: "aave-v3:usdc",
          severity: "low",
          code: "NEW_MARKET",
          summary: "The deployment has a shorter operating history.",
          evidenceIndexes: [0],
        }],
      }),
    );

    const solver = createResearchSolver({
      solverId: "research",
      account,
      apiKey: "server-secret",
      model: "research-model",
      fetchImpl,
      now: () => new Date("2026-08-09T10:01:00.000Z"),
    });
    const bundle = await solver.solve({ policy, snapshot, nowSec });
    const verdict = await verifyBundle(policy, snapshot, bundle, account.address, nowSec);

    expect(verdict.executable).toBe(true);
    expect(bundle.action).toMatchObject({ kind: "aave-v3-supply", amountAtomic: "10000000000" });
    expect(bundle.riskFlags[0].evidenceHashes).toEqual([bundle.evidence[0].contentHash]);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.openai.com/v1/responses",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer server-secret" }) }),
    );
    expect(commitment(bundle)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("fails closed on malformed model output", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response({ allocationBps: 4_000 }));
    const solver = createResearchSolver({
      solverId: "research",
      account,
      apiKey: "server-secret",
      model: "research-model",
      fetchImpl,
    });

    await expect(
      solver.solve({ policy, snapshot, nowSec }),
    ).rejects.toThrow();
  });
});
