import {
  commitment,
  verifyBundle,
  verifyRouteBundleV2,
  type DecisionBundle,
  type MarketSnapshot,
  type RouteBundleV2,
  type RouteQuote,
  type RouteQuoteV2,
  type RouteSnapshotV2,
  type RouteVerificationVerdictV2,
  type StablecoinPolicy,
  type StablecoinPolicyV2,
  type VerificationVerdict,
} from "@cobia/domain";
import { isAddressEqual, type Address, type Hash } from "viem";
import { registryHash } from "../adapters/registry";
import {
  MAX_PAYMENT_WINDOW_SECONDS,
  PaymentTermsSchema,
  buildPaymentTerms,
} from "./terms";

interface PaymentContextBase {
  quoteCreatedAt: Date;
}

export interface AuthoritativePaymentContextV1 extends PaymentContextBase {
  policy: StablecoinPolicy;
  snapshot: MarketSnapshot;
  bundle: DecisionBundle;
  verdict: VerificationVerdict;
  quote: RouteQuote;
}

export interface AuthoritativePaymentContextV2 extends PaymentContextBase {
  policy: StablecoinPolicyV2;
  snapshot: RouteSnapshotV2;
  bundle: RouteBundleV2;
  verdict: {
    bundleHash: Hash;
    routeAuthorized: boolean;
    errorCodes: readonly string[];
    recomputedPreGasApyBps: number;
  };
  quote: RouteQuoteV2;
}

export type AuthoritativePaymentContext =
  | AuthoritativePaymentContextV1
  | AuthoritativePaymentContextV2;

interface PaymentTermsConfig {
  COBIA_TREASURY: Address;
  PAYMENT_REALM: string;
}

function sameHash(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function sameErrors(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length
    && left.every((code, index) => code === right[index]);
}

export function paymentCutoffSec(context: AuthoritativePaymentContext): number {
  const capturedAtSec = Math.floor(Date.parse(context.snapshot.capturedAt) / 1_000);
  const issuedAtSec = Math.floor(context.quoteCreatedAt.getTime() / 1_000);
  return Math.min(
    context.quote.validUntil,
    context.bundle.validUntil,
    context.policy.deadline,
    capturedAtSec + context.policy.maxSnapshotAgeSec,
    issuedAtSec + MAX_PAYMENT_WINDOW_SECONDS,
  );
}

export function buildContextPaymentTerms(
  context: AuthoritativePaymentContext,
  config: PaymentTermsConfig,
) {
  return buildPaymentTerms({
    quote: context.quote,
    solver: context.quote.solverAddress,
    treasury: config.COBIA_TREASURY,
    realm: config.PAYMENT_REALM,
    issuedAt: Math.floor(context.quoteCreatedAt.getTime() / 1_000),
    cutoff: paymentCutoffSec(context),
  });
}

export function validateContextPaymentTerms(
  context: AuthoritativePaymentContext,
  value: unknown,
) {
  const terms = PaymentTermsSchema.parse(value);
  if (
    terms.externalId.toLowerCase() !== context.quote.quoteId.toLowerCase()
    || terms.amount !== context.quote.priceAtomic
    || !isAddressEqual(terms.recipient, context.quote.solverAddress)
    || terms.issuedAt !== Math.floor(context.quoteCreatedAt.getTime() / 1_000)
    || terms.expiresAt !== paymentCutoffSec(context)
  ) throw new Error("Stored payment terms do not match the selected quote");
  return terms;
}

function commonContextMatches(
  context: AuthoritativePaymentContext,
  quoteId: Hash,
): boolean {
  const bundleHash = commitment(context.bundle);
  return context.policy.version === context.snapshot.version
    && context.policy.version === context.bundle.version
    && context.policy.version === context.quote.version
    && context.policy.requestId === context.snapshot.requestId
    && context.policy.requestId === context.bundle.requestId
    && context.policy.requestId === context.quote.requestId
    && context.snapshot.chainId === context.policy.executionChainId
    && sameHash(context.bundle.policyHash, commitment(context.policy))
    && sameHash(context.bundle.snapshotHash, commitment(context.snapshot))
    && sameHash(bundleHash, quoteId)
    && sameHash(context.quote.quoteId, quoteId)
    && sameHash(context.quote.bundleHash, quoteId)
    && context.quote.solverId === context.bundle.solverId
    && isAddressEqual(context.quote.solverAddress, context.bundle.solverAddress);
}

function legacyProjectionMatches(
  context: AuthoritativePaymentContextV1,
  fresh: VerificationVerdict,
): boolean {
  const stored = context.verdict;
  return sameHash(stored.bundleHash, fresh.bundleHash)
    && stored.executable === fresh.executable
    && stored.recomputedNetApyBps === fresh.recomputedNetApyBps
    && stored.riskPenaltyBps === fresh.riskPenaltyBps
    && stored.score === fresh.score
    && sameErrors(stored.errorCodes, fresh.errorCodes)
    && context.quote.verification.executable === fresh.executable
    && context.quote.expectedNetApyBps === fresh.recomputedNetApyBps
    && context.quote.verification.score === fresh.score
    && sameErrors(context.quote.verification.errorCodes, fresh.errorCodes);
}

function routeProjectionMatches(
  context: AuthoritativePaymentContextV2,
  fresh: RouteVerificationVerdictV2,
): boolean {
  const stored = context.verdict;
  return sameHash(stored.bundleHash, fresh.bundleHash)
    && stored.routeAuthorized === fresh.routeAuthorized
    && stored.recomputedPreGasApyBps === fresh.recomputedPreGasApyBps
    && sameErrors(stored.errorCodes, fresh.errorCodes)
    && context.quote.authorization.routeAuthorized === fresh.routeAuthorized
    && context.quote.estimatedPreGasApyBps === fresh.recomputedPreGasApyBps
    && sameErrors(context.quote.authorization.errorCodes, fresh.errorCodes);
}

async function verifyPaymentContext(
  context: AuthoritativePaymentContext,
  quoteId: Hash,
  nowSec: number,
  registryAuthority: "current" | "settled-snapshot",
) {
  if (!commonContextMatches(context, quoteId) || paymentCutoffSec(context) <= nowSec) {
    throw new Error("Selected bundle is not executable at the settlement time");
  }
  if (context.policy.version === 1) {
    const legacy = context as AuthoritativePaymentContextV1;
    const fresh = await verifyBundle(
      legacy.policy,
      legacy.snapshot,
      legacy.bundle,
      legacy.quote.solverAddress,
      nowSec,
    );
    if (!fresh.executable || !legacyProjectionMatches(legacy, fresh)) {
      throw new Error("Selected bundle is not executable at the settlement time");
    }
    return fresh;
  }

  const route = context as AuthoritativePaymentContextV2;
  const fresh = await verifyRouteBundleV2(
    route.policy,
    route.snapshot,
    route.bundle,
    route.quote.solverAddress,
    { expectedAdapterRegistryHash: registryAuthority === "current"
      ? registryHash
      : route.snapshot.adapterRegistryHash },
    nowSec,
  );
  if (!fresh.routeAuthorized || !routeProjectionMatches(route, fresh)) {
    throw new Error("Selected bundle is not executable at the settlement time");
  }
  return fresh;
}

export function verifyCurrentExecutablePaymentContext(
  context: AuthoritativePaymentContext,
  quoteId: Hash,
  nowSec: number,
) {
  return verifyPaymentContext(context, quoteId, nowSec, "current");
}

// Reveal-only recovery rechecks an already settled artifact under the registry
// authority captured in its snapshot. It deliberately returns no execution verdict.
export async function verifySettledRevealPaymentContext(
  context: AuthoritativePaymentContext,
  quoteId: Hash,
  settledAtSec: number,
): Promise<void> {
  await verifyPaymentContext(context, quoteId, settledAtSec, "settled-snapshot");
}
