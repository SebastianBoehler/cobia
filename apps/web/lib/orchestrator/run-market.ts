import type {
  DecisionBundle,
  MarketSnapshot,
  RouteQuote,
  StablecoinPolicy,
  VerificationVerdict,
} from "@cobia/domain";
import type { Solver } from "@cobia/solvers";

type MarketState = "quotes_ready" | "partial" | "failed";

interface MarketDependencies {
  captureSnapshot(policy: StablecoinPolicy): Promise<MarketSnapshot>;
  solvers: readonly Solver[];
  saveSnapshot(snapshot: MarketSnapshot): Promise<void>;
  saveQuote(
    bundle: DecisionBundle,
    verdict: VerificationVerdict,
    quote: RouteQuote,
  ): Promise<void>;
  finish(state: MarketState): Promise<void>;
  verify(
    policy: StablecoinPolicy,
    snapshot: MarketSnapshot,
    bundle: DecisionBundle,
    expectedSolver: Solver["address"],
    nowSec: number,
  ): Promise<VerificationVerdict>;
  project(
    bundle: DecisionBundle,
    verdict: VerificationVerdict,
    priceAtomic: string,
    validUntil: number,
  ): RouteQuote;
  nowSec(): number;
  quotePriceAtomic: string;
  timeoutMs?: number;
}

interface SolverFailure {
  solverId: string;
  message: string;
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : "Solver failed";
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

export async function runQuoteMarket(
  policy: StablecoinPolicy,
  dependencies: MarketDependencies,
): Promise<{ quotes: RouteQuote[]; failures: SolverFailure[] }> {
  if (dependencies.solvers.length === 0) throw new Error("At least one solver is required");
  const snapshot = await dependencies.captureSnapshot(policy);
  await dependencies.saveSnapshot(snapshot);
  const nowSec = dependencies.nowSec();
  const attempts = await Promise.allSettled(
    dependencies.solvers.map((solver) =>
      withTimeout(
        solver.solve({ policy, snapshot, nowSec }),
        dependencies.timeoutMs ?? 90_000,
      ),
    ),
  );

  const quotes: RouteQuote[] = [];
  const failures: SolverFailure[] = [];
  for (const [index, attempt] of attempts.entries()) {
    const solver = dependencies.solvers[index];
    if (attempt.status === "rejected") {
      failures.push({ solverId: solver.id, message: errorMessage(attempt.reason) });
      continue;
    }
    const verdict = await dependencies.verify(
      policy,
      snapshot,
      attempt.value,
      solver.address,
      nowSec,
    );
    const quote = dependencies.project(
      attempt.value,
      verdict,
      dependencies.quotePriceAtomic,
      attempt.value.validUntil,
    );
    await dependencies.saveQuote(attempt.value, verdict, quote);
    quotes.push(quote);
  }

  quotes.sort((left, right) =>
    right.verification.score - left.verification.score ||
    left.solverId.localeCompare(right.solverId),
  );
  const state: MarketState =
    quotes.length === 0 ? "failed" : failures.length > 0 ? "partial" : "quotes_ready";
  await dependencies.finish(state);
  return { quotes, failures };
}
