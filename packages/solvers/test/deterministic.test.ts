import { verifyBundle } from "@cobia/domain";
import { describe, expect, it } from "vitest";
import { createDeterministicSolver } from "../src/index";
import { nowSec, policy, snapshot, solverAccount } from "./fixtures";

describe("deterministic solver", () => {
  it("allocates the exact policy cap to the best eligible market", async () => {
    const solver = createDeterministicSolver({
      solverId: "determinist-labs",
      account: solverAccount,
    });
    const bundle = await solver.solve({ policy, snapshot, nowSec });

    expect(bundle.allocations).toEqual([
      { candidateId: "cash:usdc", bps: 6_000 },
      { candidateId: "aave-v3:usdc", bps: 4_000 },
    ]);
    expect(bundle.action).toEqual({
      kind: "aave-v3-supply",
      candidateId: "aave-v3:usdc",
      investmentId: "196-aave-usdc",
      amountAtomic: "10000000000",
    });

    const verdict = await verifyBundle(
      policy,
      snapshot,
      bundle,
      solverAccount.address,
      nowSec,
    );
    expect(verdict.executable).toBe(true);
  });

  it("abstains when no route can satisfy the minimum net APY", async () => {
    const solver = createDeterministicSolver({
      solverId: "determinist-labs",
      account: solverAccount,
    });
    const bundle = await solver.solve({
      policy: { ...policy, minNetApyBps: 300 },
      snapshot,
      nowSec,
    });

    expect(bundle.allocations).toEqual([
      { candidateId: "cash:usdc", bps: 10_000 },
    ]);
    expect(bundle.action.kind).toBe("abstain");
  });

  it("breaks equal-APY ties by stable candidate ID", async () => {
    const solver = createDeterministicSolver({
      solverId: "determinist-labs",
      account: solverAccount,
    });
    const second = {
      ...snapshot.candidates[1],
      id: "aave-v3:aaa",
      investmentId: "196-aave-aaa",
    };
    const bundle = await solver.solve({
      policy,
      snapshot: {
        ...snapshot,
        candidates: [snapshot.candidates[0], snapshot.candidates[1], second],
      },
      nowSec,
    });

    expect(bundle.action).toMatchObject({ candidateId: "aave-v3:aaa" });
  });

  it("does not mutate a deeply frozen snapshot", async () => {
    const frozen = structuredClone(snapshot);
    for (const candidate of frozen.candidates) Object.freeze(candidate);
    Object.freeze(frozen.candidates);
    Object.freeze(frozen);
    const solver = createDeterministicSolver({
      solverId: "determinist-labs",
      account: solverAccount,
    });

    await expect(
      solver.solve({ policy, snapshot: frozen, nowSec }),
    ).resolves.toBeDefined();
  });

  it("derives the cash candidate from the snapshot asset", async () => {
    const solver = createDeterministicSolver({
      solverId: "determinist-labs",
      account: solverAccount,
    });
    const usdgSnapshot = {
      ...snapshot,
      asset: { ...snapshot.asset, symbol: "USDG" },
      candidates: [
        { ...snapshot.candidates[0], id: "cash:usdg" },
        snapshot.candidates[1],
      ],
    };

    const bundle = await solver.solve({ policy, snapshot: usdgSnapshot, nowSec });

    expect(bundle.allocations[0]).toEqual({ candidateId: "cash:usdg", bps: 6_000 });
  });
});
