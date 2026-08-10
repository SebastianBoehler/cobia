import type { DecisionBundle, StablecoinPolicy } from "@cobia/domain";
import { Check, CircleDollarSign, LockKeyhole, Route } from "lucide-react";
import { formatUnits } from "viem";
import { supportedAsset } from "../../lib/chain/supported-assets";
import styles from "./PurchasedRouteView.module.css";

export interface PurchasedRoute {
  id: string;
  requestId: string;
  quoteId: string;
  buyer: string;
  chainId: number;
  receiptHash: string;
  purchasedAt: string;
  policy: StablecoinPolicy;
  bundle: DecisionBundle;
}

function amountLabel(amountAtomic: bigint, decimals: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: decimals })
    .format(Number(formatUnits(amountAtomic, decimals)));
}

function shortHash(value: string): string {
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

function allocationLabel(route: PurchasedRoute, candidateId: string, bps: number): string {
  const asset = supportedAsset(route.policy.asset);
  const amount = BigInt(route.policy.principalAtomic) * BigInt(bps) / 10_000n;
  const prefix = `${amountLabel(amount, asset.decimals)} ${asset.displaySymbol}`;
  if (candidateId.startsWith("cash:")) return `${prefix} retained`;
  if (candidateId.startsWith("aave-v3:")) return `${prefix} supplied to Aave V3`;
  return `${prefix} allocated to ${candidateId}`;
}

export function PurchasedRouteView({ route }: { route: PurchasedRoute }) {
  const asset = supportedAsset(route.policy.asset);
  return (
    <section className={styles.shell} aria-label="Purchased route">
      <header className={styles.header}>
        <div>
          <span className={styles.icon}><Route size={19} /></span>
          <div>
            <h2>Your purchased route</h2>
            <p>{amountLabel(BigInt(route.policy.principalAtomic), asset.decimals)} {asset.displaySymbol} · X Layer</p>
          </div>
        </div>
        <span className={styles.status}><LockKeyhole size={14} /> Balance check required</span>
      </header>

      <div className={styles.summary}>
        <strong>{(route.bundle.expectedNetApyBps / 100).toFixed(2)}% expected net APY</strong>
        <span>Solver: {route.bundle.solverId}</span>
      </div>

      <ol className={styles.steps} aria-label="Purchased route steps">
        {route.bundle.allocations.map((allocation, index) => (
          <li key={allocation.candidateId}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <Check size={16} />
            <div>
              <strong>{allocationLabel(route, allocation.candidateId, allocation.bps)}</strong>
              <small>{(allocation.bps / 100).toFixed(0)}% of requested capital</small>
            </div>
          </li>
        ))}
      </ol>

      <footer className={styles.receipt}>
        <CircleDollarSign size={16} />
        <span>Payment receipt {shortHash(route.receiptHash)}</span>
        <span>Bundle {shortHash(route.quoteId)}</span>
      </footer>
    </section>
  );
}
