import type { PersistedSnapshot, PersistedStablecoinPolicy } from "@cobia/domain";
import type { PublicRouteQuote } from "../../lib/markets/active-quotes";
import { projectRouteEconomicsForHorizon } from "../../lib/markets/route-economics";

export function quoteEconomics(input: {
  policy: PersistedStablecoinPolicy;
  snapshot: PersistedSnapshot | null;
  quote: PublicRouteQuote;
}) {
  if (input.policy.version !== 2 || input.snapshot?.version !== 2 || input.quote.version !== 2) {
    return undefined;
  }
  const valuation = input.snapshot.valuations.find(({ asset }) => asset === input.policy.asset);
  if (!valuation) return undefined;
  return {
    ...projectRouteEconomicsForHorizon({
      principalAtomic: input.policy.principalAtomic,
      decimals: valuation.decimals,
      priceUsdE8: valuation.priceUsdE8,
      estimatedPreGasApyBps: input.quote.estimatedPreGasApyBps,
      horizonDays: input.policy.horizonDays,
    }),
    horizonDays: input.policy.horizonDays,
  };
}
