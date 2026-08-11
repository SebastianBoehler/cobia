import { describe, expect, it } from "vitest";
import { validateRoundArtifacts } from "./persisted-round";
import { createRepositoryFixtureV2 } from "./repository-test-fixtures";

function roundInput(
  fixture: Awaited<ReturnType<typeof createRepositoryFixtureV2>>,
  quoteInput = fixture.quote,
) {
  return {
    requestId: fixture.policy.requestId,
    storedPolicy: fixture.policy,
    storedPolicyHash: fixture.bundle.policyHash,
    storedSnapshot: fixture.snapshot,
    bundleInput: fixture.bundle,
    verdictInput: fixture.verdict,
    quoteInput,
  };
}

describe("validateRoundArtifacts V2 projection", () => {
  it("rejects a public expiry beyond the signed bundle expiry", async () => {
    const fixture = await createRepositoryFixtureV2();

    expect(() => validateRoundArtifacts(roundInput(fixture, {
      ...fixture.quote,
      validUntil: fixture.bundle.validUntil + 1,
    }))).toThrow(/projection/i);
  });

  it("rejects a public risk grade not produced by the verifier projection", async () => {
    const fixture = await createRepositoryFixtureV2();

    expect(() => validateRoundArtifacts(roundInput(fixture, {
      ...fixture.quote,
      riskGrade: "moderate",
    }))).toThrow(/projection/i);
  });
});
