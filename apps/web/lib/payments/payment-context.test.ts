import {
  RouteBundleV2Schema,
  StablecoinPolicyV2Schema,
  commitment,
} from "@cobia/domain";
import { describe, expect, it } from "vitest";
import {
  createRepositoryFixture,
  createRepositoryFixtureV2,
  repositoryTestAccount,
  repositoryTestNowSec,
} from "../db/repository-test-fixtures";
import {
  buildContextPaymentTerms,
  paymentCutoffSec,
  validateContextPaymentTerms,
  verifyCurrentExecutablePaymentContext,
  verifySettledRevealPaymentContext,
} from "./payment-context";

const config = {
  COBIA_TREASURY: "0x3333333333333333333333333333333333333333" as const,
  PAYMENT_REALM: "pay.cobia.example",
};

describe("authoritative payment context", () => {
  it("builds stable terms from stored quote time and the earliest executable cutoff", async () => {
    const fixture = await createRepositoryFixture();
    const context = {
      ...fixture,
      quoteCreatedAt: new Date(repositoryTestNowSec * 1_000),
    };

    expect(paymentCutoffSec(context)).toBe(fixture.quote.validUntil);
    expect(buildContextPaymentTerms(context, config)).toMatchObject({
      issuedAt: repositoryTestNowSec,
      expiresAt: fixture.quote.validUntil,
      externalId: fixture.quote.quoteId,
      recipient: fixture.quote.solverAddress,
    });
    const stored = buildContextPaymentTerms(context, config);
    expect(validateContextPaymentTerms(context, stored)).toEqual(stored);
    expect(() => validateContextPaymentTerms(context, {
      ...stored, recipient: "0x4444444444444444444444444444444444444444",
    })).toThrow("do not match");
  });

  it("caps payment terms at 300 seconds after quote issuance", async () => {
    const fixture = await createRepositoryFixture();
    const context = {
      ...fixture,
      quoteCreatedAt: new Date((repositoryTestNowSec - 120) * 1_000),
    };

    expect(paymentCutoffSec(context)).toBe(repositoryTestNowSec + 180);
    expect(buildContextPaymentTerms(context, config)).toMatchObject({
      issuedAt: repositoryTestNowSec - 120,
      expiresAt: repositoryTestNowSec + 180,
    });
  });

  it("recomputes the private bundle at the requested settlement time", async () => {
    const fixture = await createRepositoryFixture();
    const context = {
      ...fixture,
      quoteCreatedAt: new Date(repositoryTestNowSec * 1_000),
    };

    await expect(verifyCurrentExecutablePaymentContext(
      context,
      fixture.quote.quoteId,
      repositoryTestNowSec,
    )).resolves.toMatchObject({ executable: true, bundleHash: fixture.quote.quoteId });
    await expect(verifyCurrentExecutablePaymentContext(
      context,
      fixture.quote.quoteId,
      fixture.quote.validUntil,
    )).rejects.toThrow("not executable");
  });

  it("independently reauthorizes an exact V2 route at settlement time", async () => {
    const fixture = await createRepositoryFixtureV2();
    const context = {
      ...fixture,
      policy: StablecoinPolicyV2Schema.parse(fixture.policy),
      quoteCreatedAt: new Date(repositoryTestNowSec * 1_000),
    };

    await expect(verifyCurrentExecutablePaymentContext(
      context,
      fixture.quote.quoteId,
      repositoryTestNowSec,
    )).resolves.toMatchObject({
      routeAuthorized: true,
      bundleHash: fixture.quote.quoteId,
      recomputedPreGasApyBps: fixture.quote.estimatedPreGasApyBps,
    });
  });

  it("rejects a V2 persisted verdict that differs from the fresh authorization", async () => {
    const fixture = await createRepositoryFixtureV2();
    const context = {
      ...fixture,
      policy: StablecoinPolicyV2Schema.parse(fixture.policy),
      verdict: {
        ...fixture.verdict,
        routeAuthorized: false,
        errorCodes: ["SOLVER_SIGNATURE_INVALID"],
      },
      quoteCreatedAt: new Date(repositoryTestNowSec * 1_000),
    };

    await expect(verifyCurrentExecutablePaymentContext(
      context,
      fixture.quote.quoteId,
      repositoryTestNowSec,
    )).rejects.toThrow("not executable");
  });

  it("rejects an internally consistent V2 context from an unpinned adapter registry", async () => {
    const fixture = await createRepositoryFixtureV2();
    const policy = StablecoinPolicyV2Schema.parse(fixture.policy);
    const snapshot = {
      ...fixture.snapshot,
      adapterRegistryHash: `0x${"de".repeat(32)}` as const,
    };
    const signableInput: Record<string, unknown> = {
      ...fixture.bundle,
      snapshotHash: commitment(snapshot),
    };
    delete signableInput.signature;
    const signable = RouteBundleV2Schema.omit({ signature: true }).parse(signableInput);
    const signature = await repositoryTestAccount.signMessage({
      message: { raw: commitment(signable) },
    });
    const bundle = { ...signable, signature };
    const bundleHash = commitment(bundle);
    const context = {
      policy,
      snapshot,
      bundle,
      verdict: { ...fixture.verdict, bundleHash },
      quote: {
        ...fixture.quote,
        quoteId: bundleHash,
        bundleHash,
      },
      quoteCreatedAt: new Date(repositoryTestNowSec * 1_000),
    };

    await expect(verifyCurrentExecutablePaymentContext(
      context,
      bundleHash,
      repositoryTestNowSec,
    )).rejects.toThrow("not executable");
    await expect(verifySettledRevealPaymentContext(
      context,
      bundleHash,
      repositoryTestNowSec,
    )).resolves.toBeUndefined();
  });
});
