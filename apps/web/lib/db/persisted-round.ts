import {
  PersistedBundleSchema,
  PersistedRouteVerificationVerdictV2Schema,
  PersistedSnapshotSchema,
  PersistedStablecoinPolicySchema,
  RouteQuoteSchema,
  RouteQuoteV2Schema,
  VerificationVerdictSchema,
  assertVerifiedRouteVerdictV2,
  commitment,
  projectRouteQuoteV2,
  type PersistedBundle,
  type PersistedRouteQuote,
  type PersistedSnapshot,
  type PersistedStablecoinPolicy,
  type DecisionBundle,
  type MarketSnapshot,
  type RouteQuote,
  type RouteQuoteV2,
  type RouteBundleV2,
  type RouteSnapshotV2,
  type RouteVerificationVerdictV2,
  type StablecoinPolicy,
  type StablecoinPolicyV2,
  type VerificationVerdict,
} from "@cobia/domain";
import { isAddressEqual } from "viem";

export type PublicPersistedQuote = RouteQuote | RouteQuoteV2;

function sameHash(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function sameErrors(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((code, index) => code === right[index]);
}

export function parsePublicPersistedQuote(input: unknown): PublicPersistedQuote {
  const stored = input as { version?: unknown };
  return stored.version === 1
    ? RouteQuoteSchema.parse(input)
    : RouteQuoteV2Schema.parse(input);
}

export function parsePersistedPolicy(input: unknown): PersistedStablecoinPolicy {
  return PersistedStablecoinPolicySchema.parse(input);
}

export function parsePersistedSnapshot(input: unknown): PersistedSnapshot {
  return PersistedSnapshotSchema.parse(input);
}

export function validateSnapshotArtifact(
  requestId: string,
  policyInput: unknown,
  snapshotInput: unknown,
): PersistedSnapshot {
  const policy = parsePersistedPolicy(policyInput);
  const snapshot = parsePersistedSnapshot(snapshotInput);
  if (policy.version !== snapshot.version) {
    throw new Error("Persisted artifact version mismatch");
  }
  if (policy.requestId !== requestId || snapshot.requestId !== requestId) {
    throw new Error("Snapshot request mismatch");
  }
  return snapshot;
}

interface RoundArtifactsInput {
  requestId: string;
  storedPolicy: unknown;
  storedPolicyHash: string;
  storedSnapshot: unknown;
  bundleInput: PersistedBundle;
  verdictInput: unknown;
  quoteInput: PersistedRouteQuote;
}

interface ValidatedRoundArtifactsBase {
  eligible: boolean;
}

export type ValidatedRoundArtifacts =
  | ValidatedRoundArtifactsBase & {
    version: 1;
    policy: StablecoinPolicy;
    snapshot: MarketSnapshot;
    bundle: DecisionBundle;
    verdict: VerificationVerdict;
    quote: RouteQuote;
  }
  | ValidatedRoundArtifactsBase & {
    version: 2;
    policy: StablecoinPolicyV2;
    snapshot: RouteSnapshotV2;
    bundle: RouteBundleV2;
    verdict: {
      bundleHash: `0x${string}`;
      routeAuthorized: boolean;
      errorCodes: string[];
      recomputedPreGasApyBps: number;
    };
    quote: RouteQuoteV2;
  };

export function validatePersistedRoundArtifacts(
  input: RoundArtifactsInput,
): ValidatedRoundArtifacts {
  const policy = parsePersistedPolicy(input.storedPolicy);
  const snapshot = parsePersistedSnapshot(input.storedSnapshot);
  const bundle = PersistedBundleSchema.parse(input.bundleInput);
  if (
    policy.version !== snapshot.version ||
    policy.version !== bundle.version
  ) throw new Error("Persisted artifact version mismatch");
  const verdict = bundle.version === 1
    ? VerificationVerdictSchema.parse(input.verdictInput)
    : PersistedRouteVerificationVerdictV2Schema.parse(input.verdictInput);
  const quote = bundle.version === 1
    ? RouteQuoteSchema.parse(input.quoteInput)
    : RouteQuoteV2Schema.parse(input.quoteInput);
  if (quote.version !== bundle.version) {
    throw new Error("Persisted artifact version mismatch");
  }
  const bundleHash = commitment(bundle);
  if (
    policy.requestId !== input.requestId ||
    snapshot.requestId !== input.requestId ||
    bundle.requestId !== input.requestId ||
    quote.requestId !== input.requestId ||
    !sameHash(input.storedPolicyHash, commitment(policy)) ||
    !sameHash(bundle.policyHash, commitment(policy)) ||
    !sameHash(bundle.snapshotHash, commitment(snapshot)) ||
    !sameHash(verdict.bundleHash, bundleHash) ||
    !sameHash(quote.bundleHash, bundleHash) ||
    !sameHash(quote.quoteId, bundleHash)
  ) throw new Error("Quote commitment mismatch");
  if (
    quote.solverId !== bundle.solverId ||
    !isAddressEqual(quote.solverAddress, bundle.solverAddress)
  ) throw new Error("Quote solver mismatch");

  if (
    policy.version === 1
    && snapshot.version === 1
    && bundle.version === 1
    && quote.version === 1
    && "executable" in verdict
  ) {
    if (
      quote.verification.executable !== verdict.executable ||
      quote.verification.score !== verdict.score ||
      quote.expectedNetApyBps !== verdict.recomputedNetApyBps ||
      !sameErrors(quote.verification.errorCodes, verdict.errorCodes)
    ) throw new Error("Quote verdict projection mismatch");
    return {
      version: 1,
      policy,
      snapshot,
      bundle,
      verdict,
      quote,
      eligible: verdict.executable,
    };
  }
  if (
    policy.version === 2
    && snapshot.version === 2
    && bundle.version === 2
    && quote.version === 2
    && "routeAuthorized" in verdict
  ) {
    if (
      quote.authorization.routeAuthorized !== verdict.routeAuthorized ||
      quote.estimatedPreGasApyBps !== verdict.recomputedPreGasApyBps ||
      !sameErrors(quote.authorization.errorCodes, verdict.errorCodes)
    ) throw new Error("Quote verdict projection mismatch");
    return {
      version: 2,
      policy,
      snapshot,
      bundle,
      verdict,
      quote,
      eligible: verdict.routeAuthorized,
    };
  }
  throw new Error("Persisted artifact version mismatch");
}

export function validateRoundArtifacts(
  input: RoundArtifactsInput,
): ValidatedRoundArtifacts {
  const artifacts = validatePersistedRoundArtifacts(input);
  if (artifacts.version === 2) {
    const verdict = input.verdictInput as RouteVerificationVerdictV2;
    assertVerifiedRouteVerdictV2(
      artifacts.bundle,
      verdict,
    );
    const projected = projectRouteQuoteV2(
      artifacts.bundle,
      verdict,
      artifacts.quote.priceAtomic,
      artifacts.bundle.validUntil,
    );
    if (!sameHash(commitment(projected), commitment(artifacts.quote))) {
      throw new Error("Quote verdict projection mismatch");
    }
  }
  return artifacts;
}
