import type { PersistedSnapshot, PersistedStablecoinPolicy } from "@cobia/domain";
import { ShieldCheck } from "lucide-react";
import type { PublicRouteQuote } from "../../lib/markets/active-quotes";
import { protocolLabelV2 } from "../../lib/markets/protocol-labels";
import { ShareProofActions } from "../share/ShareProofActions";
import styles from "./CompetitionView.module.css";

function shortHash(value: string): string {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function snapshotDescription(snapshot: PersistedSnapshot | null): string {
  if (!snapshot || snapshot.version !== 2) {
    return "Pinned X Layer opportunity data is not available yet. Estimates remain unverified until a snapshot is present.";
  }
  const protocols = new Set(snapshot.opportunities.map(({ kind }) => protocolLabelV2(kind)));
  if (protocols.size === 0) return "The pinned X Layer snapshot contains no eligible protocol opportunities.";
  const names = [...protocols].join(" and ");
  return `Pinned ${names} opportunity data ${protocols.size === 1 ? "was" : "were"} read at one X Layer block.`;
}

export function CompetitionMarketHeader({
  requestId,
  state,
  policy,
  snapshot,
  quotes,
}: {
  requestId: string;
  state: string;
  policy: PersistedStablecoinPolicy;
  snapshot: PersistedSnapshot | null;
  quotes: PublicRouteQuote[];
}) {
  const first = quotes[0];
  return (
    <header className={styles.intro}>
      <div>
        <span className={styles.eyebrow}>Solver market · X Layer</span>
        <h1>{quotes.length > 0 ? "Best verified route" : "Route search complete"}</h1>
        <p>{policy.version === 1
          ? "The signed Aave allocation was recomputed from its pinned snapshot."
          : snapshotDescription(snapshot)} Compare the enforced route outcome with the estimate before choosing.</p>
      </div>
      <div className={styles.introMeta}>
        <div className={styles.facts}>
          <span><ShieldCheck size={15} /> {state.replaceAll("_", " ")}</span>
          <span>{snapshot ? `Block ${snapshot.blockNumber}` : "Snapshot pending"}</span>
          <span>Intent {shortHash(requestId)}</span>
        </div>
        <ShareProofActions
          requestId={requestId}
          summary={first?.version === 2
            ? `${(first.estimatedPreGasApyBps / 100).toFixed(2)}% estimated pre-gas APY · route authorized`
            : "public solver route proof"}
        />
      </div>
    </header>
  );
}
