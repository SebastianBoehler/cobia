import { ArrowRight, CircleAlert, ShieldCheck } from "lucide-react";
import { routeObjectiveV2 } from "@cobia/domain";
import { formatUsdE8, projectRouteEconomicsForHorizon } from "../../lib/markets/route-economics";
import type { PurchasedRouteV2 } from "./purchased-route";
import { formattedAssetAmount } from "./purchased-route-format";
import styles from "./PurchasedRouteView.module.css";

interface PositionOutcome {
  expected: string;
  minimum: string;
}

function positionOutcome(route: PurchasedRouteV2): PositionOutcome {
  const leg = route.bundle.routePlan.legs[0];
  const valuations = route.snapshot.valuations;
  if (!leg) return { expected: "No protocol position", minimum: "Principal remains in wallet" };
  const [first, second] = leg.actions;
  if (first.kind === "aave-v3-supply") {
    const expected = formattedAssetAmount(leg.inputAtomic, first.asset, valuations);
    const minimum = (BigInt(leg.inputAtomic) > 1n ? BigInt(leg.inputAtomic) - 1n : 1n).toString();
    return {
      expected: `≈ ${expected} in an Aave interest-bearing position`,
      minimum: `${formattedAssetAmount(minimum, first.asset, valuations)} position increase`,
    };
  }
  if (second?.kind === "aave-v3-supply") {
    const expected = formattedAssetAmount(first.quotedOutputAtomic, second.asset, valuations);
    const minimumAtomic = BigInt(first.minimumOutputAtomic) > 1n
      ? BigInt(first.minimumOutputAtomic) - 1n : 1n;
    return {
      expected: `≈ ${expected} in an Aave interest-bearing position`,
      minimum: `${formattedAssetAmount(minimumAtomic.toString(), second.asset, valuations)} position increase`,
    };
  }
  if (second?.kind === "uniswap-v3-full-range-mint") {
    return {
      expected: "One owner-held Uniswap V3 LP NFT",
      minimum: `Liquidity ≥ ${second.minimumLiquidity}`,
    };
  }
  const finalSwap = (second?.kind === "uniswap-v3-exact-input" ||
    second?.kind === "curve-stableswap-ng-exact-input")
    ? second
    : (first.kind === "uniswap-v3-exact-input" ||
      first.kind === "curve-stableswap-ng-exact-input") && !second
      ? first
      : undefined;
  if (finalSwap) {
    return {
      expected: `Expected ${formattedAssetAmount(
        finalSwap.quotedOutputAtomic, finalSwap.tokenOut, valuations,
      )} in wallet`,
      minimum: `At least ${formattedAssetAmount(
        finalSwap.minimumOutputAtomic, finalSwap.tokenOut, valuations,
      )} received`,
    };
  }
  return { expected: "Bounded protocol position", minimum: "Signed route constraints" };
}

export function RouteOutcomePreview({ route }: { route: PurchasedRouteV2 }) {
  const objective = routeObjectiveV2(route.policy);
  const atomicOutcome = objective.kind !== "earn";
  const valuation = route.snapshot.valuations.find(({ asset }) =>
    asset.toLowerCase() === route.policy.asset.toLowerCase());
  if (!valuation) return null;
  const economics = projectRouteEconomicsForHorizon({
    principalAtomic: route.policy.principalAtomic,
    decimals: valuation.decimals,
    priceUsdE8: valuation.priceUsdE8,
    estimatedPreGasApyBps: route.bundle.estimatedPreGasApyBps,
    horizonDays: route.bundle.routePlan.horizonDays,
  });
  const outcome = positionOutcome(route);
  const input = formattedAssetAmount(
    route.policy.principalAtomic,
    route.policy.asset,
    route.snapshot.valuations,
  );
  const retained = formattedAssetAmount(
    route.bundle.routePlan.retainedAtomic,
    route.bundle.routePlan.inputAsset,
    route.snapshot.valuations,
  );
  return (
    <section className={styles.outcome} aria-labelledby="route-outcome-title">
      <div className={styles.outcomeHeader}>
        <div>
          <span>Balance simulation</span>
          <h3 id="route-outcome-title">Expected wallet effect</h3>
        </div>
        <strong className={!atomicOutcome && economics.status === "not-economical"
          ? styles.economicsWarning : styles.economicsPositive}>
          {!atomicOutcome && economics.status === "not-economical"
            ? <CircleAlert size={14} /> : <ShieldCheck size={14} />}
          {atomicOutcome ? "Signed bound enforced" : economics.status === "not-economical"
            ? "Not economical at this size" : "Positive before gas"}
        </strong>
      </div>
      <div className={styles.balanceFlow}>
        <div><small>Before</small><strong>{input} in wallet</strong></div>
        <ArrowRight aria-hidden="true" size={18} />
        <div><small>Expected after route</small><strong>{outcome.expected}</strong></div>
      </div>
      <dl className={styles.outcomeMetrics}>
        <div><dt>Minimum onchain outcome</dt><dd>{outcome.minimum}</dd></div>
        <div><dt>Retained in wallet</dt><dd>{retained}</dd></div>
        {atomicOutcome ? <>
          <div><dt>Forecast result</dt><dd>{outcome.expected}</dd></div>
          <div><dt>Execution</dt><dd>Final simulation required</dd></div>
        </> : <>
          <div><dt>{route.bundle.routePlan.horizonDays}-day estimated gross yield</dt><dd>{formatUsdE8(economics.estimatedGrossYieldUsdE8)}</dd></div>
          <div><dt>Reveal fee</dt><dd>{formatUsdE8(economics.revealFeeUsdE8)}</dd></div>
        </>}
      </dl>
      {atomicOutcome ? <p className={styles.economicsNote}>
        The minimum is encoded in the signed route. The forecast is re-simulated before your wallet can submit it.
      </p> : <p className={styles.economicsNote}>
        Net before gas {formatUsdE8(economics.netBeforeGasUsdE8)}. Gas is estimated again before execution.
        {economics.breakEvenPrincipalUsdE8
          ? ` Break-even principal before gas is about ${formatUsdE8(economics.breakEvenPrincipalUsdE8)} at this rate and horizon.`
          : " This route has no positive yield estimate."}
      </p>}
    </section>
  );
}
