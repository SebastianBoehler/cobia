import { Check } from "lucide-react";
import type { RouteLegV2 } from "@cobia/domain";
import type { PurchasedRouteV2 } from "./purchased-route";
import { formattedAssetAmount } from "./purchased-route-format";
import styles from "./PurchasedRouteView.module.css";

interface PresentedStep {
  key: string;
  label: string;
  detail: string;
}

function actionSteps(
  leg: RouteLegV2,
  snapshot: PurchasedRouteV2["snapshot"],
): PresentedStep[] {
  const { valuations } = snapshot;
  return leg.actions.map((action, index) => {
    if (action.kind === "uniswap-v3-exact-input") {
      return {
        key: `${leg.id}:${index}:${action.opportunityId}`,
        label: `Swap ${formattedAssetAmount(leg.inputAtomic, action.tokenIn, valuations)} for at least ${formattedAssetAmount(action.minimumOutputAtomic, action.tokenOut, valuations)} via Uniswap V3`,
        detail: `Quoted output ${formattedAssetAmount(action.quotedOutputAtomic, action.tokenOut, valuations)} · ${action.opportunityId}`,
      };
    }
    if (action.kind === "uniswap-v3-balance-swap") {
      return {
        key: `${leg.id}:${index}:${action.opportunityId}`,
        label: `Balance-swap ${formattedAssetAmount(action.inputAtomic, action.tokenIn, valuations)} for at least ${formattedAssetAmount(action.minimumOutputAtomic, action.tokenOut, valuations)}`,
        detail: `One-sided LP preparation via Uniswap V3 · quoted ${formattedAssetAmount(action.quotedOutputAtomic, action.tokenOut, valuations)}`,
      };
    }
    if (action.kind === "uniswap-v3-full-range-mint") {
      const opportunity = snapshot.opportunities.find((candidate) =>
        candidate.kind === "uniswap-v3-full-range-lp" &&
        candidate.id === action.opportunityId);
      const feeHistory = opportunity?.kind === "uniswap-v3-full-range-lp"
        ? `Historical fee sample ${(opportunity.historicalFeeApyBps / 100).toFixed(2)}% annualized over ${(opportunity.lookbackSeconds / 3_600).toFixed(0)}h; not guaranteed`
        : "Historical fee estimate unavailable";
      return {
        key: `${leg.id}:${index}:${action.opportunityId}`,
        label: `Mint a full-range ${formattedAssetAmount(action.amount0DesiredAtomic, action.token0, valuations)} + ${formattedAssetAmount(action.amount1DesiredAtomic, action.token1, valuations)} Uniswap V3 position`,
        detail: `Owner-held NFT · 1 bp pool · minimum liquidity ${action.minimumLiquidity} · ${feeHistory}`,
      };
    }
    const priorAction = index > 0 ? leg.actions[index - 1] : undefined;
    if (priorAction?.kind === "uniswap-v3-exact-input") {
      return {
        key: `${leg.id}:${index}:${action.opportunityId}`,
        label: `Supply up to the quoted ${formattedAssetAmount(priorAction.quotedOutputAtomic, action.asset, valuations)} to Aave V3`,
        detail: `${action.opportunityId} · favorable-fill surplus remains in your wallet`,
      };
    }
    return {
      key: `${leg.id}:${index}:${action.opportunityId}`,
      label: `Supply ${formattedAssetAmount(leg.inputAtomic, action.asset, valuations)} to Aave V3`,
      detail: `${action.opportunityId} · consumes the complete prior amount`,
    };
  });
}

export function PurchasedRoutePlanV2({ route }: { route: PurchasedRouteV2 }) {
  const retained = BigInt(route.bundle.routePlan.retainedAtomic);
  const steps: PresentedStep[] = [{
    key: "retained",
    label: `${formattedAssetAmount(
      route.bundle.routePlan.retainedAtomic,
      route.bundle.routePlan.inputAsset,
      route.snapshot.valuations,
    )} retained`,
    detail: retained > 0n
      ? `Undeployed by the signed ${(route.policy.protocolExposureBps / 100).toFixed(0)}% protocol-exposure limit; this amount earns no route yield`
      : "No retained buffer; the signed intent permits full deployment",
  }, ...route.bundle.routePlan.legs.flatMap((leg) =>
    actionSteps(leg, route.snapshot))];

  return (
    <ol className={styles.steps} aria-label="Purchased route plan">
      {steps.map((step, index) => (
        <li key={step.key}>
          <span>{String(index + 1).padStart(2, "0")}</span>
          <Check size={16} />
          <div>
            <strong>{step.label}</strong>
            <small>{step.detail}</small>
          </div>
        </li>
      ))}
    </ol>
  );
}
