import {
  RouteBundleV2Schema,
  RouteSnapshotV2Schema,
  StablecoinPolicyV2Schema,
  compareRouteEconomicsV2,
  projectRouteQuoteV2,
  verifyRouteBundleV2,
  type RouteBundleV2,
  type RouteQuoteV2,
  type RouteSnapshotV2,
  type RouteVerificationVerdictV2,
  type StablecoinPolicyV2,
} from "@cobia/domain";
import type { RouteSolverV2 } from "@cobia/solvers";
import { isAddressEqual, type Hash } from "viem";

type MarketStateV2 = "quotes_ready" | "partial" | "failed";

interface RouteMarketDependenciesV2 {
  captureSnapshot(policy: StablecoinPolicyV2): Promise<RouteSnapshotV2>;
  solvers: readonly RouteSolverV2[];
  saveSnapshot(snapshot: RouteSnapshotV2): Promise<void>;
  saveQuote(
    bundle: RouteBundleV2,
    verdict: RouteVerificationVerdictV2,
    quote: RouteQuoteV2,
  ): Promise<void>;
  finish(state: MarketStateV2): Promise<void>;
  expectedAdapterRegistryHash: Hash;
  nowSec(): number;
  quotePriceAtomic: string;
  timeoutMs?: number;
}

interface SolverFailureV2 {
  solverId: string;
  message: string;
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : "Solver failed";
}

function immutableSnapshot(input: RouteSnapshotV2): RouteSnapshotV2 {
  const snapshot = RouteSnapshotV2Schema.parse(input);
  for (const valuation of snapshot.valuations) Object.freeze(valuation);
  for (const opportunity of snapshot.opportunities) Object.freeze(opportunity);
  Object.freeze(snapshot.scannedAdapters);
  Object.freeze(snapshot.valuations);
  Object.freeze(snapshot.opportunities);
  return Object.freeze(snapshot);
}

function immutablePolicy(input: StablecoinPolicyV2): StablecoinPolicyV2 {
  const policy = StablecoinPolicyV2Schema.parse(input);
  Object.freeze(policy.allowedAdapters);
  Object.freeze(policy.allowedOutputAssets);
  return Object.freeze(policy);
}

function assertUniqueSolverIds(solvers: readonly RouteSolverV2[]): void {
  if (new Set(solvers.map(({ id }) => id)).size !== solvers.length) {
    throw new Error("Configured solver ids must be unique");
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Solver timed out")), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function runRouteMarketV2(
  rawPolicy: StablecoinPolicyV2,
  dependencies: RouteMarketDependenciesV2,
): Promise<{ quotes: RouteQuoteV2[]; failures: SolverFailureV2[] }> {
  if (dependencies.solvers.length === 0) throw new Error("At least one solver is required");
  assertUniqueSolverIds(dependencies.solvers);
  const policy = immutablePolicy(rawPolicy);
  const snapshot = immutableSnapshot(await dependencies.captureSnapshot(policy));
  await dependencies.saveSnapshot(snapshot);
  const solverNowSec = dependencies.nowSec();
  const attempts = await Promise.allSettled(dependencies.solvers.map((solver) =>
    withTimeout(
      Promise.resolve().then(() => solver.solve({
        policy,
        snapshot,
        nowSec: solverNowSec,
      })),
      dependencies.timeoutMs ?? 90_000,
    )
  ));
  const verificationNowSec = dependencies.nowSec();

  const rankedQuotes: { bundle: RouteBundleV2; quote: RouteQuoteV2 }[] = [];
  const failures: SolverFailureV2[] = [];
  for (const [index, attempt] of attempts.entries()) {
    const solver = dependencies.solvers[index]!;
    if (attempt.status === "rejected") {
      failures.push({ solverId: solver.id, message: errorMessage(attempt.reason) });
      continue;
    }
    let bundle: RouteBundleV2;
    let verdict: RouteVerificationVerdictV2;
    let quote: RouteQuoteV2;
    try {
      bundle = RouteBundleV2Schema.parse(attempt.value);
      if (
        bundle.solverId !== solver.id ||
        !isAddressEqual(bundle.solverAddress, solver.address)
      ) {
        throw new Error("Solver returned another identity");
      }
      if (bundle.routePlan.legs.length === 0) {
        throw new Error("Solver returned no actionable route");
      }
      verdict = await verifyRouteBundleV2(
        policy,
        snapshot,
        bundle,
        solver.address,
        { expectedAdapterRegistryHash: dependencies.expectedAdapterRegistryHash },
        verificationNowSec,
      );
      quote = projectRouteQuoteV2(
        bundle,
        verdict,
        dependencies.quotePriceAtomic,
        bundle.validUntil,
      );
    } catch (error) {
      failures.push({ solverId: solver.id, message: errorMessage(error) });
      continue;
    }
    await dependencies.saveQuote(bundle, verdict, quote);
    if (verdict.routeAuthorized) {
      rankedQuotes.push({ bundle, quote });
    } else {
      failures.push({
        solverId: solver.id,
        message: `Bundle rejected: ${verdict.errorCodes.join(", ")}`,
      });
    }
  }

  rankedQuotes.sort((left, right) =>
    compareRouteEconomicsV2(
      policy,
      snapshot,
      left.bundle.routePlan,
      right.bundle.routePlan,
    ) || left.quote.solverId.localeCompare(right.quote.solverId)
  );
  const quotes = rankedQuotes.map(({ quote }) => quote);
  await dependencies.finish(
    quotes.length === 0 ? "failed" : failures.length > 0 ? "partial" : "quotes_ready",
  );
  return { quotes, failures };
}
