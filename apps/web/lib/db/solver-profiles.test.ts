import { describe, expect, it } from "vitest";
import { solverProfileIdentityMatches } from "./solver-profiles";

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
