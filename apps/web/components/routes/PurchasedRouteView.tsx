import { allocateAtomicByBps, routeObjectiveV2 } from "@cobia/domain";
import { Check, CircleDollarSign, Info, LockKeyhole, Route } from "lucide-react";
import { supportedAsset } from "../../lib/chain/supported-assets";
import { PurchasedRoutePlanV2 } from "./PurchasedRoutePlanV2";
import { PurchasedRouteExecution } from "./PurchasedRouteExecution";
import { RouteOutcomePreview } from "./RouteOutcomePreview";
import type {
  PurchasedRoute,
  PurchasedRouteV1,
  PurchasedRouteV2,
} from "./purchased-route";
import { amountLabel } from "./purchased-route-format";
import styles from "./PurchasedRouteView.module.css";
import { ShareProofActions } from "../share/ShareProofActions";

export type { PurchasedRoute } from "./purchased-route";

function shortHash(value: string): string {
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

function allocationLabel(
  route: PurchasedRouteV1,
  candidateId: string,
  amountAtomic: string,
): string {
  const asset = supportedAsset(route.policy.asset);
  const prefix = `${amountLabel(BigInt(amountAtomic), asset.decimals)} ${asset.displaySymbol}`;
  if (candidateId.startsWith("cash:")) return `${prefix} retained`;
  if (candidateId.startsWith("aave-v3:")) return `${prefix} quoted for Aave V3`;
  return `${prefix} allocated to ${candidateId}`;
}

function PurchasedAllocationsV1({ route }: { route: PurchasedRouteV1 }) {
  const allocations = allocateAtomicByBps(
    route.policy.principalAtomic,
    route.bundle.allocations,
  );
  return (
    <ol className={styles.steps} aria-label="Quoted allocation">
      {allocations.map((allocation, index) => (
        <li key={allocation.candidateId}>
          <span>{String(index + 1).padStart(2, "0")}</span>
          <Check size={16} />
          <div>
            <strong>{allocationLabel(route, allocation.candidateId, allocation.amountAtomic)}</strong>
            <small>{(allocation.bps / 100).toFixed(0)}% of requested capital</small>
          </div>
        </li>
      ))}
    </ol>
  );
}

function isPurchasedRouteV2(route: PurchasedRoute): route is PurchasedRouteV2 {
  return route.policy.version === 2
    && route.snapshot.version === 2
    && route.bundle.version === 2;
}

export function PurchasedRouteView({ route }: { route: PurchasedRoute }) {
  const asset = supportedAsset(route.policy.asset);
  const v2 = isPurchasedRouteV2(route);
  const objective = v2 ? routeObjectiveV2(route.policy) : undefined;
  const v2Summary = objective?.kind === "swap"
    ? "Bounded atomic swap"
    : objective?.kind === "profit"
      ? "Bounded atomic profit route"
      : v2
        ? `${(route.bundle.estimatedPreGasApyBps / 100).toFixed(2)}% estimated pre-gas APY`
        : undefined;
  return (
    <section className={styles.shell} aria-label="Purchased route">
      <header className={styles.header}>
        <div>
          <span className={styles.icon}><Route size={19} /></span>
          <div>
            <h2>Your verified route</h2>
            <p>{amountLabel(BigInt(route.policy.principalAtomic), asset.decimals)} {asset.displaySymbol} · X Layer</p>
          </div>
        </div>
        <span className={styles.status}><LockKeyhole size={14} /> Principal unmoved</span>
      </header>

      <div className={styles.summary}>
        <strong>{v2
          ? v2Summary
          : `${(route.bundle.expectedNetApyBps / 100).toFixed(2)}% expected net APY`}</strong>
        <span>Quote signer: {route.bundle.solverId}</span>
      </div>

      {v2 ? <RouteOutcomePreview route={route} /> : null}

      {v2
        ? <PurchasedRoutePlanV2 route={route} />
        : <PurchasedAllocationsV1 route={route} />}

      {v2 ? <PurchasedRouteExecution route={route} /> : (
        <aside className={styles.nextStep} aria-label="Purchased quote next step">
          <Info aria-hidden="true" size={18} />
          <div>
            <strong>What happens next?</strong>
            <p>This legacy quote is inspectable but has no executable route plan.</p>
          </div>
        </aside>
      )}

      <footer className={styles.receipt}>
        <CircleDollarSign size={16} />
        <span>Payment receipt {shortHash(route.receiptHash)}</span>
        <span>Bundle {shortHash(route.quoteId)}</span>
      </footer>
      <ShareProofActions
        requestId={route.requestId}
        summary={v2
          ? objective?.kind === "earn"
            ? `${(route.bundle.estimatedPreGasApyBps / 100).toFixed(2)}% estimated pre-gas APY · route authorized`
            : `${objective?.kind === "swap" ? "Atomic swap" : "Profit route"} · signed minimum · route authorized`
          : "verified route proof"}
      />
    </section>
  );
}
