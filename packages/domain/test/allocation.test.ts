import { describe, expect, it } from "vitest";
import {
  atomicWeightedApyBps,
  commitment,
  splitAtomicAllocation,
  verifyBundle,
} from "../src/index";
import {
  account,
  nowSec,
  policy,
  signedBundle,
  snapshot,
} from "./verification-fixtures";

describe("atomic allocation", () => {
  it("assigns every odd-principal rounding remainder to cash", () => {
    const split = splitAtomicAllocation("25000000001", 4_000);

    expect(split).toEqual({
      protocolAtomic: "10000000000",
      cashAtomic: "15000000001",
    });
    expect(BigInt(split.protocolAtomic) + BigInt(split.cashAtomic)).toBe(
      25000000001n,
    );
  });

  it("weights APY by the protocol atomic amount actually invested", () => {
    expect(atomicWeightedApyBps(642, "1", "3")).toBe(214);
  });

  it("rejects a positive protocol allocation whose atomic amount is zero", async () => {
    const tinyPolicy = {
      ...policy,
      principalAtomic: "1",
      minNetApyBps: 0,
    };
    const bundle = await signedBundle({
      policyHash: commitment(tinyPolicy),
      expectedNetApyBps: 0,
      action: {
        kind: "aave-v3-supply",
        candidateId: "aave-v3:usdc",
        investmentId: "196-aave-usdc",
        amountAtomic: "0",
      },
    });

    const verdict = await verifyBundle(
      tinyPolicy,
      snapshot,
      bundle,
      account.address,
      nowSec,
    );

    expect(verdict.errorCodes).toContain("ACTION_NOT_ALLOWED");
    expect(verdict.executable).toBe(false);
  });

  it("verifies APY from the atomic amount actually supplied", async () => {
    const tinyPolicy = { ...policy, principalAtomic: "3" };
    const bundle = await signedBundle({
      policyHash: commitment(tinyPolicy),
      expectedNetApyBps: 214,
      action: {
        kind: "aave-v3-supply",
        candidateId: "aave-v3:usdc",
        investmentId: "196-aave-usdc",
        amountAtomic: "1",
      },
    });

    const verdict = await verifyBundle(
      tinyPolicy,
      snapshot,
      bundle,
      account.address,
      nowSec,
    );

    expect(verdict.recomputedNetApyBps).toBe(214);
    expect(verdict.executable).toBe(true);
  });

  it("accepts an exact all-cash hold amount", async () => {
    const cashPolicy = { ...policy, minNetApyBps: 0 };
    const bundle = await signedBundle({
      policyHash: commitment(cashPolicy),
      allocations: [{ candidateId: "cash:usdc", bps: 10_000 }],
      expectedNetApyBps: 0,
      action: { kind: "hold", amountAtomic: "25000000000" },
    });

    const verdict = await verifyBundle(
      cashPolicy,
      snapshot,
      bundle,
      account.address,
      nowSec,
    );

    expect(verdict.errorCodes).toEqual([]);
    expect(verdict.executable).toBe(true);
  });
});
