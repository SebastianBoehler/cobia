import { describe, expect, it } from "vitest";
import {
  solverCapabilityAvailable,
  solverProfileIdentityMatches,
} from "./solver-profiles";

describe("solver profile identity", () => {
  it("allows capability refreshes only for the same attestation identity", () => {
    const stored = { operatorKind: "community",
      attestationAddress: "0x1111111111111111111111111111111111111111" } as const;

    expect(solverProfileIdentityMatches(stored, stored)).toBe(true);
    expect(solverProfileIdentityMatches(stored, { ...stored,
      attestationAddress: "0x2222222222222222222222222222222222222222" })).toBe(false);
    expect(solverProfileIdentityMatches(stored, { ...stored, operatorKind: "internal" })).toBe(false);
  });
});

describe("solver capability availability", () => {
  const nowSec = 1_800_000_000;

  it("requires a fresh profile advertising the exact policy capability", () => {
    const profiles = [{
      declaredCapabilities: ["policy.capability-composition@1"],
      updatedAt: new Date((nowSec - 299) * 1_000),
    }];

    expect(solverCapabilityAvailable(
      profiles, "policy.capability-composition@1", nowSec,
    )).toBe(true);
    expect(solverCapabilityAvailable(
      profiles, "policy.capability-composition@2", nowSec,
    )).toBe(false);
    expect(solverCapabilityAvailable(
      [{ ...profiles[0]!, updatedAt: new Date((nowSec - 301) * 1_000) }],
      "policy.capability-composition@1", nowSec,
    )).toBe(false);
  });
});
