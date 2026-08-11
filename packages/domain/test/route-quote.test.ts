import { describe, expect, it } from "vitest";
import { projectRouteQuote, RouteQuoteSchema, verifyBundle } from "../src/index";
import {
  account,
  criticalRiskFlag,
  nowSec,
  policy,
  signedBundle,
  snapshot,
} from "./verification-fixtures";

describe("public quote projection", () => {
  it("normalizes a legacy stored low grade at the public schema boundary", async () => {
    const bundle = await signedBundle();
    const verdict = await verifyBundle(
      policy,
      snapshot,
      bundle,
      account.address,
      nowSec,
    );
    const projected = projectRouteQuote(bundle, verdict, "100000", 2_000_000_000);

    const quote = RouteQuoteSchema.parse({ ...projected, riskGrade: "low" });

    expect(quote.riskGrade).toBe("unassessed");
  });

  it("projects an empty risk assessment as unassessed", async () => {
    const bundle = await signedBundle({ evidence: [], riskFlags: [] });
    const verdict = await verifyBundle(
      policy,
      snapshot,
      bundle,
      account.address,
      nowSec,
    );

    const quote = projectRouteQuote(bundle, verdict, "100000", 2_000_000_000);

    expect(quote.riskGrade).toBe("unassessed");
  });

  it("does not treat unrelated evidence as a low-risk assessment", async () => {
    const bundle = await signedBundle({ riskFlags: [] });
    const verdict = await verifyBundle(
      policy,
      snapshot,
      bundle,
      account.address,
      nowSec,
    );

    const quote = projectRouteQuote(bundle, verdict, "100000", 2_000_000_000);

    expect(quote.riskGrade).toBe("unassessed");
  });

  it("grades critical risk as elevated", async () => {
    const bundle = await signedBundle({ riskFlags: [criticalRiskFlag] });
    const verdict = await verifyBundle(
      policy,
      snapshot,
      bundle,
      account.address,
      nowSec,
    );

    const quote = projectRouteQuote(bundle, verdict, "100000", 2_000_000_000);

    expect(quote.riskGrade).toBe("elevated");
  });

  it("exposes comparison metrics without leaking executable route fields", async () => {
    const bundle = await signedBundle();
    const verdict = await verifyBundle(
      policy,
      snapshot,
      bundle,
      account.address,
      nowSec,
    );
    const quote = projectRouteQuote(bundle, verdict, "100000", 2_000_000_000);
    const serialized = JSON.stringify(quote);

    expect(quote).toMatchObject({
      solverId: "determinist-labs",
      expectedNetApyBps: 256,
      priceAtomic: "100000",
    });
    expect(serialized).not.toContain("aave-v3-supply");
    expect(serialized).not.toContain("196-aave-usdc");
    expect(serialized).not.toContain("https://");
    expect(serialized).not.toContain("10000000000");
  });
});
