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
  valuations: PurchasedRouteV2["snapshot"]["valuations"],
): PresentedStep[] {
  return leg.actions.map((action, index) => {
    if (action.kind === "uniswap-v3-exact-input") {
      return {
        key: `${leg.id}:${index}:${action.opportunityId}`,
        label: `Swap ${formattedAssetAmount(leg.inputAtomic, action.tokenIn, valuations)} for at least ${formattedAssetAmount(action.minimumOutputAtomic, action.tokenOut, valuations)} via Uniswap V3`,
        detail: `Quoted output ${formattedAssetAmount(action.quotedOutputAtomic, action.tokenOut, valuations)} · ${action.opportunityId}`,
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
  const steps: PresentedStep[] = [{
    key: "retained",
    label: `${formattedAssetAmount(
      route.bundle.routePlan.retainedAtomic,
      route.bundle.routePlan.inputAsset,
      route.snapshot.valuations,
    )} retained`,
    detail: "Risk buffer selected in the signed intent",
  }, ...route.bundle.routePlan.legs.flatMap((leg) =>
    actionSteps(leg, route.snapshot.valuations))];

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
